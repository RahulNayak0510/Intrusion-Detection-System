from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, List, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class HealthOut(BaseModel):
    status: str
    db: str


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=1024)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_minutes: int


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    display_name: Optional[str] = None
    is_active: bool


# --- Events -----------------------------------------------------------------


class EventSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    dedup_key: str
    event_type: str
    timestamp: datetime
    src_ip: Optional[str] = None
    dst_ip: Optional[str] = None
    src_port: Optional[int] = None
    dst_port: Optional[int] = None
    protocol: Optional[str] = None
    app_proto: Optional[str] = None
    flow_id: Optional[int] = None
    signature: Optional[str] = None
    signature_category: Optional[str] = None
    severity: Optional[str] = None
    anomaly_score: Optional[float] = None
    acknowledged: bool


class AnalystNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    event_id: int
    author_id: int
    author_username: Optional[str] = None
    note: str
    created_at: datetime


class EventDetail(EventSummary):
    ingestion_time: datetime
    raw: dict[str, Any] = Field(default_factory=dict)
    anomaly_features: Optional[dict[str, Any]] = None
    allowlisted: bool = False
    asset_labels: list[str] = Field(default_factory=list)
    notes: list[AnalystNoteOut] = Field(default_factory=list)


class Paginated(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    pages: int


class AcknowledgeRequest(BaseModel):
    acknowledged: bool = True


class AnalystNoteCreate(BaseModel):
    note: str = Field(..., min_length=1, max_length=10_000)


# --- Dashboard --------------------------------------------------------------


class AlertCountPoint(BaseModel):
    bucket: datetime
    count: int
    severity_high: int = 0
    severity_medium: int = 0
    severity_low: int = 0


class SeverityCount(BaseModel):
    severity: str
    count: int


class IPStat(BaseModel):
    ip: str
    count: int


class EventTypeCount(BaseModel):
    event_type: str
    count: int


class DashboardSummary(BaseModel):
    alert_counts_over_time: list[AlertCountPoint]
    severity_counts: list[SeverityCount]
    event_type_counts: list[EventTypeCount]
    top_source_ips: list[IPStat]
    top_destination_ips: list[IPStat]
    recent_events: list[EventSummary]
    last_24h: dict[str, int] = Field(
        default_factory=lambda: {"total_alerts": 0, "high": 0, "medium": 0, "low": 0, "acknowledged": 0, "flows_scored": 0}
    )


# --- Admin replay -----------------------------------------------------------


class ReplayResult(BaseModel):
    path: str
    read: int
    parsed: int
    normalized: int
    inserted: int
    duplicate: int
    malformed: int
