from __future__ import annotations

import hashlib
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging_setup import get_logger
from app.ingestion.parser import ParsedEvent, _parse_iso_utc, normalize_event, parse_eve_line
from app.models import Event, IngestionCheckpoint

log = get_logger(module="eve_reader")


AnomalyScorer = Callable[[ParsedEvent], tuple[float | None, dict | None]]


def _get_inode(path: str) -> Optional[int]:
    try:
        st = os.stat(path)
    except (FileNotFoundError, PermissionError, OSError):
        return None
    # On Windows, st_ino may be 0. Use stable file creation metadata instead of
    # size/mtime, which changes on every append. Python's built-in hash is
    # process-randomized and cannot be persisted in the checkpoint.
    ino = st.st_ino
    if ino == 0:
        created_ns = getattr(
            st,
            "st_birthtime_ns",
            int(getattr(st, "st_birthtime", st.st_ctime) * 1e9),
        )
        identity = f"{os.path.abspath(path)}:{st.st_dev}:{created_ns}"
        digest = hashlib.blake2b(identity.encode("utf-8"), digest_size=8).digest()
        return int.from_bytes(digest, "big") & 0x7FFFFFFFFFFFFFFF
    return int(ino)


def _load_checkpoint(db: Session, path: str) -> tuple[int, Optional[int]]:
    cp = db.get(IngestionCheckpoint, path)
    if cp is None:
        return 0, None
    return cp.last_offset or 0, cp.last_inode


def _save_checkpoint(db: Session, path: str, offset: int, inode: Optional[int]) -> None:
    cp = db.get(IngestionCheckpoint, path)
    if cp is None:
        cp = IngestionCheckpoint(path=path, last_offset=offset, last_inode=inode)
        db.add(cp)
    else:
        cp.last_offset = offset
        cp.last_inode = inode
    db.commit()


def _insert_event(
    db: Session,
    p: ParsedEvent,
    anomaly_score: float | None,
    anomaly_features: dict | None,
    refresh_existing: bool = False,
) -> bool:
    ev = Event(
        dedup_key=p.dedup_key,
        event_type=p.event_type,
        timestamp=p.timestamp,
        ingestion_time=datetime.now(timezone.utc).replace(tzinfo=None),
        src_ip=p.src_ip,
        dst_ip=p.dst_ip,
        src_port=p.src_port,
        dst_port=p.dst_port,
        protocol=p.protocol,
        app_proto=p.app_proto,
        flow_id=p.flow_id,
        signature=p.signature,
        signature_category=p.signature_category,
        severity=p.severity,
        raw=p.raw,
        anomaly_score=anomaly_score,
        anomaly_features=anomaly_features,
        acknowledged=False,
    )
    db.add(ev)
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        if refresh_existing:
            existing = db.scalar(select(Event).where(Event.dedup_key == p.dedup_key))
            if existing is not None:
                existing.timestamp = p.timestamp
                existing.raw = p.raw
                existing.ingestion_time = datetime.now(timezone.utc).replace(tzinfo=None)
                if anomaly_score is not None:
                    existing.anomaly_score = anomaly_score
                    existing.anomaly_features = anomaly_features
                db.commit()
        return False
    except Exception:
        db.rollback()
        raise


def _sample_timestamp_shift(path: str) -> timedelta:
    """Move bundled demo events so their relative ordering is recent at replay."""
    latest: datetime | None = None
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                raw = parse_eve_line(line)
                event = normalize_event(raw) if raw is not None else None
                if event is not None and (latest is None or event.timestamp > latest):
                    latest = event.timestamp
    except OSError:
        return timedelta(0)
    if latest is None:
        return timedelta(0)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return now - latest


def _rebase_sample_timestamps(event: ParsedEvent, shift: timedelta) -> None:
    """Keep raw demo timestamps consistent with the rebased event timestamp."""
    event.timestamp += shift
    event.raw["timestamp"] = event.timestamp.strftime("%Y-%m-%dT%H:%M:%S.%f+0000")
    flow = event.raw.get("flow")
    if isinstance(flow, dict):
        for key in ("start", "end"):
            value = flow.get(key)
            if isinstance(value, str):
                parsed = _parse_iso_utc(value)
                if parsed is not None:
                    flow[key] = (parsed + shift).strftime("%Y-%m-%dT%H:%M:%S.%f+0000")


