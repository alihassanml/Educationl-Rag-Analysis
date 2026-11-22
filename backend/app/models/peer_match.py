import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.quiz import Quiz
from app.models.user import User

STATUS_PENDING = "pending"
STATUS_ACCEPTED = "accepted"
STATUS_DECLINED = "declined"
STATUS_COMPLETED = "completed"
STATUS_EXPIRED = "expired"
STATUS_CANCELLED = "cancelled"


class PeerChallenge(Base):
    __tablename__ = "peer_challenges"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    challenger_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    opponent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    topic_name: Mapped[str] = mapped_column(String(120))
    difficulty: Mapped[str] = mapped_column(String(20), default="intermediate")
    status: Mapped[str] = mapped_column(
        String(20), default=STATUS_PENDING, server_default=STATUS_PENDING, index=True
    )

    challenger_quiz_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("quizzes.id", ondelete="SET NULL"), nullable=True
    )
    opponent_quiz_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("quizzes.id", ondelete="SET NULL"), nullable=True
    )

    challenger_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    challenger_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    challenger_time_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    opponent_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    opponent_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    opponent_time_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    winner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    challenger: Mapped[User] = relationship(foreign_keys=[challenger_id])
    opponent: Mapped[User] = relationship(foreign_keys=[opponent_id])
    winner: Mapped[User | None] = relationship(foreign_keys=[winner_id])
    challenger_quiz: Mapped[Quiz | None] = relationship(foreign_keys=[challenger_quiz_id])
    opponent_quiz: Mapped[Quiz | None] = relationship(foreign_keys=[opponent_quiz_id])


class PeerBlock(Base):
    __tablename__ = "peer_blocks"
    __table_args__ = (
        UniqueConstraint("user_id", "blocked_user_id", name="uq_peer_blocks_user_blocked"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    blocked_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(foreign_keys=[user_id])
    blocked_user: Mapped[User] = relationship(foreign_keys=[blocked_user_id])
