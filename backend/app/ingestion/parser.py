from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field, ConfigDict

from app.core.config import settings

_LOG_LINE = re.compile(r"^\s*\{.*\}\s*$")


def _parse_iso_utc(ts: Any) -> datetime | None:
    if not ts or not isinstance(ts, str):
        return None
    s = ts.strip()
    if not s:
        return None
    # Suricata typically emits "2026-10-09T12:00:01.123456+0000"
    for fmt in (
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            dt = datetime.strptime(s, fmt)
        except ValueError:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    # final attempt: fromisoformat (Python 3.11 accepts variants)
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    except Exception:
        return None


@dataclass
class ParsedEvent:
    raw: dict[str, Any]
    event_type: str
    timestamp: datetime
    src_ip: str | None
    dst_ip: str | None
    src_port: int | None
    dst_port: int | None
    protocol: str | None
    app_proto: str | None
    flow_id: int | None
    signature: str | None
    signature_category: str | None
    severity: str | None
    dedup_key: str


def _get_ip(raw: dict, *keys) -> str | None:
    for k in keys:
        if k in raw and isinstance(raw[k], str) and raw[k].strip():
            return raw[k].strip()
    return None


def _get_port(raw: dict, *keys) -> int | None:
    for k in keys:
        v = raw.get(k)
        if v is None:
            continue
        try:
            i = int(v)
        except (TypeError, ValueError):
            continue
        if 0 <= i <= 65535:
            return i
    return None


def _normalize_severity(raw_alert: dict | None) -> str | None:
    if not isinstance(raw_alert, dict):
        return None
    sev = raw_alert.get("severity")
    mapping = settings.severity_map
    if sev is None:
        return None
    key = str(sev).strip().lower()
    if key in mapping:
        return mapping[key]
    # Default: map raw string to one of our labels
    up = key.upper()
    if up in {"HIGH", "CRITICAL"}:
        return "HIGH"
    if up in {"MEDIUM", "MAJOR"}:
        return "MEDIUM"
    if up in {"LOW", "MINOR"}:
        return "LOW"
    return "MEDIUM"


def _make_dedup_key(raw: dict[str, Any]) -> str:
    """Hash the complete normalized JSON record to avoid lossy-key collisions."""
    canonical = json.dumps(raw, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def parse_eve_line(line: str) -> dict[str, Any] | None:
    """Parse a single EVE JSON line. Returns None for blank / malformed."""
    if line is None:
        return None
    s = line.strip()
    if not s:
        return None
    if not (s.startswith("{") and s.endswith("}")):
        return None
    try:
        return json.loads(s)
    except (ValueError, json.JSONDecodeError):
        return None


def normalize_event(raw: dict[str, Any]) -> ParsedEvent | None:
    """Normalize a parsed EVE dict. Returns None if not usable."""
    if not isinstance(raw, dict):
        return None
    event_type = (raw.get("event_type") or "").strip().lower()
    if not event_type:
        return None
    timestamp = _parse_iso_utc(raw.get("timestamp"))
    if timestamp is None:
        timestamp = datetime.now(timezone.utc).replace(tzinfo=None)

    src_ip = _get_ip(raw, "src_ip", "source_ip", "src")
    dst_ip = _get_ip(raw, "dest_ip", "dst_ip", "dest")
    src_port = _get_port(raw, "src_port", "source_port")
    dst_port = _get_port(raw, "dest_port", "dst_port")

    proto = raw.get("proto") or raw.get("protocol")
    protocol = proto.upper().strip() if isinstance(proto, str) else None

    app_proto_raw = raw.get("app_proto")
    app_proto = app_proto_raw.lower().strip() if isinstance(app_proto_raw, str) else None

    flow_id = None
    fid = raw.get("flow_id")
    if fid is not None:
        try:
            flow_id = int(fid)
        except (TypeError, ValueError):
            flow_id = None

    signature = None
    signature_category = None
    severity = None
    alert = raw.get("alert")
    if isinstance(alert, dict):
        sig = alert.get("signature")
        if isinstance(sig, str):
            signature = sig.strip()[:512] or None
        cat = alert.get("category")
        if isinstance(cat, str):
            signature_category = cat.strip()[:256] or None
        severity = _normalize_severity(alert)

    # If event_type is alert but severity not set via alert block, try root
    if event_type == "alert" and severity is None:
        severity = _normalize_severity({"severity": raw.get("severity")}) or "MEDIUM"

    dedup_key = _make_dedup_key(raw)

    return ParsedEvent(
        raw=raw,
        event_type=event_type,
        timestamp=timestamp,
        src_ip=src_ip,
        dst_ip=dst_ip,
        src_port=src_port,
        dst_port=dst_port,
        protocol=protocol,
        app_proto=app_proto,
        flow_id=flow_id,
        signature=signature,
        signature_category=signature_category,
        severity=severity,
        dedup_key=dedup_key,
    )
