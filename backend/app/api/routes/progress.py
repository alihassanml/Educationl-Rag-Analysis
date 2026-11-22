from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.progress import ProgressSummary, StudyInsights, TopicProgressList
from app.services import insights_service, progress_service

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/summary", response_model=ProgressSummary)
def summary(user: CurrentUser, db: DbSession) -> ProgressSummary:
    return progress_service.summary(db, user.id)


@router.get("/topics", response_model=TopicProgressList)
def topics(user: CurrentUser, db: DbSession) -> TopicProgressList:
    return progress_service.topic_progress_list(db, user.id)


@router.get("/insights", response_model=StudyInsights)
def insights(
    user: CurrentUser,
    db: DbSession,
    tz: str | None = Query(
        default=None, max_length=64, description="IANA time zone, e.g. Asia/Karachi"
    ),
) -> StudyInsights:
    return insights_service.insights(db, user.id, tz)
