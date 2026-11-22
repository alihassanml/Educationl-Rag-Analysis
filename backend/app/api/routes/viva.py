import uuid
from typing import Annotated

from fastapi import APIRouter, File, UploadFile

from app.api.deps import CurrentUser, DbSession, EmbedderDep, LLMDep
from app.core.errors import BadRequestError
from app.schemas.viva import (
    StartVivaRequest,
    SubmitVivaAnswerRequest,
    TabSwitchRequest,
    TranscribeResponse,
    VivaSessionDetail,
    VivaSessionSummary,
)
from app.services import viva_service

router = APIRouter(prefix="/viva", tags=["viva"])


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(
    llm: LLMDep,
    file: Annotated[UploadFile, File()],
) -> TranscribeResponse:
    content = await file.read()
    if not content:
        raise BadRequestError("Audio file is empty")
    text = llm.transcribe_audio(content, filename=file.filename or "audio.webm")
    return TranscribeResponse(transcript=text)


@router.post("/sessions", response_model=VivaSessionDetail)
def start_session(
    body: StartVivaRequest,
    user: CurrentUser,
    db: DbSession,
    embedder: EmbedderDep,
    llm: LLMDep,
) -> VivaSessionDetail:
    return viva_service.start_viva_session(
        db=db,
        embedder=embedder,
        llm=llm,
        user_id=user.id,
        topic_name=body.topic,
    )


@router.get("/sessions", response_model=list[VivaSessionSummary])
def list_sessions(
    user: CurrentUser,
    db: DbSession,
) -> list[VivaSessionSummary]:
    return viva_service.list_sessions(db=db, user_id=user.id)


@router.get("/sessions/{session_id}", response_model=VivaSessionDetail)
def get_session(
    session_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> VivaSessionDetail:
    return viva_service.get_session_detail(db=db, user_id=user.id, session_id=session_id)


@router.post("/sessions/{session_id}/answer", response_model=VivaSessionDetail)
def submit_answer(
    session_id: uuid.UUID,
    body: SubmitVivaAnswerRequest,
    user: CurrentUser,
    db: DbSession,
    llm: LLMDep,
) -> VivaSessionDetail:
    return viva_service.submit_answer(
        db=db,
        llm=llm,
        user_id=user.id,
        session_id=session_id,
        turn_index=body.turn_index,
        answer=body.answer,
        is_follow_up=body.is_follow_up,
    )


@router.post("/sessions/{session_id}/tab-switch")
def record_tab_switch(
    session_id: uuid.UUID,
    body: TabSwitchRequest,
    user: CurrentUser,
    db: DbSession,
) -> dict[str, int]:
    count = viva_service.record_tab_switch(
        db=db, user_id=user.id, session_id=session_id, count=body.count
    )
    return {"tab_switch_count": count}
