"""adaptive difficulty

Revision ID: a1b2c3d4e503
Revises: a1b2c3d4e502
Create Date: 2026-11-22 11:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e503"
down_revision: str | Sequence[str] | None = "a1b2c3d4e502"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "topic_progress",
        sa.Column("current_difficulty", sa.String(length=20), server_default="beginner", nullable=False),
    )
    op.add_column(
        "topic_progress", sa.Column("failed_streak", sa.Integer(), server_default="0", nullable=False)
    )
    op.add_column(
        "topic_progress",
        sa.Column("needs_support", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "chat_messages",
        sa.Column("simplified", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("chat_messages", "simplified")
    op.drop_column("topic_progress", "needs_support")
    op.drop_column("topic_progress", "failed_streak")
    op.drop_column("topic_progress", "current_difficulty")
