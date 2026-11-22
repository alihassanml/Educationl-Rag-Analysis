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
from app.services import exam_predictor_service, mood_service
from app.services import recommendation_service as rules

EVENT_LIMIT = 10


@dataclass(frozen=True)
class Candidate:
    """What the ordering rule needs to know about a topic."""

    topic_id: uuid.UUID
    status: str
    accuracy: int | None  # percent
    document_order: int  # place in the documents, from 0
    boosted: bool = False  # likely in the exam and needs revision, or pinned by the student


def order_path(candidates: list[Candidate]) -> list[Candidate]:
    """Document order, except that topics needing revision go first (the weakest first) and topics
    doing well go last. The rest keep their document order. A boosted topic (predicted to be in
    the exam and weak, or pinned by the student) goes before all of those."""
    by_document = sorted(candidates, key=lambda c: c.document_order)

    def weakest_first(c: Candidate) -> tuple[int, int]:
        return (c.accuracy if c.accuracy is not None else 0, c.document_order)

    boosted = sorted((c for c in by_document if c.boosted), key=weakest_first)
    rest = [c for c in by_document if not c.boosted]
    front = sorted(
        (c for c in rest if rules.route_group(c.status) == rules.ROUTE_FRONT), key=weakest_first
    )
    middle = [c for c in rest if rules.route_group(c.status) == rules.ROUTE_MIDDLE]
    end = [c for c in rest if rules.route_group(c.status) == rules.ROUTE_END]
    return [*boosted, *front, *middle, *end]


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

    exam = exam_predictor_service.priority_topics(db, user_id)
    candidates = []
    priority_reason: dict[uuid.UUID, str] = {}
    for order, topic_id in enumerate(topics):
        p = progress.get(topic_id)
        correct, attempted = (p.correct_count, p.attempt_count) if p else (0, 0)
        status = rules.classify(correct, attempted)
        why = exam.get(topic_id)
        if why == "pinned":
            priority_reason[topic_id] = "Added to your priority"
        elif why == "High" and status == rules.NEEDS_REVISION:
            priority_reason[topic_id] = "Likely in exam"
        candidates.append(
            Candidate(
                topic_id=topic_id,
                status=status,
                accuracy=rules.percent(correct, attempted),
                document_order=order,
                boosted=topic_id in priority_reason,
            )
        )
    ordered = order_path(candidates)
    current = next((c.topic_id for c in ordered if c.status != rules.DOING_WELL), None)
    light = mood_service.active_topic_ids(db, user_id)

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
                next_action=(
                    NextAction(
                        kind="light",
                        message=(
                            f"Let's take a lighter step on {topics[c.topic_id].name}: "
                            "a quick recap, then a short confidence quiz."
                        ),
                    )
                    if c.topic_id in light
                    else next_action(c.status, p is not None, level)
                ),
                is_current=c.topic_id == current,
                light_episode_id=light.get(c.topic_id),
                priority_reason=priority_reason.get(c.topic_id),
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
