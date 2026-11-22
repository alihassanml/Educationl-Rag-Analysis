from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.learning_path import LearningPath
from app.services import learning_path_service

router = APIRouter(prefix="/learning-path", tags=["learning-path"])


@router.get("", response_model=LearningPath)
def learning_path(user: CurrentUser, db: DbSession) -> LearningPath:
    """The student's ordered study path (Course Map) and the latest changes to it."""
    return learning_path_service.build(db, user.id)
