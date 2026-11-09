import logging
import uuid
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, NotFoundError
from app.models.document import (
    STATUS_FAILED,
    STATUS_PROCESSING,
    STATUS_READY,
    Document,
    DocumentChunk,
)
from app.services import chunking_service, pdf_service
from app.services.embedding_service import Embedder

logger = logging.getLogger("app.documents")

_PDF_MAGIC = b"%PDF-"
_READ_BLOCK = 1024 * 1024
_NO_TEXT_MESSAGE = (
    "No readable text was found. The PDF may be scanned images; upload a text-based PDF instead."
)


def _storage_dir(user_id: uuid.UUID) -> Path:
    return get_settings().upload_dir / str(user_id)


def _safe_title(filename: str, title: str | None) -> str:
    chosen = (title or "").strip() or Path(filename).stem.strip() or "Untitled"
    return chosen[:255]


def validate_and_store(
    user_id: uuid.UUID, filename: str, content_type: str, stream
) -> tuple[Path, int]:  # type: ignore[no-untyped-def]
    """Check extension, size, and PDF signature, then save under a server-chosen name."""
    settings = get_settings()
    if not filename.lower().endswith(".pdf"):
        raise AppError(400, "invalid_file_type", "Only PDF files are supported")
    if content_type not in ("application/pdf", "application/x-pdf", "application/octet-stream"):
        raise AppError(400, "invalid_file_type", "Only PDF files are supported")

    limit = settings.max_upload_mb * 1024 * 1024
    directory = _storage_dir(user_id)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{uuid.uuid4().hex}.pdf"

    size = 0
    try:
        with path.open("wb") as out:
            while block := stream.read(_READ_BLOCK):
                if size == 0 and not block.startswith(_PDF_MAGIC):
                    raise AppError(400, "invalid_file_type", "The file is not a valid PDF")
                size += len(block)
                if size > limit:
                    raise AppError(
                        413,
                        "file_too_large",
                        f"Files must be {settings.max_upload_mb} MB or smaller",
                    )
                out.write(block)
        if size == 0:
            raise AppError(400, "empty_file", "The file is empty")
    except AppError:
        path.unlink(missing_ok=True)
        raise
    return path, size


def create_and_process(
    db: Session,
    embedder: Embedder,
    user_id: uuid.UUID,
    *,
    filename: str,
    title: str | None,
    path: Path,
    size: int,
) -> Document:
    document = Document(
        user_id=user_id,
        title=_safe_title(filename, title),
        original_filename=Path(filename).name[:255],
        storage_path=str(path),
        mime_type="application/pdf",
        file_size=size,
        status=STATUS_PROCESSING,
    )
    db.add(document)
    db.commit()
    _process(db, embedder, document, path)
    return document


def _fail(db: Session, document: Document, message: str) -> None:
    db.rollback()
    document.status = STATUS_FAILED
    document.error_message = message
    db.commit()


def _process(db: Session, embedder: Embedder, document: Document, path: Path) -> None:
    settings = get_settings()
    try:
        pages = pdf_service.extract_pages(path)
        document.page_count = len(pages)
        chunks = chunking_service.chunk_pages(
            pages, settings.chunk_size_words, settings.chunk_overlap_words
        )
        if not chunks:
            _fail(db, document, _NO_TEXT_MESSAGE)
            return
        vectors = embedder.embed_documents([c.content for c in chunks])
        db.add_all(
            DocumentChunk(
                document_id=document.id,
                user_id=document.user_id,
                chunk_index=chunk.chunk_index,
                content=chunk.content,
                page_number=chunk.page_number,
                embedding=vector,
            )
            for chunk, vector in zip(chunks, vectors, strict=True)
        )
        document.status = STATUS_READY
        document.error_message = None
        db.commit()
    except pdf_service.PdfError as exc:
        _fail(db, document, str(exc))
    except Exception:
        # Boundary of the processing job: record a safe failure instead of leaving it "processing".
        logger.exception("Indexing failed for document %s", document.id)
        _fail(db, document, "Processing failed. Please try uploading the file again.")


def list_documents(
    db: Session, user_id: uuid.UUID, limit: int, offset: int
) -> tuple[list[Document], int]:
    query = select(Document).where(Document.user_id == user_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(query.order_by(Document.created_at.desc()).limit(limit).offset(offset)).all()
    return list(items), total


def get_owned_document(db: Session, user_id: uuid.UUID, document_id: uuid.UUID) -> Document:
    document = db.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == user_id)
    )
    if document is None:
        raise NotFoundError("Document")
    return document


def delete_document(db: Session, user_id: uuid.UUID, document_id: uuid.UUID) -> None:
    document = get_owned_document(db, user_id, document_id)
    path = Path(document.storage_path)
    db.delete(document)  # chunks and vectors go with it (ON DELETE CASCADE)
    db.commit()
    path.unlink(missing_ok=True)
