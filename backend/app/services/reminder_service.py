import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.models.notification import TYPE_REMINDER_DUE, Notification
from app.models.quiz import Quiz, TopicProgress
from app.models.user import User
from app.schemas.notifications import DueTopicOut
from app.schemas.quizzes import GenerateQuizRequest, QuizDetail
from app.services import notification_service, quiz_service, recommendation_service
from app.services.embedding_service import Embedder
from app.services.groq_service import GroqService

logger = logging.getLogger("app.reminders")


def calculate_interval_days(status: str, consecutive_passes: int) -> int:
    """Spaced repetition interval: base interval depends on mastery status,
    and doubles with each passed slip test up to the max configured days."""
    settings = get_settings()
    if status == recommendation_service.STATUS_NEEDS_REVISION:
        base = settings.spaced_interval_needs_revision_days
    elif status == recommendation_service.STATUS_DOING_WELL:
        base = settings.spaced_interval_doing_well_days
    else:
        base = settings.spaced_interval_practicing_days

    multiplier = 2 ** max(0, consecutive_passes)
    return min(settings.spaced_interval_max_days, base * multiplier)


def is_topic_due(
    last_practiced_at: datetime,
    status: str,
    consecutive_passes: int,
    now: datetime | None = None,
) -> tuple[bool, int, datetime, int]:
    """Returns (is_due, interval_days, next_due_at, days_overdue)."""
    current_time = now or datetime.now(UTC)
    interval = calculate_interval_days(status, consecutive_passes)
    next_due = last_practiced_at + timedelta(days=interval)
    is_due = current_time >= next_due
    days_overdue = max(0, (current_time - next_due).days) if is_due else 0
    return is_due, interval, next_due, days_overdue


def get_due_topics(
    db: Session,
    user_id: uuid.UUID,
    now: datetime | None = None,
) -> list[DueTopicOut]:
    current_time = now or datetime.now(UTC)
    progress_rows = db.scalars(
        select(TopicProgress)
        .options(selectinload(TopicProgress.topic))
        .where(TopicProgress.user_id == user_id)
    ).all()

    due_list: list[DueTopicOut] = []
    for p in progress_rows:
        if not p.topic:
            continue
        status = recommendation_service.classify(p.correct_count, p.attempt_count)
        last_practiced = p.last_practiced_at or p.updated_at or current_time
        due, interval, next_due, days_overdue = is_topic_due(
            last_practiced, status, p.consecutive_slip_passes, current_time
        )
        if due:
            due_list.append(
                DueTopicOut(
                    topic_id=p.topic_id,
                    topic_name=p.topic.name,
                    status=status,
                    current_difficulty=p.current_difficulty,
                    interval_days=interval,
                    last_practiced_at=last_practiced,
                    next_due_at=next_due,
                    is_due=True,
                    days_overdue=days_overdue,
                )
            )

    # Sort most overdue and weakest status first
    due_list.sort(
        key=lambda d: (
            0 if d.status == recommendation_service.STATUS_NEEDS_REVISION else 1,
            -d.days_overdue,
        )
    )
    return due_list


def generate_slip_test(
    db: Session,
    embedder: Embedder,
    llm: GroqService,
    user_id: uuid.UUID,
    topic_name: str,
) -> QuizDetail:
    """Generates a 3-question quick slip test on the due topic at its current difficulty."""
    settings = get_settings()
    detail = quiz_service.generate_quiz(
        db=db,
        embedder=embedder,
        llm=llm,
        user_id=user_id,
        request=GenerateQuizRequest(
            topic=topic_name,
            num_questions=settings.slip_test_questions,
        ),
    )
    quiz = db.scalar(select(Quiz).where(Quiz.id == detail.id))
    if quiz:
        quiz.kind = quiz_service.KIND_SLIP_TEST
        quiz.title = f"Slip test: {topic_name}"
        db.commit()
        db.refresh(quiz)
    return detail


def send_due_reminders_job(db: Session, now: datetime | None = None) -> int:
    """Hourly job: finds students who have reminders enabled and have due topics,
    and creates at most 1 reminder notification per day."""
    current_time = now or datetime.now(UTC)
    users = db.scalars(select(User).where(User.reminders_enabled.is_(True))).all()

    reminders_sent = 0
    one_day_ago = current_time - timedelta(days=1)

    for user in users:
        # Check if already sent in last 24h
        recent_notif = db.scalar(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.type == TYPE_REMINDER_DUE,
                Notification.created_at >= one_day_ago,
            )
        )
        if recent_notif:
            continue

        due = get_due_topics(db, user.id, current_time)
        if not due:
            continue

        first_due = due[0]
        topic_count = len(due)
        more_text = (
            f" and {topic_count - 1} other topic{'s' if topic_count > 2 else ''}"
            if topic_count > 1
            else ""
        )

        notification_service.create_notification(
            db=db,
            user_id=user.id,
            type_=TYPE_REMINDER_DUE,
            title=f"Review due: {first_due.topic_name}",
            body=(
                f"It's time to review {first_due.topic_name}{more_text}. "
                "Take a 2-minute slip test to keep your memory sharp."
            ),
            link="/dashboard",
        )
        reminders_sent += 1

    if reminders_sent > 0:
        db.commit()

    return reminders_sent
