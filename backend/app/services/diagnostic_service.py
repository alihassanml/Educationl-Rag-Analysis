"""The diagnostic test: a short mixed quiz, one or two questions on each of the student's topics,
whose result sets the starting level of every topic (Student Profile Builder)."""

import logging
import uuid
from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.models.document import STATUS_READY, Document
from app.models.quiz import DocumentTopic, Quiz, QuizAttempt, Topic
from app.schemas.quizzes import QuizDetail
from app.services import quiz_service, recommendation_service, retrieval_service, topic_service
from app.services.embedding_service import Embedder
from app.services.groq_service import GroqService

logger = logging.getLogger("app.diagnostic")

_PASSAGES_PER_TOPIC = 6
# Difficulty of the single question of a topic, cycled so the whole test is mixed
_SINGLE_CYCLE = ("intermediate", "beginner", "advanced")


class DiagnosticStatus(BaseModel):
    ready_documents: int
    topic_count: int
    # A diagnostic can be taken: there is at least one ready document with topics
    available: bool
    taken: bool
    taken_at: datetime | None
    latest_quiz_id: uuid.UUID | None  # the diagnostic whose result can be viewed
    pending_quiz_id: uuid.UUID | None  # a diagnostic that was created and not finished
    # The dashboard card: available and never taken
    suggested: bool


def student_topics(db: Session, user_id: uuid.UUID) -> list[Topic]:
    """The topics of the student's ready documents, in document order, each once."""
    rows = db.execute(
        select(Topic)
        .join(DocumentTopic, DocumentTopic.topic_id == Topic.id)
        .join(Document, Document.id == DocumentTopic.document_id)
        .where(Topic.user_id == user_id, Document.status == STATUS_READY)
        .order_by(Document.created_at, DocumentTopic.position)
    ).scalars()
    seen: set[uuid.UUID] = set()
    topics: list[Topic] = []
    for topic in rows:
        if topic.id not in seen:
            seen.add(topic.id)
            topics.append(topic)
    return topics


def _pending(db: Session, user_id: uuid.UUID) -> Quiz | None:
    """The latest diagnostic the student has not answered, if no document was added since."""
    quiz = db.scalar(
        select(Quiz)
        .where(
            Quiz.user_id == user_id,
            Quiz.kind == quiz_service.KIND_DIAGNOSTIC,
            ~select(QuizAttempt.id).where(QuizAttempt.quiz_id == Quiz.id).exists(),
        )
        .order_by(Quiz.created_at.desc())
        .limit(1)
    )
    if quiz is None:
        return None
    newest_document = db.scalar(
        select(func.max(Document.created_at)).where(Document.user_id == user_id)
    )
    return quiz if newest_document is None or newest_document <= quiz.created_at else None


def status(db: Session, user_id: uuid.UUID) -> DiagnosticStatus:
    ready = (
        db.scalar(
            select(func.count()).where(Document.user_id == user_id, Document.status == STATUS_READY)
        )
        or 0
    )
    topic_count = len(student_topics(db, user_id))
    latest = db.execute(
        select(Quiz.id, QuizAttempt.completed_at)
        .join(QuizAttempt, QuizAttempt.quiz_id == Quiz.id)
        .where(Quiz.user_id == user_id, Quiz.kind == quiz_service.KIND_DIAGNOSTIC)
        .order_by(QuizAttempt.completed_at.desc())
        .limit(1)
    ).first()
    pending = _pending(db, user_id)
    available = ready >= 1 and topic_count >= 1
    return DiagnosticStatus(
        ready_documents=ready,
        topic_count=topic_count,
        available=available,
        taken=latest is not None,
        taken_at=latest[1] if latest else None,
        latest_quiz_id=latest[0] if latest else None,
        pending_quiz_id=pending.id if pending else None,
        suggested=available and latest is None,
    )


def _levels_for(count: int, index: int) -> str:
    if count == 2:
        return "one beginner-level question and one intermediate-level question"
    return f"{_SINGLE_CYCLE[index % len(_SINGLE_CYCLE)]}-level question"


def start(db: Session, embedder: Embedder, llm: GroqService, user_id: uuid.UUID) -> QuizDetail:
    """Create the diagnostic (or hand back the one the student has not finished yet)."""
    pending = _pending(db, user_id)
    if pending is not None:
        return quiz_service.get_quiz_detail(db, user_id, pending.id)

    topics = student_topics(db, user_id)
    if not topics:
        raise AppError(
            422,
            "no_topics",
            "Upload a document and wait for it to finish processing. The diagnostic asks about "
            "the topics found in your material.",
        )
    plan = recommendation_service.diagnostic_plan(
        len(topics), get_settings().diagnostic_max_questions
    )
    seen: set[str] = set()
    chunks_all: list[retrieval_service.RetrievedChunk] = []
    questions = []
    for index, (topic, count) in enumerate(zip(topics, plan, strict=False)):
        chunks = topic_service.anchor_chunks(db, user_id, topic.id, _PASSAGES_PER_TOPIC) or (
            retrieval_service.retrieve(db, embedder, user_id, topic.name, top_k=_PASSAGES_PER_TOPIC)
        )
        if not chunks:
            continue
        written, _ = quiz_service.write_questions(
            llm, chunks, count, _levels_for(count, index), topic=topic.name, seen=seen
        )
        if written:
            questions.append((topic, chunks, written[:count]))
            chunks_all.extend(chunks)

    total = sum(len(w) for _, _, w in questions)
    if total < 3:
        raise AppError(
            502,
            "quiz_generation_failed",
            "Could not create a reliable diagnostic from this material. Please try again.",
        )
    quiz = Quiz(
        user_id=user_id,
        title="Diagnostic test",
        kind=quiz_service.KIND_DIAGNOSTIC,
        topic_id=None,
        difficulty="mixed",
        source_document_ids=sorted({str(c.document_id) for c in chunks_all}),
    )
    position = 1
    for topic, chunks, written in questions:
        quiz.questions.extend(quiz_service.build_questions(chunks, written, topic.id, position))
        position += len(written)
    db.add(quiz)
    db.commit()
    return quiz_service.get_quiz_detail(db, user_id, quiz.id)
