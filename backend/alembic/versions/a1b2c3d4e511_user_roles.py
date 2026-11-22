"""user role and display name

Revision ID: a1b2c3d4e511
Revises: a1b2c3d4e510
Create Date: 2026-11-24 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e511"
down_revision: str | Sequence[str] | None = "a1b2c3d4e510"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("role", sa.String(length=10), server_default="student", nullable=False),
    )
    op.add_column("users", sa.Column("display_name", sa.String(length=60), nullable=True))
    # Existing accounts get the part of their email before "@"
    op.execute("UPDATE users SET display_name = left(split_part(email, '@', 1), 60)")
    op.alter_column("users", "display_name", nullable=False)


def downgrade() -> None:
    op.drop_column("users", "display_name")
    op.drop_column("users", "role")
