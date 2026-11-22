"""path events (learning path re-routing)

Revision ID: a1b2c3d4e505
Revises: a1b2c3d4e504
Create Date: 2026-11-22 13:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e505"
down_revision: str | Sequence[str] | None = "a1b2c3d4e504"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "path_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("topic_id", sa.Uuid(), nullable=False),
        sa.Column("old_status", sa.String(length=20), nullable=False),
        sa.Column("new_status", sa.String(length=20), nullable=False),
        sa.Column("reason", sa.String(length=300), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_path_events_user_id", "path_events", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_path_events_user_id", table_name="path_events")
    op.drop_table("path_events")
