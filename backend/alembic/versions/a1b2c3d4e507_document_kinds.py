"""document kinds

Revision ID: a1b2c3d4e507
Revises: a1b2c3d4e506
Create Date: 2026-11-23 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e507"
down_revision: str | Sequence[str] | None = "a1b2c3d4e506"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("kind", sa.String(length=20), server_default="notes", nullable=False))
    op.add_column("documents", sa.Column("exam_year", sa.Integer(), nullable=True))
    op.add_column("documents", sa.Column("exam_session", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "exam_session")
    op.drop_column("documents", "exam_year")
    op.drop_column("documents", "kind")
