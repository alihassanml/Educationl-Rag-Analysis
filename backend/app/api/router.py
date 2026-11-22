from fastapi import APIRouter, Depends

from app.api.deps import require_trusted_origin
from app.api.routes import (
    auth,
    diagnostic,
    documents,
    evaluation,
    health,
    learning_path,
    light_mode,
    progress,
    quizzes,
    tutor,
)

api_router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_trusted_origin)])
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(documents.router)
api_router.include_router(tutor.router)
api_router.include_router(quizzes.router)
api_router.include_router(diagnostic.router)
api_router.include_router(learning_path.router)
api_router.include_router(light_mode.router)
api_router.include_router(progress.router)
api_router.include_router(evaluation.router)
