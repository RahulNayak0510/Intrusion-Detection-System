"""initial schema: events, users, analyst_notes, ingestion_checkpoints

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "ingestion_checkpoints",
        sa.Column("path", sa.String(length=512), nullable=False),
        sa.Column("last_offset", sa.BigInteger(), nullable=False),
        sa.Column("last_inode", sa.BigInteger(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("path"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )

    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("dedup_key", sa.String(length=64), nullable=False),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("ingestion_time", sa.DateTime(), nullable=False),
        sa.Column("src_ip", sa.String(length=64), nullable=True),
        sa.Column("dst_ip", sa.String(length=64), nullable=True),
        sa.Column("src_port", sa.Integer(), nullable=True),
        sa.Column("dst_port", sa.Integer(), nullable=True),
        sa.Column("protocol", sa.String(length=16), nullable=True),
        sa.Column("app_proto", sa.String(length=32), nullable=True),
        sa.Column("flow_id", sa.BigInteger(), nullable=True),
        sa.Column("signature", sa.String(length=512), nullable=True),
        sa.Column("signature_category", sa.String(length=256), nullable=True),
        sa.Column("severity", sa.String(length=16), nullable=True),
        sa.Column("raw", sa.JSON(), nullable=False),
        sa.Column("anomaly_score", sa.Float(), nullable=True),
        sa.Column("anomaly_features", sa.JSON(), nullable=True),
        sa.Column("acknowledged", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedup_key"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("ix_events_dedup_key", "events", ["dedup_key"], unique=True)
    op.create_index("ix_events_timestamp", "events", ["timestamp"])
    op.create_index("ix_events_severity", "events", ["severity"])
    op.create_index("ix_events_event_type", "events", ["event_type"])
    op.create_index("ix_events_src_ip", "events", ["src_ip"])
    op.create_index("ix_events_dst_ip", "events", ["dst_ip"])
    op.create_index("ix_events_timestamp_severity", "events", ["timestamp", "severity"])
    op.create_index("ix_events_flow_id", "events", ["flow_id"])
    op.create_index("ix_events_acknowledged", "events", ["acknowledged"])

    op.create_table(
        "analyst_notes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("ix_analyst_notes_event_id", "analyst_notes", ["event_id"])
    op.create_index("ix_analyst_notes_author_id", "analyst_notes", ["author_id"])
    op.create_index("ix_analyst_notes_created_at", "analyst_notes", ["created_at"])


def downgrade() -> None:
    op.drop_table("analyst_notes")
    op.drop_table("events")
    op.drop_table("ingestion_checkpoints")
    op.drop_table("users")
