from __future__ import annotations

import asyncio
import os
import threading
from contextlib import asynccontextmanager

import structlog
from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging_setup import configure_logging, get_logger
from app.db.session import SessionLocal, engine, get_db
from app.ingestion.reader import EveFileReader, ingest_file
from app.models import User
from app.routers import auth as auth_router
from app.routers import dashboard as dashboard_router
from app.routers import events as events_router
from app.schemas.common import HealthOut, ReplayResult
from app.services import apply_retention, get_current_user, seed_first_admin

configure_logging()
log = get_logger(service="nids-backend")


_reader_thread: threading.Thread | None = None
_reader: EveFileReader | None = None


def _get_anomaly_scorer():
    if not settings.ANOMALY_ENABLED:
        return None
    try:
        from app.anomaly.model import get_scorer  # lazy import

        return get_scorer()
    except Exception as e:
        log.warn("anomaly_scorer_init_failed", err=repr(e))
        return None


def _start_background_jobs() -> None:
    """Run in a thread (not the asyncio event loop) so blocking I/O never blocks HTTP."""
    global _reader, _reader_thread

    # --- Local native dev: if using SQLite, auto-create all ORM tables -------------
    # (Production MySQL always uses Alembic migrations in the Dockerfile pre-start.
    #  SQLite is the documented local-dev fallback when Docker/MySQL is unavailable.)
    try:
        from app.db.session import engine as _engine
        from app.models import Base
        if _engine.url.drivername.startswith("sqlite"):
            Base.metadata.create_all(bind=_engine)
    except Exception as e:
        log.warn("sqlite_create_all_skipped", err=repr(e))

    # Seed first admin user + apply retention once at startup
    try:
        with SessionLocal() as db:
            seed_first_admin(db)
            pruned = apply_retention(db)
            if pruned:
                log.info("retention_applied_at_startup", pruned_events=pruned)
    except Exception as e:
        log.warn("startup_seed_retention_error", err=repr(e))

    # Replay sample on startup if enabled (demo path)
    if bool(settings.AUTO_REPLAY_SAMPLE_ON_STARTUP):
        try:
            sample_path = settings.SAMPLE_EVE_FILE_PATH
            if not os.path.exists(sample_path):
                # Try path relative to project root
                alt = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "sample_eve.json")
                if os.path.exists(alt):
                    sample_path = alt
            if os.path.exists(sample_path):
                scorer = _get_anomaly_scorer()
                with SessionLocal() as db:
                    stats = ingest_file(
                        db,
                        sample_path,
                        anomaly_scorer=scorer,
                        rebase_timestamps_to_now=True,
                    )
                    log.info("sample_replay_startup", **stats)
        except Exception as e:
            log.warn("sample_replay_failed", err=repr(e))

    # EveFileReader tailer
    if settings.EVE_FILE_PATH:
        try:
            _reader = EveFileReader(
                db_factory=SessionLocal,
                path=settings.EVE_FILE_PATH,
                anomaly_scorer=_get_anomaly_scorer(),
            )
            _reader_thread = threading.Thread(target=_reader.run_forever, name="eve-reader", daemon=True)
            _reader_thread.start()
        except Exception as e:
            log.warn("eve_reader_start_failed", err=repr(e))

    # Retention loop (daily)
    def retention_loop():
        import time as _time
        while True:
            try:
                with SessionLocal() as db:
                    pruned = apply_retention(db)
                    if pruned:
                        log.info("retention_job_cycle", pruned_events=pruned)
            except Exception as e:
                log.warn("retention_job_error", err=repr(e))
            _time.sleep(24 * 3600)

    try:
        t = threading.Thread(target=retention_loop, name="retention-loop", daemon=True)
        t.start()
    except Exception as e:
        log.warn("retention_loop_start_failed", err=repr(e))


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _start_background_jobs)
    yield
    global _reader
    if _reader is not None:
        try:
            _reader.stop()
        except Exception:
            pass


app = FastAPI(
    title="Network Intrusion Detection System API",
    description=(
        "Defensive NIDS API. Ingests Suricata EVE JSON, stores events in MySQL, "
        "and exposes an analyst-facing dashboard. Passive monitoring only."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthOut, tags=["meta"])
def health(db: Session = Depends(get_db)) -> HealthOut:
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="database_unavailable")
    return HealthOut(status="ok", db="ok")


app.include_router(auth_router.router)
app.include_router(events_router.router)
app.include_router(dashboard_router.router)


admin_router = APIRouter(prefix="/api/admin", tags=["admin"])


@admin_router.post("/replay-sample", response_model=ReplayResult)
def replay_sample(db: Session = Depends(get_db), _user: User = Depends(get_current_user)) -> ReplayResult:
    sample_path = settings.SAMPLE_EVE_FILE_PATH
    if not os.path.exists(sample_path):
        alt = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "sample_eve.json")
        if os.path.exists(alt):
            sample_path = alt
        else:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="sample_file_missing")
    scorer = _get_anomaly_scorer()
    stats = ingest_file(db, sample_path, anomaly_scorer=scorer, rebase_timestamps_to_now=True)
    return ReplayResult(path=sample_path, **stats)


app.include_router(admin_router)
