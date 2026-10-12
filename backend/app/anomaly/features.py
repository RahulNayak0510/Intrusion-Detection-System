from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from typing import Any

from app.ingestion.parser import ParsedEvent

FEATURE_NAMES = [
    "bytes_toserver_log1p",
    "bytes_toclient_log1p",
    "pkts_toserver_log1p",
    "pkts_toclient_log1p",
    "duration_seconds_log1p",
    "dst_port_bucket_hash",
    "protocol_encoded",
    "bytes_ratio_toserver",
    "pkts_ratio_toserver",
]

PROTO_LIST = ["X", "TCP", "UDP", "ICMP", "HTTP", "HTTPS", "TLS", "DNS", "SSH", "SMB"]
PROTO_ENC_DEFAULT = 0.9


@dataclass
class FlowFeatures:
    bytes_toserver: int = 0
    bytes_toclient: int = 0
    pkts_toserver: int = 0
    pkts_toclient: int = 0
    duration_seconds: float = 0.0
    dst_port: int = 0
    protocol: str = ""

    def to_vector(self) -> list[float]:
        bts = math.log1p(max(0, self.bytes_toserver))
        btc = math.log1p(max(0, self.bytes_toclient))
        pts = math.log1p(max(0, self.pkts_toserver))
        ptc = math.log1p(max(0, self.pkts_toclient))
        dur = math.log1p(max(0.0, float(self.duration_seconds)))

        if self.dst_port:
            port_bytes = str(self.dst_port).encode("utf-8")
            port_hash = int.from_bytes(hashlib.md5(port_bytes).digest()[:4], "big") / (2 ** 32)
        else:
            port_hash = 0.5

        proto_enc = _protocol_encode(self.protocol)

        total_bytes = self.bytes_toserver + self.bytes_toclient
        b_ratio = (self.bytes_toserver / total_bytes) if total_bytes > 0 else 0.0
        total_pkts = self.pkts_toserver + self.pkts_toclient
        p_ratio = (self.pkts_toserver / total_pkts) if total_pkts > 0 else 0.0

        return [
            float(bts),
            float(btc),
            float(pts),
            float(ptc),
            float(dur),
            float(port_hash),
            float(proto_enc),
            float(b_ratio),
            float(p_ratio),
        ]


def _protocol_encode(protocol: str) -> float:
    p = (protocol or "").upper()
    if p in PROTO_LIST:
        return PROTO_LIST.index(p) / (len(PROTO_LIST) - 1)
    return PROTO_ENC_DEFAULT


def extract_flow_features(p: ParsedEvent) -> FlowFeatures | None:
    if p.event_type != "flow":
        return None
    raw: dict[str, Any] = p.raw or {}
    flow = raw.get("flow") or {}
    if not isinstance(flow, dict):
        flow = {}

    duration_seconds = 0.0
    age = flow.get("age")
    if isinstance(age, (int, float)):
        duration_seconds = float(age)
    else:
        start = flow.get("start")
        end = flow.get("end")
        if isinstance(start, str) and isinstance(end, str):
            from app.ingestion.parser import _parse_iso_utc
            sdt = _parse_iso_utc(start)
            edt = _parse_iso_utc(end)
            if sdt and edt:
                duration_seconds = max(0.0, (edt - sdt).total_seconds())

    return FlowFeatures(
        bytes_toserver=int(flow.get("bytes_toserver") or 0),
        bytes_toclient=int(flow.get("bytes_toclient") or 0),
        pkts_toserver=int(flow.get("pkts_toserver") or 0),
        pkts_toclient=int(flow.get("pkts_toclient") or 0),
        duration_seconds=duration_seconds,
        dst_port=int(p.dst_port or 0),
        protocol=p.protocol or "",
    )


def vector_from_parsed_event(p: ParsedEvent) -> list[float] | None:
    ff = extract_flow_features(p)
    if ff is None:
        return None
    vec = ff.to_vector()
    assert len(vec) == len(FEATURE_NAMES)
    return vec
