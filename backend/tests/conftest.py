"""Pytest shared fixtures + test DB configuration.

Tests do NOT require MySQL, root privileges, or live traffic.
Pure-logic tests use an in-memory SQLite engine via SQLAlchemy.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

PROJECT_ROOT = BACKEND_ROOT.parent
DATA_DIR = PROJECT_ROOT / "data"

# ---- Module-level env var defaults ------------------------------------------
# pydantic-settings reads env once at Settings instantiation (module import time),
# so we MUST set critical defaults here BEFORE any `app.*` imports happen.
# The fixture below also overrides for tests that need specific values.
os.environ.setdefault("MYSQL_HOST", "127.0.0.1")
os.environ.setdefault("MYSQL_PORT", "3306")
os.environ.setdefault("MYSQL_DATABASE", "idsdb")
os.environ.setdefault("MYSQL_USER", "ids_user")
os.environ.setdefault("MYSQL_PASSWORD", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-long-enough-abcdefghijklmnopqrstuvwxyz0123456789")
os.environ.setdefault("FIRST_ADMIN_USERNAME", "analyst")
os.environ.setdefault("FIRST_ADMIN_PASSWORD", "local-test-password")
os.environ.setdefault("ANOMALY_ENABLED", "false")


@pytest.fixture(scope="session")
def data_dir() -> Path:
    return DATA_DIR


@pytest.fixture(scope="session")
def sample_eve_path(data_dir: Path) -> Path:
    return data_dir / "sample_eve.json"


@pytest.fixture()
def sqlite_engine():
    """In-memory SQLite engine. Fast and safe for pure-logic tests."""
    from sqlalchemy import create_engine
    from app.models import Base
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture()
def sqlite_session(sqlite_engine):
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=sqlite_engine, autoflush=False, autocommit=False, future=True)
    s = Session()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture()
def override_settings_env(monkeypatch):
    """Set safe env defaults before any settings import for tests."""
    monkeypatch.setenv("MYSQL_HOST", "127.0.0.1")
    monkeypatch.setenv("MYSQL_PORT", "3306")
    monkeypatch.setenv("MYSQL_DATABASE", "idsdb")
    monkeypatch.setenv("MYSQL_USER", "ids_user")
    monkeypatch.setenv("MYSQL_PASSWORD", "test")
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-abcdefghijklmnopqrstuvwxyz0123456789")
    monkeypatch.setenv("FIRST_ADMIN_USERNAME", "analyst")
    monkeypatch.setenv("FIRST_ADMIN_PASSWORD", "local-test-password")
    monkeypatch.setenv("ANOMALY_ENABLED", "false")
    yield
