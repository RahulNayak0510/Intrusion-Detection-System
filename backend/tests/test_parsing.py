"""Tests for event parsing + normalization across event types, plus
malformed / blank / duplicate handling."""
from __future__ import annotations

import os
from pathlib import Path

import pytest

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

from app.ingestion.parser import normalize_event, parse_eve_line


LINES = [
    # Alert 1
    '{"timestamp":"2026-10-09T12:00:01.123456+0000","flow_id":1,"event_type":"alert","src_ip":"198.51.100.23","src_port":54321,"dest_ip":"10.0.1.5","dest_port":22,"proto":"TCP","alert":{"signature":"ET SCAN Potential SSH Scan","category":"Attempted Information Leak","severity":2}}',
    # Flow
    '{"timestamp":"2026-10-09T12:00:10.000000+0000","flow_id":2,"event_type":"flow","src_ip":"10.0.1.5","src_port":22,"dest_ip":"198.51.100.23","dest_port":54321,"proto":"TCP","app_proto":"ssh","flow":{"pkts_toserver":21,"pkts_toclient":18,"bytes_toserver":1420,"bytes_toclient":1844,"start":"2026-10-09T11:59:50.000000+0000","end":"2026-10-09T12:00:10.000000+0000","age":20}}',
    # DNS query
    '{"timestamp":"2026-10-09T12:00:05.500000+0000","flow_id":3,"event_type":"dns","src_ip":"10.0.1.20","src_port":53000,"dest_ip":"10.0.0.1","dest_port":53,"proto":"UDP","dns":{"type":"query","rrname":"evil-c2.example.net","rrtype":"A"}}',
    # HTTP
    '{"timestamp":"2026-10-09T12:00:30.000000+0000","flow_id":4,"event_type":"http","src_ip":"10.0.1.20","src_port":50001,"dest_ip":"93.184.216.34","dest_port":80,"proto":"TCP","http":{"hostname":"malware.example.org","url":"/p.exe","http_user_agent":"Mozilla/5.0","http_method":"GET","status":200}}',
    # TLS
    '{"timestamp":"2026-10-09T12:00:50.000000+0000","flow_id":5,"event_type":"tls","src_ip":"10.0.1.20","src_port":51234,"dest_ip":"93.184.216.34","dest_port":443,"proto":"TCP","tls":{"subject":"CN=cdn.example.com","issuerdn":"CN=R3","version":"TLS 1.3","sni":"cdn.example.com"}}',
]


def test_parse_valid_lines():
    events = [normalize_event(parse_eve_line(l)) for l in LINES]
    assert all(e is not None for e in events)


def test_alert_fields():
    n = normalize_event(parse_eve_line(LINES[0]))
    assert n is not None
    assert n.event_type == "alert"
    assert n.src_ip == "198.51.100.23"
    assert n.dst_ip == "10.0.1.5"
    assert n.dst_port == 22
    assert n.protocol == "TCP"
    assert "SSH Scan" in n.signature
    assert n.severity in {"MEDIUM", "HIGH", "LOW"}


def test_flow_fields():
    n = normalize_event(parse_eve_line(LINES[1]))
    assert n is not None
    assert n.event_type == "flow"
    assert n.app_proto == "ssh"
    f = n.raw["flow"]
    assert f["bytes_toserver"] == 1420
    assert f["age"] == 20


def test_dns_fields():
    n = normalize_event(parse_eve_line(LINES[2]))
    assert n is not None
    assert n.event_type == "dns"
    assert n.protocol == "UDP"
    assert n.raw["dns"]["rrname"] == "evil-c2.example.net"
    assert n.raw["dns"]["type"] == "query"


def test_http_fields():
    n = normalize_event(parse_eve_line(LINES[3]))
    assert n is not None
    assert n.event_type == "http"
    assert n.raw["http"]["hostname"] == "malware.example.org"
    assert n.raw["http"]["http_method"] == "GET"
    assert n.raw["http"]["status"] == 200


def test_tls_fields():
    n = normalize_event(parse_eve_line(LINES[4]))
    assert n is not None
    assert n.event_type == "tls"
    assert n.raw["tls"]["sni"] == "cdn.example.com"
    assert n.raw["tls"]["version"] == "TLS 1.3"


@pytest.mark.parametrize("bad", [
    "",
    "   ",
    "not json at all",
    "{\"broken\":",  # truncated
    "{bad}",
    "{'single': 'quotes'}",
])
def test_malformed_lines_return_none(bad: str):
    assert parse_eve_line(bad) is None
    # Should also not crash when calling normalize_event
    assert normalize_event(parse_eve_line(bad)) is None


def test_duplicate_dedup_key_is_deterministic():
    l = LINES[0]
    a = normalize_event(parse_eve_line(l))
    b = normalize_event(parse_eve_line(l))
    assert a is not None and b is not None
    assert a.dedup_key == b.dedup_key


def test_sample_eve_has_events(sample_eve_path: Path):
    assert sample_eve_path.exists(), "sample EVE file must exist"
    good = 0
    malformed = 0
    seen = set()
    dup = 0
    with sample_eve_path.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            raw = parse_eve_line(line)
            if raw is None:
                malformed += 1
                continue
            n = normalize_event(raw)
            if n is None:
                continue
            good += 1
            if n.dedup_key in seen:
                dup += 1
            seen.add(n.dedup_key)
    # The sample file should contain at least one alert/flow/dns/http/tls and one malformed + duplicate each
    types = set()
    with sample_eve_path.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            raw = parse_eve_line(line)
            if raw is None:
                continue
            n = normalize_event(raw)
            if n is not None:
                types.add(n.event_type)
    for req in {"alert", "flow", "dns", "http", "tls"}:
        assert req in types, f"sample file missing {req}"
    assert good >= 10
    assert malformed >= 1
    assert dup >= 1


def test_severity_mapping_via_settings(override_settings_env):
    from app.core.config import get_settings
    get_settings.cache_clear()
    s = get_settings()
    mapping = s.severity_map
    assert mapping["1"].upper() == "HIGH"
    assert mapping["2"].upper() == "MEDIUM"
    assert mapping["3"].upper() == "LOW"
