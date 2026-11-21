import json
import uuid
from collections.abc import AsyncIterator, Iterator
from typing import Annotated

import anyio
from fastapi import APIRouter, Depends, Query, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from fastapi.sse import format_sse_event

from app.api.deps import CurrentUser, DbSession
from app.schemas.chat import MessageCreate, ThreadCreate, ThreadDetail, ThreadOut, ThreadRename
from app.schemas.tutor import AskRequest, AskResponse
from app.services import chat_service, chat_stream_service, rag_service
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


@router.get("/threads", response_model=list[ThreadOut])
def list_threads(
    user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[ThreadOut]:
    return [
        ThreadOut.model_validate(t) for t in chat_service.list_threads(db, user.id, limit, offset)
    ]


@router.post("/threads", response_model=ThreadOut, status_code=status.HTTP_201_CREATED)
def create_thread(user: CurrentUser, db: DbSession, body: ThreadCreate | None = None) -> ThreadOut:
    thread = chat_service.create_thread(db, user.id, body.title if body else None)
    return ThreadOut.model_validate(thread)


@router.get("/threads/{thread_id}", response_model=ThreadDetail)
def get_thread(thread_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ThreadDetail:
    return chat_service.thread_detail(db, user.id, thread_id)


@router.patch("/threads/{thread_id}", response_model=ThreadOut)
def rename_thread(
    thread_id: uuid.UUID, body: ThreadRename, user: CurrentUser, db: DbSession
) -> ThreadOut:
    return ThreadOut.model_validate(chat_service.rename_thread(db, user.id, thread_id, body.title))


@router.delete("/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_thread(thread_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    chat_service.delete_thread(db, user.id, thread_id)


_END = object()


async def sse_stream(events: Iterator[chat_stream_service.StreamEvent]) -> AsyncIterator[bytes]:
    """Turn the service's events into server-sent events. The blocking generator runs in a worker
    thread. If the client goes away this generator is closed, and closing the inner one lets it
    save the partial answer and stop reading from the model."""
    try:
        while True:
            item = await run_in_threadpool(next, events, _END)
            if item is _END:
                break
            name, data = item  # type: ignore[misc]
            yield format_sse_event(data_str=json.dumps(data), event=name)
    finally:
        with anyio.CancelScope(shield=True):
            await run_in_threadpool(events.close)  # type: ignore[attr-defined]


@router.post("/threads/{thread_id}/messages")
def send_message(
    thread_id: uuid.UUID,
    body: MessageCreate,
    user: CurrentUser,
    db: DbSession,
    embedder: Annotated[Embedder, Depends(get_embedder)],
    llm: Annotated[GroqService, Depends(get_groq_service)],
) -> StreamingResponse:
    prepared = chat_stream_service.prepare_message(
        db, user.id, thread_id, body.question, body.document_ids
    )
    return StreamingResponse(
        sse_stream(chat_stream_service.run_stream(db, embedder, llm, prepared)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
