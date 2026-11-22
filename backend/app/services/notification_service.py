import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models.notification import Notification


def create_notification(
    db: Session,
    user_id: uuid.UUID,
    type_: str,
    title: str,
    body: str,
    link: str | None = None,
) -> Notification:
    notif = Notification(
        user_id=user_id,
        type=type_,
        title=title,
        body=body,
        link=link,
    )
    db.add(notif)
    db.flush()
    return notif


def list_notifications(
    db: Session,
    user_id: uuid.UUID,
    limit: int = 50,
) -> tuple[list[Notification], int]:
    notifications = list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
            .limit(limit)
        ).all()
    )
    unread_count = (
        db.scalar(
            select(func.count(Notification.id)).where(
                Notification.user_id == user_id,
                Notification.read_at.is_(None),
            )
        )
        or 0
    )
    return notifications, unread_count


def mark_as_read(db: Session, user_id: uuid.UUID, notification_id: uuid.UUID) -> Notification:
    notif = db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )
    if not notif:
        raise NotFoundError("Notification not found")
    if notif.read_at is None:
        notif.read_at = datetime.now(UTC)
        db.flush()
    return notif


def mark_all_as_read(db: Session, user_id: uuid.UUID) -> int:
    result = db.execute(
        update(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
        .values(read_at=datetime.now(UTC))
    )
    db.flush()
    return int(result.rowcount or 0)
