"""exam predictor

Revision ID: a1b2c3d4e509
Revises: a1b2c3d4e508
Create Date: 2026-11-23 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e509"
down_revision: str | Sequence[str] | None = "a1b2c3d4e508"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("questions_extracted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "past_paper_questions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("marks", sa.Integer(), nullable=True),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_past_paper_questions_user_id", "past_paper_questions", ["user_id"])
    op.create_index("ix_past_paper_questions_document_id", "past_paper_questions", ["document_id"])
    op.create_table(
        "exam_topic_scores",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("topic_id", sa.Uuid(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=10), nullable=False),
        sa.Column("pinned", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "topic_id"),
    )


def downgrade() -> None:
    op.drop_table("exam_topic_scores")
    op.drop_index("ix_past_paper_questions_document_id", table_name="past_paper_questions")
    op.drop_index("ix_past_paper_questions_user_id", table_name="past_paper_questions")
    op.drop_table("past_paper_questions")
    op.drop_column("documents", "questions_extracted_at")
