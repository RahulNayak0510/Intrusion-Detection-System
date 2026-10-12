from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import User
from app.schemas.common import DashboardSummary
from app.services import dashboard_summary, get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def summary(
    hours: int = 24,
    bucket_minutes: int = 60,
    top_n: int = 10,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> DashboardSummary:
    hours = max(1, min(24 * 30, int(hours)))
    bucket_minutes = max(5, min(60 * 24, int(bucket_minutes)))
    top_n = max(1, min(100, int(top_n)))
    return dashboard_summary(db, hours=hours, bucket_minutes=bucket_minutes, top_n=top_n)
