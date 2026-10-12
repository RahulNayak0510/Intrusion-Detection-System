from __future__ import annotations

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.core.config import settings


def _build_mysql_url() -> str:
    return (
        f"mysql+pymysql://{settings.MYSQL_USER}:{settings.MYSQL_PASSWORD.get_secret_value()}"
        f"@{settings.MYSQL_HOST}:{settings.MYSQL_PORT}/{settings.MYSQL_DATABASE}"
        f"?charset=utf8mb4&collation=utf8mb4_unicode_ci"
    )


def get_engine_url(override: str | None = None) -> str:
    if override:
        return override
    if settings.DATABASE_URL:
        return settings.sqlalchemy_database_url
    return _build_mysql_url()


def new_engine(url_override: str | None = None, **engine_kwargs):
    url = get_engine_url(url_override)
    defaults = dict(
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_size=20,
        max_overflow=30,
        future=True,
    )
    defaults.update(engine_kwargs)
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False}, future=True)
    return create_engine(url, **defaults)


def new_session_factory(engine) -> sessionmaker[Session]:
    return sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
        future=True,
    )


engine = new_engine()
SessionLocal = new_session_factory(engine)


def get_db() -> Generator[Session, None, None]:
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
