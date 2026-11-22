"""document topics

Revision ID: a1b2c3d4e502
Revises: a1b2c3d4e501
Create Date: 2026-11-22 10:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e502"
down_revision: str | Sequence[str] | None = "a1b2c3d4e501"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "document_topics",
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("topic_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("first_page", sa.Integer(), nullable=True),
        sa.Column("last_page", sa.Integer(), nullable=True),
        sa.Column("heading", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("document_id", "topic_id"),
    )
    op.create_index("ix_document_topics_topic_id", "document_topics", ["topic_id"])


def downgrade() -> None:
    op.drop_index("ix_document_topics_topic_id", table_name="document_topics")
    op.drop_table("document_topics")
