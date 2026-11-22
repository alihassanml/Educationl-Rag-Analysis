import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.notifications import NotificationListOut, NotificationOut
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListOut)
def list_notifications(
    user: CurrentUser,
    db: DbSession,
) -> NotificationListOut:
    items, unread = notification_service.list_notifications(db=db, user_id=user.id)
    return NotificationListOut(
        notifications=[
            NotificationOut(
                id=n.id,
                type=n.type,
                title=n.title,
                body=n.body,
                link=n.link,
                read_at=n.read_at,
                created_at=n.created_at,
            )
            for n in items
        ],
        unread_count=unread,
    )


@router.patch("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> NotificationOut:
    notif = notification_service.mark_as_read(
        db=db, user_id=user.id, notification_id=notification_id
    )
    db.commit()
    return NotificationOut(
        id=notif.id,
        type=notif.type,
        title=notif.title,
        body=notif.body,
        link=notif.link,
        read_at=notif.read_at,
        created_at=notif.created_at,
    )


@router.post("/read-all")
def mark_all_read(
    user: CurrentUser,
    db: DbSession,
) -> dict[str, int]:
    count = notification_service.mark_all_as_read(db=db, user_id=user.id)
    db.commit()
    return {"updated": count}
