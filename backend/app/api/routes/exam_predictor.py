import uuid
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, DbSession
from app.schemas.exam_predictor import ExamPrediction, PriorityIn, PriorityOut
from app.services import exam_predictor_service
from app.services.embedding_service import Embedder, get_embedder
from app.services.groq_service import GroqService, get_groq_service

router = APIRouter(prefix="/exam-predictor", tags=["exam-predictor"])


@router.get("", response_model=ExamPrediction)
def prediction(
    user: CurrentUser, db: DbSession, embedder: Annotated[Embedder, Depends(get_embedder)]
) -> ExamPrediction:
    """Topics ranked by the student's past papers, from the questions already read. Papers not yet
    read are counted in `pending_papers`; POST /analyse reads them."""
    return exam_predictor_service.predict(db, embedder, user.id)


@router.post("/analyse", response_model=ExamPrediction)
def analyse(
    user: CurrentUser,
    db: DbSession,
    embedder: Annotated[Embedder, Depends(get_embedder)],
    llm: Annotated[GroqService, Depends(get_groq_service)],
) -> ExamPrediction:
    """Read every unread past paper into questions, then return the prediction."""
    return exam_predictor_service.analyse(db, embedder, llm, user.id)


@router.put("/topics/{topic_id}/priority", response_model=PriorityOut)
def set_priority(
    topic_id: uuid.UUID, body: PriorityIn, user: CurrentUser, db: DbSession
) -> PriorityOut:
    pinned = exam_predictor_service.set_pinned(db, user.id, topic_id, body.pinned)
    return PriorityOut(topic_id=topic_id, pinned=pinned)
