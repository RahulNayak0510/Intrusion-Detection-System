from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dedup_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)

    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ingestion_time: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    src_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dst_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    src_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dst_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    protocol: Mapped[str | None] = mapped_column(String(16), nullable=True)
    app_proto: Mapped[str | None] = mapped_column(String(32), nullable=True)
    flow_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    signature: Mapped[str | None] = mapped_column(String(512), nullable=True)
    signature_category: Mapped[str | None] = mapped_column(String(256), nullable=True)
    severity: Mapped[str | None] = mapped_column(String(16), nullable=True)

    raw: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    anomaly_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    anomaly_features: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)

    notes: Mapped[list[AnalystNote]] = relationship(
        "AnalystNote",
        back_populates="event",
        cascade="all, delete-orphan",
        order_by="AnalystNote.created_at",
    )

    __table_args__ = (
        Index("ix_events_timestamp", "timestamp"),
        Index("ix_events_severity", "severity"),
        Index("ix_events_event_type", "event_type"),
        Index("ix_events_src_ip", "src_ip"),
        Index("ix_events_dst_ip", "dst_ip"),
        Index("ix_events_timestamp_severity", "timestamp", "severity"),
        Index("ix_events_flow_id", "flow_id"),
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class AnalystNote(Base):
    __tablename__ = "analyst_notes"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    event: Mapped[Event] = relationship("Event", back_populates="notes")
    author: Mapped[User] = relationship("User")


class IngestionCheckpoint(Base):
    __tablename__ = "ingestion_checkpoints"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

    path: Mapped[str] = mapped_column(String(512), primary_key=True)
    last_offset: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    last_inode: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
