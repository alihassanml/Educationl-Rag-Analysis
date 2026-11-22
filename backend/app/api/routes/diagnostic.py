from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.quizzes import QuizDetail
from app.services import diagnostic_service
from app.services.diagnostic_service import DiagnosticStatus
from app.services.embedding_service import Embedder, get_embedder
from app.services.groq_service import GroqService, get_groq_service

router = APIRouter(prefix="/diagnostic", tags=["diagnostic"])


@router.get("/status", response_model=DiagnosticStatus)
def diagnostic_status(user: CurrentUser, db: DbSession) -> DiagnosticStatus:
    return diagnostic_service.status(db, user.id)


@router.post("", response_model=QuizDetail, status_code=status.HTTP_201_CREATED)
def start_diagnostic(
    user: CurrentUser,
    db: DbSession,
    embedder: Annotated[Embedder, Depends(get_embedder)],
    llm: Annotated[GroqService, Depends(get_groq_service)],
) -> QuizDetail:
    """Start the diagnostic test, or return the one that was started and not finished. Answers are
    submitted like any quiz, to /quizzes/{id}/attempts."""
    return diagnostic_service.start(db, embedder, llm, user.id)
