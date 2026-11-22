"""encryption key id on documents

Revision ID: a1b2c3d4e516
Revises: a1b2c3d4e515
Create Date: 2026-11-26 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e516"
down_revision: str | Sequence[str] | None = "a1b2c3d4e515"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # NULL = the stored file is plain bytes (every file that exists before encryption is on)
    op.add_column("documents", sa.Column("encryption_key_id", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "encryption_key_id")
