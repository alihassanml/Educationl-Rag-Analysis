"""section titles for chapter-aware citations

Revision ID: a1b2c3d4e501
Revises: 6c890f3e9046
Create Date: 2026-11-22 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e501"
down_revision: str | Sequence[str] | None = "6c890f3e9046"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("document_chunks", sa.Column("section_title", sa.String(length=255), nullable=True))
    op.add_column("chat_citations", sa.Column("section_title", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_citations", "section_title")
    op.drop_column("document_chunks", "section_title")
