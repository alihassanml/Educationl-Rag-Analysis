"""classes, members and shared documents

Revision ID: a1b2c3d4e512
Revises: a1b2c3d4e511
Create Date: 2026-11-24 11:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e512"
down_revision: str | Sequence[str] | None = "a1b2c3d4e511"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "classes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("join_code", sa.String(length=8), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_classes_teacher_id", "classes", ["teacher_id"])
    op.create_index("ix_classes_join_code", "classes", ["join_code"], unique=True)
    op.create_table(
        "class_members",
        sa.Column("class_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("class_id", "student_id"),
    )
    op.create_index("ix_class_members_student_id", "class_members", ["student_id"])
    op.create_table(
        "class_documents",
        sa.Column("class_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("shared_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("class_id", "document_id"),
    )
    op.create_index("ix_class_documents_document_id", "class_documents", ["document_id"])


def downgrade() -> None:
    op.drop_table("class_documents")
    op.drop_table("class_members")
    op.drop_table("classes")
