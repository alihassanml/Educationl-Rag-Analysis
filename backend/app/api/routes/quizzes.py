import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import CurrentUser, DbSession
from app.core.errors import AppError
from app.schemas.quizzes import (
    AttemptRequest,
    AttemptResult,
    GenerateQuizRequest,
    QuizDetail,
    QuizList,
)
from app.services import quiz_notes_service, quiz_service
from app.services.embedding_service import Embedder, get_embedder
from app.services.groq_service import GroqService, get_groq_service

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


@router.post("/generate", response_model=QuizDetail, status_code=status.HTTP_201_CREATED)
def generate(
    body: GenerateQuizRequest,
    user: CurrentUser,
    db: DbSession,
    embedder: Annotated[Embedder, Depends(get_embedder)],
    llm: Annotated[GroqService, Depends(get_groq_service)],
) -> QuizDetail:
    return quiz_service.generate_quiz(db, embedder, llm, user.id, body)


@router.get("", response_model=QuizList)
def list_quizzes(
    user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> QuizList:
    items, total = quiz_service.list_quizzes(db, user.id, limit, offset)
    return QuizList(items=items, total=total)


@router.get("/{quiz_id}", response_model=QuizDetail)
def get_quiz(quiz_id: uuid.UUID, user: CurrentUser, db: DbSession) -> QuizDetail:
    return quiz_service.get_quiz_detail(db, user.id, quiz_id)


@router.post(
    "/{quiz_id}/attempts", response_model=AttemptResult, status_code=status.HTTP_201_CREATED
)
def submit_attempt(
    quiz_id: uuid.UUID, body: AttemptRequest, user: CurrentUser, db: DbSession
) -> AttemptResult:
    answers = {a.question_id: a.selected_index for a in body.answers}
    if len(answers) != len(body.answers):
        raise AppError(422, "invalid_answers", "Each question can only be answered once")
    return quiz_service.submit_attempt(db, user.id, quiz_id, answers)


@router.get("/{quiz_id}/attempt", response_model=AttemptResult)
def get_attempt(quiz_id: uuid.UUID, user: CurrentUser, db: DbSession) -> AttemptResult:
    return quiz_service.get_attempt_result(db, user.id, quiz_id)


@router.get("/{quiz_id}/notes.pdf")
def download_notes(quiz_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    """Study notes PDF. Needs a submitted attempt, so answers are never shown early."""
    result = quiz_service.get_attempt_result(db, user.id, quiz_id)
    filename = quiz_notes_service.notes_filename(result.quiz_title)
    return Response(
        content=quiz_notes_service.build_notes_pdf(result),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
