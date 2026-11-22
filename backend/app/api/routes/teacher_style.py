from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, DbSession
from app.schemas.teacher_style import TeacherStyleStatus
from app.services import teacher_style_service
from app.services.groq_service import GroqService, get_groq_service

router = APIRouter(prefix="/teacher-style", tags=["teacher-style"])


@router.get("", response_model=TeacherStyleStatus)
def style_status(user: CurrentUser, db: DbSession) -> TeacherStyleStatus:
    """Whether the student has teacher material, and what was learned from it."""
    return teacher_style_service.status(db, user.id)


@router.post("/build", response_model=TeacherStyleStatus)
def build_style(
    user: CurrentUser, db: DbSession, llm: Annotated[GroqService, Depends(get_groq_service)]
) -> TeacherStyleStatus:
    """Learn the teacher's style from the current teacher material, unless it is up to date."""
    teacher_style_service.ensure_profile(db, llm, user.id)
    return teacher_style_service.status(db, user.id)
