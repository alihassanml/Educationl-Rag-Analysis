from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.progress import ProgressSummary, TopicProgressList
from app.services import progress_service

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/summary", response_model=ProgressSummary)
def summary(user: CurrentUser, db: DbSession) -> ProgressSummary:
    return progress_service.summary(db, user.id)


@router.get("/topics", response_model=TopicProgressList)
def topics(user: CurrentUser, db: DbSession) -> TopicProgressList:
    return progress_service.topic_progress_list(db, user.id)
