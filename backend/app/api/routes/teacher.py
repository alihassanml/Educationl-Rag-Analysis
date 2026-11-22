import uuid

from fastapi import APIRouter

from app.api.deps import DbSession, TeacherUser
from app.schemas.teacher import ClassInsights
from app.services import teacher_dashboard_service

router = APIRouter(prefix="/teacher", tags=["teacher"])


@router.get("/classes/{class_id}/insights", response_model=ClassInsights)
def class_insights(class_id: uuid.UUID, teacher: TeacherUser, db: DbSession) -> ClassInsights:
    return teacher_dashboard_service.insights(db, teacher, class_id)
