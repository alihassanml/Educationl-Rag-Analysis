"""viva oral exam sessions and turns

Revision ID: a1b2c3d4e514
Revises: a1b2c3d4e513
Create Date: 2026-11-25 11:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a1b2c3d4e514"
down_revision: str | Sequence[str] | None = "a1b2c3d4e513"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "viva_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("topic_name", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="in_progress", nullable=False),
        sa.Column("tab_switch_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total_score", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_score", sa.Integer(), server_default="0", nullable=False),
        sa.Column("overall_feedback", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_viva_sessions_user_id", "viva_sessions", ["user_id"])

    op.create_table(
        "viva_turns",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("turn_index", sa.Integer(), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("source_citations", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("student_answer", sa.Text(), nullable=True),
        sa.Column("follow_up_question", sa.Text(), nullable=True),
        sa.Column("follow_up_answer", sa.Text(), nullable=True),
        sa.Column("grade_accuracy", sa.Integer(), nullable=True),
        sa.Column("grade_completeness", sa.Integer(), nullable=True),
        sa.Column("grade_own_words", sa.Integer(), nullable=True),
        sa.Column("grade_score", sa.Integer(), nullable=True),
        sa.Column("grade_feedback", sa.Text(), nullable=True),
        sa.Column("ideal_answer", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["viva_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_viva_turns_session_id", "viva_turns", ["session_id"])


def downgrade() -> None:
    op.drop_table("viva_turns")
    op.drop_table("viva_sessions")
