import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status

from app.api.deps import CurrentUser, DbSession
from app.models.document import Document
from app.schemas.documents import (
    DocumentKind,
    DocumentList,
    DocumentOut,
    DocumentUpdate,
    TextDocumentIn,
    WebsiteDocumentIn,
    YouTubeDocumentIn,
)
from app.services import document_service
from app.services.document_service import DocumentMeta
from app.services.embedding_service import Embedder, get_embedder
from app.services.groq_service import GroqService, get_groq_service

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("", response_model=DocumentList)
def list_documents(
    user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    kind: DocumentKind | None = None,
) -> DocumentList:
    items, total = document_service.list_documents(db, user.id, limit, offset, kind)
    return DocumentList(items=[DocumentOut.model_validate(d) for d in items], total=total)


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def upload_document(
    user: CurrentUser,
    db: DbSession,
    embedder: Annotated[Embedder, Depends(get_embedder)],
    llm: Annotated[GroqService, Depends(get_groq_service)],
    file: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form(max_length=255)] = None,
    kind: Annotated[DocumentKind, Form()] = "notes",
    exam_year: Annotated[int | None, Form(ge=1900, le=2100)] = None,
    exam_session: Annotated[str | None, Form(max_length=50)] = None,
) -> Document:
    path, size, key_id = document_service.validate_and_store(
        user.id, file.filename or "", file.content_type or "", file.file
    )
    return document_service.create_and_process(
        db,
        embedder,
        user.id,
        filename=file.filename or "",
        title=title,
        path=path,
        size=size,
        key_id=key_id,
        llm=llm,
        meta=DocumentMeta(kind, exam_year, exam_session),
    )


@router.post("/text", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def add_text_document(
    body: TextDocumentIn,
    user: CurrentUser,
    db: DbSession,
    embedder: Annotated[Embedder, Depends(get_embedder)],
    llm: Annotated[GroqService, Depends(get_groq_service)],
) -> Document:
    return document_service.create_from_text(
        db,
        embedder,
        user.id,
        title=body.title,
        text=body.text,
        llm=llm,
        meta=DocumentMeta(body.kind, body.exam_year, body.exam_session),
    )


@router.post("/website", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def add_website_document(
    body: WebsiteDocumentIn,
    user: CurrentUser,
    db: DbSession,
    embedder: Annotated[Embedder, Depends(get_embedder)],
    llm: Annotated[GroqService, Depends(get_groq_service)],
) -> Document:
    return document_service.create_from_website(
        db,
        embedder,
        user.id,
        url=body.url.strip(),
        title=body.title,
        llm=llm,
        meta=DocumentMeta(body.kind, body.exam_year, body.exam_session),
    )


@router.post("/youtube", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def add_youtube_document(
    body: YouTubeDocumentIn,
    user: CurrentUser,
    db: DbSession,
    embedder: Annotated[Embedder, Depends(get_embedder)],
    llm: Annotated[GroqService, Depends(get_groq_service)],
) -> Document:
    return document_service.create_from_youtube(
        db,
        embedder,
        user.id,
        url=body.url.strip(),
        title=body.title,
        llm=llm,
        meta=DocumentMeta(body.kind, body.exam_year, body.exam_session),
    )


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Document:
    return document_service.get_readable_document(db, user.id, document_id)


@router.patch("/{document_id}", response_model=DocumentOut)
def update_document(
    document_id: uuid.UUID, body: DocumentUpdate, user: CurrentUser, db: DbSession
) -> Document:
    return document_service.update_document(
        db, user.id, document_id, body.model_dump(exclude_unset=True)
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    document_service.delete_document(db, user.id, document_id)