def ingest_file(
    db: Session,
    path: str,
    anomaly_scorer: AnomalyScorer | None = None,
    start_offset: int | None = None,
    rebase_timestamps_to_now: bool = False,
) -> dict:
    """One-shot ingest a file (e.g. sample replay). Returns stats."""
    stats = {"read": 0, "parsed": 0, "normalized": 0, "inserted": 0, "duplicate": 0, "malformed": 0}
    timestamp_shift = _sample_timestamp_shift(path) if rebase_timestamps_to_now else timedelta(0)
    try:
        fh = open(path, "r", encoding="utf-8", errors="replace")
    except (FileNotFoundError, PermissionError, OSError) as e:
        log.warn("ingest_file_open_error", path=path, err=repr(e))
        return stats
    with fh as f:
        if start_offset:
            try:
                f.seek(start_offset)
            except OSError:
                pass
        for line in f:
            stats["read"] += 1
            raw = parse_eve_line(line)
            if raw is None:
                stats["malformed"] += 1
                continue
            stats["parsed"] += 1
            norm = normalize_event(raw)
            if norm is None:
                continue
            stats["normalized"] += 1
            if timestamp_shift:
                _rebase_sample_timestamps(norm, timestamp_shift)
            a_score, a_feat = (None, None)
            if anomaly_scorer is not None:
                try:
                    a_score, a_feat = anomaly_scorer(norm)
                except Exception as e:
                    log.warn("anomaly_score_error", err=repr(e))
            ok = _insert_event(
                db,
                norm,
                a_score,
                a_feat,
                refresh_existing=rebase_timestamps_to_now,
            )
            if ok:
                stats["inserted"] += 1
            else:
                stats["duplicate"] += 1
    return stats


class EveFileReader:
    """Robust tailer. Tolerates missing file, rotation, and transient errors."""

    def __init__(
        self,
        db_factory: Callable[[], Session],
        path: str | None = None,
        anomaly_scorer: AnomalyScorer | None = None,
        poll_interval: float | None = None,
        max_backoff: float | None = None,
    ) -> None:
        self._db_factory = db_factory
        self.path = path or settings.EVE_FILE_PATH
        self.anomaly_scorer = anomaly_scorer
        self.poll_interval = float(poll_interval if poll_interval is not None else settings.INGESTION_POLL_INTERVAL_SECONDS)
        self.max_backoff = float(max_backoff if max_backoff is not None else settings.INGESTION_READ_ERROR_MAX_BACKOFF_SECONDS)
        self._stop = False
        self._backoff = 0.0

    def stop(self) -> None:
        self._stop = True

    def run_forever(self) -> None:
        log.info("eve_reader_start", path=self.path)
        while not self._stop:
            try:
                self._tick()
                self._backoff = 0.0
            except Exception as e:
                self._backoff = min(max(self.poll_interval, self._backoff * 2 + 0.5), self.max_backoff)
                log.warn("eve_reader_tick_error", err=repr(e), backoff=self._backoff)
                time.sleep(self._backoff)
                continue
            time.sleep(self.poll_interval)
        log.info("eve_reader_stopped", path=self.path)

    # ------------------------------------------------------------------
    def _tick(self) -> None:
        if not os.path.exists(self.path):
            # Wait for file to appear
            return
        db: Session = self._db_factory()
        try:
            offset, last_inode = _load_checkpoint(db, self.path)
            inode = _get_inode(self.path)
            # Rotation detected (inode changed or file shrunk)
            try:
                size = os.path.getsize(self.path)
            except OSError:
                size = 0
            rotated = (inode is not None and last_inode is not None and inode != last_inode) or (
                size < (offset or 0)
            )
            if rotated:
                log.info("eve_reader_rotation_detected", path=self.path, offset=offset, size=size)
                offset = 0
            self._read_from_offset(db, self.path, offset, inode)
        finally:
            db.close()

    def _read_from_offset(self, db: Session, path: str, offset: int, inode: int | None) -> None:
        inserted = duplicate = malformed = parsed = 0
        fh = None
        checkpoint_offset = offset
        try:
            fh = open(path, "r", encoding="utf-8", errors="replace")
            if offset:
                try:
                    fh.seek(offset)
                except OSError:
                    offset = 0
                    checkpoint_offset = 0
            while True:
                line_start = fh.tell()
                line = fh.readline()
                if not line:
                    break
                # Keep an incomplete trailing record at its start offset so the
                # next poll can retry it after the writer finishes the line.
                if not line.endswith("\n"):
                    checkpoint_offset = line_start
                    break
                line_end = fh.tell()
                raw = parse_eve_line(line)
                if raw is None:
                    malformed += 1
                    checkpoint_offset = line_end
                    continue
                parsed += 1
                norm = normalize_event(raw)
                if norm is None:
                    checkpoint_offset = line_end
                    continue
                a_score, a_feat = (None, None)
                if self.anomaly_scorer is not None:
                    try:
                        a_score, a_feat = self.anomaly_scorer(norm)
                    except Exception:
                        a_score, a_feat = (None, None)
                ok = _insert_event(db, norm, a_score, a_feat)
                if ok:
                    inserted += 1
                else:
                    duplicate += 1
                checkpoint_offset = line_end
        except (FileNotFoundError, PermissionError):
            # Treat as transient — will retry next tick
            return
        except OSError:
            return
        finally:
            if fh is not None:
                fh.close()
                try:
                    _save_checkpoint(db, path, checkpoint_offset, inode)
                except Exception:
                    db.rollback()
        if inserted or duplicate or malformed:
            log.info(
                "eve_reader_batch",
                inserted=inserted,
                duplicate=duplicate,
                malformed=malformed,
                parsed=parsed,
                offset=offset,
            )
