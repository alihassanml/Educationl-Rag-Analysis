"""teacher style profiles

Revision ID: a1b2c3d4e510
Revises: a1b2c3d4e509
Create Date: 2026-11-23 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a1b2c3d4e510"
down_revision: str | Sequence[str] | None = "a1b2c3d4e509"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_EMPTY = sa.text("'[]'::jsonb")


def upgrade() -> None:
    op.create_table(
        "teacher_style_profiles",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("signature", sa.String(length=64), nullable=False),
        sa.Column("glossary", postgresql.JSONB(astext_type=sa.Text()), server_default=_EMPTY, nullable=False),
        sa.Column("phrases", postgresql.JSONB(astext_type=sa.Text()), server_default=_EMPTY, nullable=False),
        sa.Column("structure", postgresql.JSONB(astext_type=sa.Text()), server_default=_EMPTY, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.add_column("chat_messages", sa.Column("teacher_style", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("chat_citations", sa.Column("is_teacher", sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    op.drop_column("chat_citations", "is_teacher")
    op.drop_column("chat_messages", "teacher_style")
    op.drop_table("teacher_style_profiles")
