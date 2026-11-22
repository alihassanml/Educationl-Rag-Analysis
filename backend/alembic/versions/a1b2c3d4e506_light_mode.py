"""light mode (mood-aware pacing)

Revision ID: a1b2c3d4e506
Revises: a1b2c3d4e505
Create Date: 2026-11-22 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a1b2c3d4e506"
down_revision: str | Sequence[str] | None = "a1b2c3d4e505"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("lighter_steps_enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.create_table(
        "light_episodes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("topic_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("outcome", sa.String(length=20), nullable=True),
        sa.Column("recap", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("confidence_quiz_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["confidence_quiz_id"], ["quizzes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_light_episodes_user_id", "light_episodes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_light_episodes_user_id", table_name="light_episodes")
    op.drop_table("light_episodes")
    op.drop_column("users", "lighter_steps_enabled")
