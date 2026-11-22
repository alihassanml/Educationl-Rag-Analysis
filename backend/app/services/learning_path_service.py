"""The student's study path (Course Map): the topics of their documents in an order that follows
their results. It is worked out from the data each time, so it can never disagree with it."""

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document import STATUS_READY, Document
from app.models.quiz import DocumentTopic, PathEvent, Topic, TopicProgress
from app.schemas.learning_path import (
    LearningPath,
    NextAction,
    PathEventOut,
    PathSource,
    PathStep,
)
from app.services import recommendation_service as rules

EVENT_LIMIT = 10


@dataclass(frozen=True)
class Candidate:
    """What the ordering rule needs to know about a topic."""

    topic_id: uuid.UUID
    status: str
    accuracy: int | None  # percent
    document_order: int  # place in the documents, from 0


def order_path(candidates: list[Candidate]) -> list[Candidate]:
    """Document order, except that topics needing revision go first (the weakest first) and topics
    doing well go last. The rest keep their document order."""
    by_document = sorted(candidates, key=lambda c: c.document_order)
    front = sorted(
        (c for c in by_document if rules.route_group(c.status) == rules.ROUTE_FRONT),
        key=lambda c: (c.accuracy if c.accuracy is not None else 0, c.document_order),
    )
    middle = [c for c in by_document if rules.route_group(c.status) == rules.ROUTE_MIDDLE]
    end = [c for c in by_document if rules.route_group(c.status) == rules.ROUTE_END]
    return [*front, *middle, *end]


def next_action(status: str, has_progress: bool, level: str | None) -> NextAction:
    if status == rules.NEEDS_REVISION:
        return NextAction(
            kind="revise",
            message="Revise this topic with the tutor, then take a quiz at your level.",
        )
    if status == rules.DOING_WELL:
        return NextAction(
            kind="review_later", message="You are doing well here. Come back to it later."
        )
    if not has_progress:
        return NextAction(kind="start", message="Study this topic, then take a quiz on it.")
    return NextAction(
        kind="practice",
        message=f"Take another {level or 'beginner'} quiz to see how you are doing.",
    )


def _event_out(event: PathEvent, topic_name: str) -> PathEventOut:
    return PathEventOut(
        id=event.id,
        topic_id=event.topic_id,
        topic=topic_name,
        old_status=event.old_status,
        new_status=event.new_status,
        reason=event.reason,
        created_at=event.created_at,
    )


def build(db: Session, user_id: uuid.UUID) -> LearningPath:
    links = db.execute(
        select(DocumentTopic, Document.title, Topic)
        .join(Document, Document.id == DocumentTopic.document_id)
        .join(Topic, Topic.id == DocumentTopic.topic_id)
        .where(Document.user_id == user_id, Document.status == STATUS_READY)
        .order_by(Document.created_at, DocumentTopic.position)
    ).all()
    progress = {
        p.topic_id: p
        for p in db.scalars(select(TopicProgress).where(TopicProgress.user_id == user_id))
    }

    topics: dict[uuid.UUID, Topic] = {}
    sources: dict[uuid.UUID, list[PathSource]] = {}
    for link, title, topic in links:
        topics.setdefault(topic.id, topic)  # the first document that has it sets its place
        sources.setdefault(topic.id, []).append(
            PathSource(
                document_id=link.document_id,
                document_title=title,
                first_page=link.first_page,
                last_page=link.last_page,
            )
        )

    candidates = []
    for order, topic_id in enumerate(topics):
        p = progress.get(topic_id)
        correct, attempted = (p.correct_count, p.attempt_count) if p else (0, 0)
        candidates.append(
            Candidate(
                topic_id=topic_id,
                status=rules.classify(correct, attempted),
                accuracy=rules.percent(correct, attempted),
                document_order=order,
            )
        )
    ordered = order_path(candidates)
    current = next((c.topic_id for c in ordered if c.status != rules.DOING_WELL), None)

    steps = []
    for position, c in enumerate(ordered, start=1):
        p = progress.get(c.topic_id)
        level = p.current_difficulty if p else None
        steps.append(
            PathStep(
                topic_id=c.topic_id,
                name=topics[c.topic_id].name,
                position=position,
                status=c.status,
                level=level,  # type: ignore[arg-type]
                accuracy_percent=c.accuracy,
                questions_attempted=p.attempt_count if p else 0,
                sources=sources[c.topic_id],
                next_action=next_action(c.status, p is not None, level),
                is_current=c.topic_id == current,
            )
        )

    rows = db.execute(
        select(PathEvent, Topic.name)
        .join(Topic, Topic.id == PathEvent.topic_id)
        .where(PathEvent.user_id == user_id)
        .order_by(PathEvent.created_at.desc(), PathEvent.id)
        .limit(EVENT_LIMIT)
    ).all()
    events = [_event_out(e, name) for e, name in rows]
    return LearningPath(
        steps=steps,
        current_topic_id=current,
        latest_event=events[0] if events else None,
        events=events,
    )
