import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

ROLE_USER = "user"
ROLE_ASSISTANT = "assistant"

STATUS_COMPLETE = "complete"
STATUS_STOPPED = "stopped"
STATUS_FAILED = "failed"

RATING_UP = "up"
RATING_DOWN = "down"


def _now() -> datetime:
    """Wall-clock time per row. Postgres now() is fixed for a whole transaction, which would tie
    the user and assistant messages written in one request."""
    return datetime.now(UTC)


class ChatThread(Base):
    __tablename__ = "chat_threads"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, server_default=func.now(), onupdate=_now
    )

    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="thread",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ChatMessage.created_at, ChatMessage.id",
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat_threads.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(10))
    content: Mapped[str] = mapped_column(Text, default="")
    # The question that was actually searched, when it differs from what the student typed
    standalone_query: Mapped[str | None] = mapped_column(Text, nullable=True)
    rewrite_used: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    rewrite_fallback: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    abstained: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # Written in simpler words because the passages belong to a topic the student must revise
    simplified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    status: Mapped[str] = mapped_column(String(10), default=STATUS_COMPLETE)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    latency_ms: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, server_default=func.now()
    )

    thread: Mapped[ChatThread] = relationship(back_populates="messages")
    citations: Mapped[list["ChatCitation"]] = relationship(
        back_populates="message",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ChatCitation.marker",
    )
    feedback: Mapped[list["MessageFeedback"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )


class ChatCitation(Base):
    """A source shown with an answer. Built from retrieval metadata only. Title and snippet are
    copied so the history still reads well after the document is deleted; the document and chunk
    links are then cleared and the UI shows "Source deleted"."""

    __tablename__ = "chat_citations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    message_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat_messages.id", ondelete="CASCADE"), index=True
    )
    chunk_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("document_chunks.id", ondelete="SET NULL"), nullable=True
    )
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    document_title: Mapped[str] = mapped_column(String(255))
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    section_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    marker: Mapped[int] = mapped_column(Integer)
    snippet: Mapped[str] = mapped_column(Text, default="")

    message: Mapped[ChatMessage] = relationship(back_populates="citations")


class MessageFeedback(Base):
    __tablename__ = "message_feedback"
    __table_args__ = (UniqueConstraint("message_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    message_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat_messages.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    rating: Mapped[str] = mapped_column(String(4))
    reason: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, server_default=func.now()
    )
