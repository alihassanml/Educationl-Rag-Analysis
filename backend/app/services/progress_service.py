import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.document import STATUS_READY, Document
from app.models.quiz import Quiz, QuizAttempt, Topic, TopicProgress
from app.schemas.progress import (
    ActivityItem,
    LatestDocument,
    ProgressSummary,
    Rules,
    TopicProgressList,
    TopicProgressOut,
)
from app.schemas.quizzes import Recommendation
from app.services import recommendation_service as rules
from app.services import topic_service
from app.services.retrieval_service import RetrievedChunk

_PRIORITY = {
    rules.NEEDS_REVISION: 0,
    rules.PRACTICING: 1,
    rules.INSUFFICIENT_DATA: 2,
    rules.DOING_WELL: 3,
}


@dataclass(frozen=True)
class AttemptOutcome:
    """What one quiz result did to a topic."""

    previous_difficulty: str  # the level the quiz was taken at
    next_difficulty: str  # the level of the next quiz on the topic
    old_status: str
    new_status: str
    needs_support: bool


def record_attempt(
    db: Session,
    user_id: uuid.UUID,
    topic_id: uuid.UUID,
    correct: int,
    total: int,
    difficulty: str = "beginner",
    *,
    adjust_level: bool = True,
) -> AttemptOutcome:
    """Add a finished quiz to the topic's running totals and move the topic's level by the result.
    Called in the same transaction as the attempt so the two can never disagree.

    `adjust_level=False` records the answers but leaves the level alone (diagnostic and
    confidence quizzes set or restore the level in their own way)."""
    progress = db.scalar(
        select(TopicProgress)
        .where(TopicProgress.user_id == user_id, TopicProgress.topic_id == topic_id)
        .with_for_update()
    )
    if progress is None:
        progress = TopicProgress(
            user_id=user_id,
            topic_id=topic_id,
            attempt_count=0,
            correct_count=0,
            current_difficulty="beginner",
            failed_streak=0,
            needs_support=False,
        )
        db.add(progress)
    old_status = rules.classify(progress.correct_count, progress.attempt_count)
    progress.attempt_count += total
    progress.correct_count += correct
    progress.last_practiced_at = func.now()
    following = difficulty
    if adjust_level:
        rule = rules.LevelRule.from_settings()
        following = rules.next_level(difficulty, correct, total, rule)
        progress.current_difficulty = following
        progress.failed_streak = rules.next_failed_streak(
            progress.failed_streak, difficulty, correct, total, rule
        )
        progress.needs_support = rules.needs_support(progress.failed_streak, rule)
    return AttemptOutcome(
        previous_difficulty=difficulty,
        next_difficulty=following,
        old_status=old_status,
        new_status=rules.classify(progress.correct_count, progress.attempt_count),
        needs_support=progress.needs_support,
    )


def struggling_with(db: Session, user_id: uuid.UUID, chunks: list[RetrievedChunk]) -> bool:
    """Do these passages belong to a topic the student needs to revise?"""
    topic_ids = topic_service.chunk_topic_ids(db, user_id, chunks)
    if not topic_ids:
        return False
    rows = db.execute(
        select(TopicProgress.correct_count, TopicProgress.attempt_count).where(
            TopicProgress.user_id == user_id, TopicProgress.topic_id.in_(topic_ids)
        )
    )
    return any(rules.classify(c, a) == rules.NEEDS_REVISION for c, a in rows)


def _to_out(progress: TopicProgress, topic_name: str) -> TopicProgressOut:
    rec = rules.recommend(topic_name, progress.correct_count, progress.attempt_count)
    return TopicProgressOut(
        topic_id=progress.topic_id,
        topic_name=topic_name,
        questions_attempted=progress.attempt_count,
        correct_answers=progress.correct_count,
        accuracy_percent=rules.percent(progress.correct_count, progress.attempt_count),
        status=rules.classify(progress.correct_count, progress.attempt_count),
        recommendation=Recommendation(action=rec.action, message=rec.message),
        last_practiced_at=progress.last_practiced_at,
    )


def _rules() -> Rules:
    t = rules.Thresholds.from_settings()
    return Rules(
        min_attempts=t.min_attempts,
        needs_revision_below_percent=t.needs_revision_below,
        doing_well_from_percent=t.doing_well_from,
    )


def topic_progress(db: Session, user_id: uuid.UUID) -> list[TopicProgressOut]:
    rows = db.execute(
        select(TopicProgress, Topic.name)
        .join(Topic, Topic.id == TopicProgress.topic_id)
        .where(TopicProgress.user_id == user_id)
    ).all()
    items = [_to_out(p, name) for p, name in rows]
    # Weakest topics first; within a status, the least recently practiced first
    return sorted(
        items,
        key=lambda i: (_PRIORITY[i.status], i.accuracy_percent or 0, i.last_practiced_at),
    )


def topic_progress_list(db: Session, user_id: uuid.UUID) -> TopicProgressList:
    return TopicProgressList(items=topic_progress(db, user_id), rules=_rules())


def _activity(db: Session, user_id: uuid.UUID) -> list[ActivityItem]:
    rows = db.execute(
        select(QuizAttempt, Quiz.title, Topic.name)
        .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
        .outerjoin(Topic, Topic.id == Quiz.topic_id)
        .where(QuizAttempt.user_id == user_id)
        .order_by(QuizAttempt.completed_at.desc())
    ).all()
    return [
        ActivityItem(
            quiz_id=a.quiz_id,
            quiz_title=title,
            topic=topic,
            score=a.score,
            total_questions=a.total_questions,
            percent=round(a.score * 100 / a.total_questions),
            completed_at=a.completed_at,
        )
        for a, title, topic in rows
    ]


def summary(db: Session, user_id: uuid.UUID) -> ProgressSummary:
    docs_total = db.scalar(select(func.count()).where(Document.user_id == user_id)) or 0
    docs_ready = (
        db.scalar(
            select(func.count()).where(Document.user_id == user_id, Document.status == STATUS_READY)
        )
        or 0
    )
    activity = _activity(db, user_id)  # newest first
    topics = topic_progress(db, user_id)
    weak = [t for t in topics if t.status == rules.NEEDS_REVISION]
    latest = db.scalar(
        select(Document)
        .where(Document.user_id == user_id, Document.status == STATUS_READY)
        .order_by(Document.created_at.desc())
        .limit(1)
    )
    average = round(sum(a.percent for a in activity) / len(activity)) if activity else None
    return ProgressSummary(
        documents_total=docs_total,
        documents_ready=docs_ready,
        quizzes_completed=len(activity),
        average_score_percent=average,
        topics_needing_revision=len(weak),
        needs_revision=weak,
        next_step=topics[0] if topics else None,
        recent_activity=activity[:5],
        score_history=list(reversed(activity[:20])),
        latest_document=LatestDocument(id=latest.id, title=latest.title) if latest else None,
    )


__all__ = [
    "AttemptOutcome",
    "record_attempt",
    "struggling_with",
    "summary",
    "topic_progress_list",
]
