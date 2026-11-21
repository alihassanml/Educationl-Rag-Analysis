import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import NotFoundError
from app.models.chat import (
    ROLE_ASSISTANT,
    ROLE_USER,
    ChatCitation,
    ChatMessage,
    ChatThread,
    MessageFeedback,
)
from app.schemas.chat import CitationOut, FeedbackIn, FeedbackItem, MessageOut, ThreadDetail

DEFAULT_TITLE = "New chat"


def create_thread(db: Session, user_id: uuid.UUID, title: str | None = None) -> ChatThread:
    thread = ChatThread(user_id=user_id, title=(title or "").strip() or DEFAULT_TITLE)
    db.add(thread)
    db.commit()
    return thread


def list_threads(db: Session, user_id: uuid.UUID, limit: int, offset: int) -> list[ChatThread]:
    stmt = (
        select(ChatThread)
        .where(ChatThread.user_id == user_id)
        .order_by(ChatThread.updated_at.desc(), ChatThread.created_at.desc(), ChatThread.id)
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt))


def get_owned_thread(db: Session, user_id: uuid.UUID, thread_id: uuid.UUID) -> ChatThread:
    """Another user's thread is reported as missing, so its existence is never revealed."""
    thread = db.scalar(
        select(ChatThread).where(ChatThread.id == thread_id, ChatThread.user_id == user_id)
    )
    if thread is None:
        raise NotFoundError("Thread")
    return thread


def rename_thread(db: Session, user_id: uuid.UUID, thread_id: uuid.UUID, title: str) -> ChatThread:
    thread = get_owned_thread(db, user_id, thread_id)
    thread.title = title
    db.commit()
    return thread


def delete_thread(db: Session, user_id: uuid.UUID, thread_id: uuid.UUID) -> None:
    thread = get_owned_thread(db, user_id, thread_id)
    db.delete(thread)  # messages, citations and feedback go with it (ON DELETE CASCADE)
    db.commit()


def _citation_out(citation: ChatCitation) -> CitationOut:
    return CitationOut(
        marker=citation.marker,
        chunk_id=citation.chunk_id,
        document_id=citation.document_id,
        document_title=citation.document_title,
        page_number=citation.page_number,
        snippet=citation.snippet,
        source_deleted=citation.document_id is None,
    )


def message_out(message: ChatMessage, user_id: uuid.UUID) -> MessageOut:
    rating = next((f.rating for f in message.feedback if f.user_id == user_id), None)
    return MessageOut(
        id=message.id,
        role=message.role,  # type: ignore[arg-type]
        content=message.content,
        standalone_query=message.standalone_query if message.rewrite_used else None,
        rewrite_used=message.rewrite_used,
        abstained=message.abstained,
        status=message.status,  # type: ignore[arg-type]
        created_at=message.created_at,
        citations=[_citation_out(c) for c in message.citations],
        feedback=rating,  # type: ignore[arg-type]
    )


def thread_detail(db: Session, user_id: uuid.UUID, thread_id: uuid.UUID) -> ThreadDetail:
    thread = db.scalar(
        select(ChatThread)
        .where(ChatThread.id == thread_id, ChatThread.user_id == user_id)
        .options(
            selectinload(ChatThread.messages).selectinload(ChatMessage.citations),
            selectinload(ChatThread.messages).selectinload(ChatMessage.feedback),
        )
    )
    if thread is None:
        raise NotFoundError("Thread")
    return ThreadDetail(
        id=thread.id,
        title=thread.title,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        messages=[message_out(m, user_id) for m in thread.messages],
    )


def save_feedback(
    db: Session, user_id: uuid.UUID, message_id: uuid.UUID, body: FeedbackIn
) -> MessageFeedback:
    """One rating per student and answer; rating again replaces the earlier one."""
    message = db.scalar(
        select(ChatMessage).where(
            ChatMessage.id == message_id,
            ChatMessage.user_id == user_id,
            ChatMessage.role == ROLE_ASSISTANT,
        )
    )
    if message is None:
        raise NotFoundError("Message")
    feedback = db.scalar(
        select(MessageFeedback).where(
            MessageFeedback.message_id == message_id, MessageFeedback.user_id == user_id
        )
    )
    if feedback is None:
        feedback = MessageFeedback(message_id=message_id, user_id=user_id, rating=body.rating)
        db.add(feedback)
    feedback.rating = body.rating
    feedback.reason = body.reason
    db.commit()
    return feedback


def recent_feedback(db: Session, limit: int) -> list[FeedbackItem]:
    """Newest feedback first, with the question it answered. For administrators only."""
    rows = db.execute(
        select(MessageFeedback, ChatMessage)
        .join(ChatMessage, ChatMessage.id == MessageFeedback.message_id)
        .order_by(MessageFeedback.created_at.desc(), MessageFeedback.id)
        .limit(limit)
    ).all()
    items = []
    for feedback, answer in rows:
        question = db.scalar(
            select(ChatMessage.content)
            .where(
                ChatMessage.thread_id == answer.thread_id,
                ChatMessage.role == ROLE_USER,
                ChatMessage.created_at <= answer.created_at,
            )
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        items.append(
            FeedbackItem(
                message_id=answer.id,
                rating=feedback.rating,  # type: ignore[arg-type]
                reason=feedback.reason,
                question=question or "",
                answer=answer.content,
                abstained=answer.abstained,
                created_at=feedback.created_at,
            )
        )
    return items
