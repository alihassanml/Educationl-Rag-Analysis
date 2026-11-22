"""quiz kind and per-question topic (diagnostic)

Revision ID: a1b2c3d4e504
Revises: a1b2c3d4e503
Create Date: 2026-11-22 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e504"
down_revision: str | Sequence[str] | None = "a1b2c3d4e503"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "quizzes",
        sa.Column("kind", sa.String(length=20), server_default="practice", nullable=False),
    )
    op.add_column("questions", sa.Column("topic_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_questions_topic_id", "questions", "topics", ["topic_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_questions_topic_id", "questions", type_="foreignkey")
    op.drop_column("questions", "topic_id")
    op.drop_column("quizzes", "kind")
