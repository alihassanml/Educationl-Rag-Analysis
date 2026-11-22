"""youtube lecture sources

Revision ID: a1b2c3d4e508
Revises: a1b2c3d4e507
Create Date: 2026-11-23 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e508"
down_revision: str | Sequence[str] | None = "a1b2c3d4e507"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("source_url", sa.String(length=2048), nullable=True))
    op.add_column("document_chunks", sa.Column("start_seconds", sa.Integer(), nullable=True))
    op.add_column("chat_citations", sa.Column("start_seconds", sa.Integer(), nullable=True))
    op.add_column("chat_citations", sa.Column("source_url", sa.String(length=2200), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_citations", "source_url")
    op.drop_column("chat_citations", "start_seconds")
    op.drop_column("document_chunks", "start_seconds")
    op.drop_column("documents", "source_url")
