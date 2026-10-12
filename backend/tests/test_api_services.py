"""Tests for event filtering, sorting, pagination, notes, and acknowledgement
via the services layer, using an in-memory SQLite DB.
"""
from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy.orm import Session

from app.ingestion.parser import normalize_event, parse_eve_line
from app.ingestion.reader import _insert_event
from app.models import Event
from app.services import (
    acknowledge_event,
    add_note,
    dashboard_summary,
    list_events,
    seed_first_admin,
)
from app.schemas.common import AcknowledgeRequest, AnalystNoteCreate


def _make(ts: str, etype="alert", src="10.0.0.1", dst="10.0.0.2", sport=1000, dport=80,
          sig="SIG", severity=2, extra=None):
    extra_str = extra if isinstance(extra, str) else (f',{extra}' if extra else "")
    if etype == "alert":
        line = (
            '{"timestamp":"%s","event_type":"alert","src_ip":"%s","src_port":%d,'
            '"dest_ip":"%s","dest_port":%d,"proto":"TCP","alert":{"signature":"%s",'
            '"severity":%d}}%s'
        ) % (ts, src, sport, dst, dport, sig, severity, extra_str)
    elif etype == "flow":
        line = (
            '{"timestamp":"%s","event_type":"flow","src_ip":"%s","src_port":%d,'
            '"dest_ip":"%s","dest_port":%d,"proto":"TCP","app_proto":"https",'
            '"flow":{"bytes_toserver":100,"bytes_toclient":200,"age":10}}'
        ) % (ts, src, sport, dst, dport)
    else:
        line = '{"timestamp":"%s","event_type":"%s","src_ip":"%s","dest_ip":"%s"}' % (ts, etype, src, dst)
    return normalize_event(parse_eve_line(line))


def _seed_events(db: Session):
    base = dt.datetime(2026, 10, 9, 12, 0, 0)
    events = [
        _make((base - dt.timedelta(minutes=5)).isoformat() + "+00:00", "alert",
              "198.51.100.2", "10.0.1.5", 1111, 22, "ET SSH Scan", 2),
        _make((base - dt.timedelta(minutes=10)).isoformat() + "+00:00", "alert",
              "203.0.113.9", "10.0.1.8", 2222, 3389, "ET RDP EXPLOIT", 1),
        _make((base - dt.timedelta(minutes=20)).isoformat() + "+00:00", "alert",
              "10.0.0.1", "10.0.1.12", 3333, 80, "ET WP brute", 2),
        _make((base - dt.timedelta(minutes=30)).isoformat() + "+00:00", "flow",
              "10.0.0.1", "1.1.1.1", 50000, 443),
        _make((base - dt.timedelta(minutes=35)).isoformat() + "+00:00", "alert",
              "10.0.0.5", "10.0.1.9", 9999, 445, "ET SMB", 3),  # LOW severity
        _make((base - dt.timedelta(hours=2)).isoformat() + "+00:00", "dns",
              "10.0.0.1", "10.0.0.1", 1234, 53),
    ]
    for ev in events:
        _insert_event(db, ev, None, None)
    db.commit()
    return base


def test_list_events_filters_severity(sqlite_session, override_settings_env):
    base = _seed_events(sqlite_session)
    # Severity HIGH (suricata severity 1)
    r = list_events(sqlite_session, severity=["HIGH"])
    assert r.total == 1
    assert r.items[0].signature == "ET RDP EXPLOIT"

    r_low = list_events(sqlite_session, severity=["LOW"])
    assert r_low.total == 1
    assert r_low.items[0].severity == "LOW"


def test_list_events_filters_event_type(sqlite_session, override_settings_env):
    _seed_events(sqlite_session)
    r = list_events(sqlite_session, event_type=["flow", "dns"])
    assert r.total == 2
    types = {e.event_type for e in r.items}
    assert types == {"flow", "dns"}


def test_list_events_filters_by_src_and_dst(sqlite_session, override_settings_env):
    _seed_events(sqlite_session)
    r = list_events(sqlite_session, src_ip="10.0.0.1")
    assert r.total >= 2
    for e in r.items:
        assert e.src_ip == "10.0.0.1"

    r = list_events(sqlite_session, dst_ip="10.0.1.8")
    assert r.total == 1
    assert r.items[0].dst_ip == "10.0.1.8"


def test_list_events_time_range(sqlite_session, override_settings_env):
    base = _seed_events(sqlite_session)
    # Window last 15 minutes from base: minutes 0..15 back → 2 alerts
    since = base - dt.timedelta(minutes=15)
    until = base
    r = list_events(sqlite_session, since=since, until=until)
    assert r.total == 2


def test_list_events_sorting_and_pagination(sqlite_session, override_settings_env):
    _seed_events(sqlite_session)
    p1 = list_events(sqlite_session, sort="timestamp_desc", page=1, page_size=2)
    p2 = list_events(sqlite_session, sort="timestamp_desc", page=2, page_size=2)
    assert p1.page_size == 2 and len(p1.items) == 2
    assert p2.page == 2 and len(p2.items) == 2
    # Pages must be disjoint
    ids1 = {e.id for e in p1.items}
    ids2 = {e.id for e in p2.items}
    assert not (ids1 & ids2)

    # timestamps descending
    t1 = [e.timestamp for e in p1.items]
    assert t1 == sorted(t1, reverse=True)


def test_list_events_search(sqlite_session, override_settings_env):
    _seed_events(sqlite_session)
    r = list_events(sqlite_session, search="RDP")
    assert r.total >= 1
    assert any("RDP" in (e.signature or "") for e in r.items)


def test_acknowledge_and_notes(sqlite_session, override_settings_env):
    _seed_events(sqlite_session)
    seed_first_admin(sqlite_session)
    from app.models import User
    user = sqlite_session.query(User).first()
    assert user is not None

    ev = list_events(sqlite_session, page_size=1).items[0]
    after = acknowledge_event(sqlite_session, ev.id, user, AcknowledgeRequest(acknowledged=True))
    assert after is not None and after.acknowledged is True

    r = list_events(sqlite_session, acknowledged=True)
    assert r.total >= 1

    note = add_note(sqlite_session, ev.id, user, AnalystNoteCreate(note="First look: high volume src, escalate."))
    assert note is not None
    assert note.author_id == user.id
    assert "escalate" in note.note

    # Re-query detail to verify notes appear
    from app.services import get_event_detail
    detail = get_event_detail(sqlite_session, ev.id)
    assert detail is not None
    assert len(detail.notes) == 1
    assert detail.notes[0].created_at is not None


def test_dashboard_summary(sqlite_session, override_settings_env):
    _seed_events(sqlite_session)
    s = dashboard_summary(sqlite_session, hours=48, bucket_minutes=60)
    # We inserted multiple alerts
    assert sum(p.count for p in s.alert_counts_over_time) >= 3
    severities = {c.severity: c.count for c in s.severity_counts}
    # We have HIGH, MEDIUM, and LOW events
    assert any(k.upper() == "HIGH" and v > 0 for k, v in severities.items())
    assert any(k.upper() == "LOW" and v > 0 for k, v in severities.items())
    # Top IPs should be populated
    assert s.top_source_ips or s.top_destination_ips or (s.last_24h["total_alerts"] > 0)
    # recent events
    assert len(s.recent_events) >= 1
