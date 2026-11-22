import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.light_mode import LightEpisodeOut, Recap
from app.schemas.quizzes import QuizDetail
from app.services import light_mode_service
from app.services.embedding_service import Embedder, get_embedder
from app.services.groq_service import GroqService, get_groq_service

router = APIRouter(prefix="/light-mode", tags=["light-mode"])


@router.get("", response_model=list[LightEpisodeOut])
def active_episodes(user: CurrentUser, db: DbSession) -> list[LightEpisodeOut]:
    """The student's running lighter steps (none when they have switched light mode off)."""
    return light_mode_service.list_active(db, user.id)


@router.post("/{episode_id}/recap", response_model=Recap)
def recap(
    episode_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    embedder: Annotated[Embedder, Depends(get_embedder)],
    llm: Annotated[GroqService, Depends(get_groq_service)],
) -> Recap:
    return light_mode_service.get_recap(db, embedder, llm, user.id, episode_id)


@router.post(
    "/{episode_id}/confidence-quiz", response_model=QuizDetail, status_code=status.HTTP_201_CREATED
)
def confidence_quiz(
    episode_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    embedder: Annotated[Embedder, Depends(get_embedder)],
    llm: Annotated[GroqService, Depends(get_groq_service)],
) -> QuizDetail:
    """A short beginner quiz on the topic. Answers go to /quizzes/{id}/attempts like any quiz."""
    return light_mode_service.start_confidence_quiz(db, embedder, llm, user.id, episode_id)
