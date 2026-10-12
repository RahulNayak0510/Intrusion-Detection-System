from __future__ import annotations

import ipaddress
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import and_, desc, asc, func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models import AnalystNote, Event, User
from app.schemas.common import (
    AcknowledgeRequest,
    AlertCountPoint,
    AnalystNoteCreate,
    AnalystNoteOut,
    DashboardSummary,
    EventDetail,
    EventSummary,
    EventTypeCount,
    IPStat,
    Paginated,
    ReplayResult,
    SeverityCount,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _current_user(token: Optional[str], db: Session) -> User:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not_authenticated")
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
    return user


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    return _current_user(token, db)


# ---------------------------------------------------------------------------
# User service
# ---------------------------------------------------------------------------


def seed_first_admin(db: Session) -> None:
    existing = db.scalar(select(func.count()).select_from(User))
    if existing and existing > 0:
        return
    username = settings.FIRST_ADMIN_USERNAME.strip() or "analyst"
    pwd = settings.FIRST_ADMIN_PASSWORD.get_secret_value() or ""
    if not pwd:
        return
    user = User(
        username=username,
        hashed_password=hash_password(pwd),
        display_name=f"{username} (admin)",
        is_active=True,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(user)
    db.commit()


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    user = db.scalar(select(User).where(User.username == username.strip()))
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


# ---------------------------------------------------------------------------
# Config / enrichment helpers
# ---------------------------------------------------------------------------


def ip_in_allowlists(ip_str: Optional[str]) -> bool:
    if not ip_str:
        return False
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return any(ip in net for net in settings.allowlist_networks)


def asset_labels_for_ip(ip_str: Optional[str]) -> list[str]:
    if not ip_str:
        return []
    mapping = settings.asset_labels or {}
    labels: list[str] = []
    for k, v in mapping.items():
        try:
            if "/" in k:
                net = ipaddress.ip_network(k, strict=False)
                if ipaddress.ip_address(ip_str) in net:
                    labels.append(str(v))
            elif k == ip_str:
                labels.append(str(v))
        except ValueError:
            continue
    return labels


# ---------------------------------------------------------------------------
# Events service
# ---------------------------------------------------------------------------


def _row_to_summary(row: Event) -> EventSummary:
    return EventSummary.model_validate(row)


def _row_to_detail(row: Event) -> EventDetail:
    notes: list[AnalystNoteOut] = []
    for n in row.notes:
        author_name: str | None = None
        try:
            author_name = n.author.username if n.author else None
        except Exception:
            author_name = None
        notes.append(
            AnalystNoteOut(
                id=n.id,
                event_id=n.event_id,
                author_id=n.author_id,
                author_username=author_name,
                note=n.note,
                created_at=n.created_at,
            )
        )
    labels = sorted(set(asset_labels_for_ip(row.src_ip) + asset_labels_for_ip(row.dst_ip)))
    d = EventDetail.model_validate(row)
    d.notes = notes
    d.allowlisted = ip_in_allowlists(row.src_ip) or ip_in_allowlists(row.dst_ip)
    d.asset_labels = labels
    return d


_SEVERITY_ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}


def list_events(
    db: Session,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    severity: Optional[list[str]] = None,
    event_type: Optional[list[str]] = None,
    src_ip: Optional[str] = None,
    dst_ip: Optional[str] = None,
    proto: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    search: Optional[str] = None,
    sort: str = "timestamp_desc",
    page: int = 1,
    page_size: int = 25,
) -> Paginated[EventSummary]:
    page = max(1, int(page))
    page_size = max(1, min(500, int(page_size)))

    stmt = select(Event)
    conds = []
    if since is not None:
        conds.append(Event.timestamp >= since)
    if until is not None:
        conds.append(Event.timestamp <= until)
    if severity:
        conds.append(Event.severity.in_([s.upper() for s in severity if s]))
    if event_type:
        conds.append(Event.event_type.in_([e.lower() for e in event_type if e]))
    if src_ip:
        conds.append(Event.src_ip == src_ip.strip())
    if dst_ip:
        conds.append(Event.dst_ip == dst_ip.strip())
    if proto:
        conds.append(Event.protocol == proto.strip().upper())
    if acknowledged is not None:
        conds.append(Event.acknowledged == bool(acknowledged))
    if search and search.strip():
        s = f"%{search.strip()}%"
        conds.append(
            or_(
                Event.signature.like(s),
                Event.signature_category.like(s),
                Event.src_ip.like(s),
                Event.dst_ip.like(s),
            )
        )
    if conds:
        stmt = stmt.where(and_(*conds))

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    sort = (sort or "timestamp_desc").lower()
    order_col: Any = desc(Event.timestamp)
    if sort == "timestamp_asc":
        order_col = asc(Event.timestamp)
    elif sort == "severity_desc":
        order_col = asc(func.coalesce(func.field(Event.severity, "HIGH", "MEDIUM", "LOW"), 99)), desc(Event.timestamp)
    elif sort == "severity_asc":
        order_col = desc(func.coalesce(func.field(Event.severity, "HIGH", "MEDIUM", "LOW"), 99)), asc(Event.timestamp)
    elif sort == "src_ip":
        order_col = asc(Event.src_ip), desc(Event.timestamp)
    elif sort == "dst_ip":
        order_col = asc(Event.dst_ip), desc(Event.timestamp)
    stmt = stmt.order_by(order_col)
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    rows = list(db.scalars(stmt).unique())
    items = [_row_to_summary(r) for r in rows]
    pages = (total + page_size - 1) // page_size if page_size else 0
    return Paginated[EventSummary](items=items, total=total, page=page, page_size=page_size, pages=pages)


def get_event_detail(db: Session, event_id: int) -> Optional[EventDetail]:
    row = db.scalar(select(Event).where(Event.id == event_id))
    if row is None:
        return None
    return _row_to_detail(row)


def acknowledge_event(db: Session, event_id: int, user: User, payload: AcknowledgeRequest) -> Optional[EventDetail]:
    row = db.get(Event, event_id)
    if row is None:
        return None
    row.acknowledged = bool(payload.acknowledged)
    db.commit()
    db.refresh(row)
    return _row_to_detail(row)


def add_note(db: Session, event_id: int, user: User, payload: AnalystNoteCreate) -> Optional[AnalystNoteOut]:
    row = db.get(Event, event_id)
    if row is None:
        return None
    note = AnalystNote(event_id=event_id, author_id=user.id, note=payload.note.strip(), created_at=datetime.now(timezone.utc).replace(tzinfo=None))
    db.add(note)
    db.commit()
    db.refresh(note)
    return AnalystNoteOut(
        id=note.id,
        event_id=note.event_id,
        author_id=note.author_id,
        author_username=user.username,
        note=note.note,
        created_at=note.created_at,
    )


# ---------------------------------------------------------------------------
# Dashboard service
# ---------------------------------------------------------------------------


def _bucket_start(ts: datetime, bucket_minutes: int = 60) -> datetime:
    total = ts.hour * 60 + ts.minute
    bucket = (total // bucket_minutes) * bucket_minutes
    return ts.replace(hour=bucket // 60, minute=bucket % 60, second=0, microsecond=0)


def dashboard_summary(db: Session, hours: int = 24, bucket_minutes: int = 60, top_n: int = 10) -> DashboardSummary:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    window_start = now - timedelta(hours=hours)

    # Severity counts in window
    sev_stmt = (
        select(Event.severity, func.count())
        .where(Event.event_type == "alert", Event.timestamp >= window_start)
        .group_by(Event.severity)
    )
    sev_counts: list[SeverityCount] = []
    last_24h = {"total_alerts": 0, "high": 0, "medium": 0, "low": 0, "acknowledged": 0, "flows_scored": 0}
    for sev, cnt in db.execute(sev_stmt).all():
        sev_counts.append(SeverityCount(severity=(sev or "UNKNOWN"), count=cnt))
        last_24h["total_alerts"] += cnt
        key = (sev or "").lower()
        if key in last_24h:
            last_24h[key] = cnt

    # Acknowledged ratio in window
    ack_stmt = select(func.count()).where(
        Event.event_type == "alert", Event.timestamp >= window_start, Event.acknowledged.is_(True)
    )
    last_24h["acknowledged"] = db.scalar(ack_stmt) or 0

    # Flows scored
    flow_stmt = select(func.count()).where(
        Event.event_type == "flow", Event.timestamp >= window_start, Event.anomaly_score.is_not(None)
    )
    last_24h["flows_scored"] = db.scalar(flow_stmt) or 0

    # Event type counts in window
    et_stmt = (
        select(Event.event_type, func.count())
        .where(Event.timestamp >= window_start)
        .group_by(Event.event_type)
        .order_by(desc(func.count()))
    )
    et_counts = [EventTypeCount(event_type=et, count=cnt) for et, cnt in db.execute(et_stmt).all()]

    # Top source / destination IPs (alerts only, in window)
    src_stmt = (
        select(Event.src_ip, func.count())
        .where(Event.event_type == "alert", Event.timestamp >= window_start, Event.src_ip.is_not(None))
        .group_by(Event.src_ip)
        .order_by(desc(func.count()))
        .limit(top_n)
    )
    top_src = [IPStat(ip=ip or "", count=cnt) for ip, cnt in db.execute(src_stmt).all()]

    dst_stmt = (
        select(Event.dst_ip, func.count())
        .where(Event.event_type == "alert", Event.timestamp >= window_start, Event.dst_ip.is_not(None))
        .group_by(Event.dst_ip)
        .order_by(desc(func.count()))
        .limit(top_n)
    )
    top_dst = [IPStat(ip=ip or "", count=cnt) for ip, cnt in db.execute(dst_stmt).all()]

    # Recent events (any type)
    recent_stmt = select(Event).order_by(desc(Event.timestamp)).limit(20)
    recent = [_row_to_summary(r) for r in db.scalars(recent_stmt).unique()]

    # Alert counts over time buckets in window
    buckets: list[datetime] = []
    cur = _bucket_start(window_start, bucket_minutes)
    end_bucket = _bucket_start(now, bucket_minutes)
    while cur <= end_bucket:
        buckets.append(cur)
        cur += timedelta(minutes=bucket_minutes)

    # Query alerts in window, then bucket in Python (keeps SQL simple and portable)
    alert_rows_stmt = (
        select(Event.timestamp, Event.severity)
        .where(Event.event_type == "alert", Event.timestamp >= window_start, Event.timestamp <= now)
    )
    alerts = list(db.execute(alert_rows_stmt).all())
    by_bucket: dict[datetime, dict[str, int]] = {b: {"total": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0} for b in buckets}
    for ts, sev in alerts:
        b = _bucket_start(ts, bucket_minutes)
        if b not in by_bucket:
            continue
        bucket = by_bucket[b]
        bucket["total"] += 1
        k = (sev or "").upper()
        if k in bucket:
            bucket[k] += 1

    alert_counts_over_time = [
        AlertCountPoint(
            bucket=b,
            count=d["total"],
            severity_high=d["HIGH"],
            severity_medium=d["MEDIUM"],
            severity_low=d["LOW"],
        )
        for b, d in by_bucket.items()
    ]

    return DashboardSummary(
        alert_counts_over_time=alert_counts_over_time,
        severity_counts=sev_counts,
        event_type_counts=et_counts,
        top_source_ips=top_src,
        top_destination_ips=top_dst,
        recent_events=recent[:10],
        last_24h=last_24h,
    )


# ---------------------------------------------------------------------------
# Retention
# ---------------------------------------------------------------------------


def apply_retention(db: Session) -> int:
    days = max(1, int(settings.RETENTION_DAYS or 30))
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    # Delete notes first (FK cascade may also handle this)
    stmt_n = select(AnalystNote.id).join(Event, AnalystNote.event_id == Event.id).where(Event.timestamp < cutoff)
    note_ids = list(db.scalars(stmt_n).all())
    if note_ids:
        db.query(AnalystNote).filter(AnalystNote.id.in_(note_ids)).delete(synchronize_session=False)
    res = db.query(Event).filter(Event.timestamp < cutoff).delete(synchronize_session=False)
    db.commit()
    return int(res or 0)
