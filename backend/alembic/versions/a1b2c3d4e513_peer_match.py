"""peer match duels and blocks

Revision ID: a1b2c3d4e513
Revises: a1b2c3d4e512
Create Date: 2026-11-25 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e513"
down_revision: str | Sequence[str] | None = "a1b2c3d4e512"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "peer_match_opt_in",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.create_table(
        "peer_challenges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("challenger_id", sa.Uuid(), nullable=False),
        sa.Column("opponent_id", sa.Uuid(), nullable=False),
        sa.Column("topic_name", sa.String(length=120), nullable=False),
        sa.Column("difficulty", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("challenger_quiz_id", sa.Uuid(), nullable=True),
        sa.Column("opponent_quiz_id", sa.Uuid(), nullable=True),
        sa.Column("challenger_score", sa.Integer(), nullable=True),
        sa.Column("challenger_total", sa.Integer(), nullable=True),
        sa.Column("challenger_time_seconds", sa.Integer(), nullable=True),
        sa.Column("opponent_score", sa.Integer(), nullable=True),
        sa.Column("opponent_total", sa.Integer(), nullable=True),
        sa.Column("opponent_time_seconds", sa.Integer(), nullable=True),
        sa.Column("winner_id", sa.Uuid(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["challenger_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["opponent_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["challenger_quiz_id"], ["quizzes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["opponent_quiz_id"], ["quizzes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["winner_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_peer_challenges_challenger_id", "peer_challenges", ["challenger_id"])
    op.create_index("ix_peer_challenges_opponent_id", "peer_challenges", ["opponent_id"])
    op.create_index("ix_peer_challenges_status", "peer_challenges", ["status"])

    op.create_table(
        "peer_blocks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("blocked_user_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["blocked_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "blocked_user_id", name="uq_peer_blocks_user_blocked"),
    )
    op.create_index("ix_peer_blocks_user_id", "peer_blocks", ["user_id"])


def downgrade() -> None:
    op.drop_table("peer_blocks")
    op.drop_table("peer_challenges")
    op.drop_column("users", "peer_match_opt_in")
