from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import User
from app.schemas.common import (
    AcknowledgeRequest,
    AnalystNoteCreate,
    AnalystNoteOut,
    EventDetail,
    EventSummary,
    Paginated,
)
from app.services import (
    acknowledge_event,
    add_note,
    get_current_user,
    get_event_detail,
    list_events,
)

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=Paginated[EventSummary])
def list_events_endpoint(
    since: Optional[datetime] = Query(None, description="ISO-8601 UTC (inclusive)"),
    until: Optional[datetime] = Query(None, description="ISO-8601 UTC (inclusive)"),
    severity: Optional[list[str]] = Query(None),
    event_type: Optional[list[str]] = Query(None),
    src_ip: Optional[str] = Query(None),
    dst_ip: Optional[str] = Query(None),
    proto: Optional[str] = Query(None),
    acknowledged: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    sort: str = Query("timestamp_desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=500),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> Paginated[EventSummary]:
    return list_events(
        db=db,
        since=since,
        until=until,
        severity=severity,
        event_type=event_type,
        src_ip=src_ip,
        dst_ip=dst_ip,
        proto=proto,
        acknowledged=acknowledged,
        search=search,
        sort=sort,
        page=page,
        page_size=page_size,
    )


@router.get("/{event_id}", response_model=EventDetail)
def get_event(event_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)) -> EventDetail:
    detail = get_event_detail(db, event_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    return detail


@router.patch("/{event_id}/acknowledge", response_model=EventDetail)
def acknowledge(
    event_id: int,
    payload: AcknowledgeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EventDetail:
    detail = acknowledge_event(db, event_id, user, payload)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    return detail


@router.post("/{event_id}/notes", response_model=AnalystNoteOut)
def create_note(
    event_id: int,
    payload: AnalystNoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnalystNoteOut:
    note = add_note(db, event_id, user, payload)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    return note
