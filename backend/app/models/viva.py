import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import User

STATUS_IN_PROGRESS = "in_progress"
STATUS_COMPLETED = "completed"
STATUS_ABANDONED = "abandoned"


class VivaSession(Base):
    __tablename__ = "viva_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    topic_name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(
        String(20), default=STATUS_IN_PROGRESS, server_default=STATUS_IN_PROGRESS
    )
    tab_switch_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_score: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    max_score: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    overall_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship()
    turns: Mapped[list["VivaTurn"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="VivaTurn.turn_index"
    )


class VivaTurn(Base):
    __tablename__ = "viva_turns"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("viva_sessions.id", ondelete="CASCADE"), index=True
    )
    turn_index: Mapped[int] = mapped_column(Integer)
    question_text: Mapped[str] = mapped_column(Text)
    source_citations: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    student_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    follow_up_question: Mapped[str | None] = mapped_column(Text, nullable=True)
    follow_up_answer: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Rubric breakdown: 0 to 2 each
    grade_accuracy: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grade_completeness: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grade_own_words: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grade_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grade_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    ideal_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped[VivaSession] = relationship(back_populates="turns")
