from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, DbSession
from app.schemas.tutor import AskRequest, AskResponse
from app.services import rag_service
from app.services.embedding_service import Embedder, get_embedder
from app.services.groq_service import GroqService, get_groq_service

router = APIRouter(prefix="/tutor", tags=["tutor"])


@router.post("/ask", response_model=AskResponse)
def ask(
    body: AskRequest,
    user: CurrentUser,
    db: DbSession,
    embedder: Annotated[Embedder, Depends(get_embedder)],
    llm: Annotated[GroqService, Depends(get_groq_service)],
) -> AskResponse:
    return rag_service.ask(db, embedder, llm, user.id, body.question, body.document_ids)
