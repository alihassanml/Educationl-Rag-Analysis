from fastapi import APIRouter, Depends

from app.api.deps import require_trusted_origin
from app.api.routes import (
    auth,
    classes,
    diagnostic,
    documents,
    evaluation,
    exam_predictor,
    health,
    learning_path,
    light_mode,
    notifications,
    peer_match,
    progress,
    quizzes,
    reminders,
    teacher,
    teacher_style,
    tutor,
    viva,
)

api_router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_trusted_origin)])
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(documents.router)
api_router.include_router(classes.router)
api_router.include_router(tutor.router)
api_router.include_router(quizzes.router)
api_router.include_router(diagnostic.router)
api_router.include_router(exam_predictor.router)
api_router.include_router(teacher.router)
api_router.include_router(teacher_style.router)
api_router.include_router(learning_path.router)
api_router.include_router(light_mode.router)
api_router.include_router(progress.router)
api_router.include_router(peer_match.router)
api_router.include_router(viva.router)
api_router.include_router(notifications.router)
api_router.include_router(reminders.router)
api_router.include_router(evaluation.router)
