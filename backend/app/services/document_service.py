import logging
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, NotFoundError
from app.models.document import (
    KIND_LECTURE,
    KIND_NOTES,
    KIND_PAST_PAPER,
    STATUS_FAILED,
    STATUS_PROCESSING,
    STATUS_READY,
    Document,
    DocumentChunk,
)
from app.services import (
    chunking_service,
    file_store,
    pdf_service,
    source_service,
    topic_service,
    youtube_service,
)
from app.services.access_service import readable_documents
from app.services.embedding_service import Embedder
from app.services.groq_service import GroqService
from app.workers.queue import get_job_queue

logger = logging.getLogger("app.documents")

SOURCE_TEXT_MIME = "text/plain"
SOURCE_WEBSITE_MIME = "text/html"
SOURCE_YOUTUBE_MIME = "video/youtube"
_PDF_MAGIC = b"%PDF-"
_READ_BLOCK = 1024 * 1024
_NO_TEXT_MESSAGE = (
    "No readable text was found. The PDF may be scanned images; upload a text-based PDF instead."
)


@dataclass(frozen=True)
class DocumentMeta:
    """How the student labelled a document when adding it."""

    kind: str = KIND_NOTES
    exam_year: int | None = None
    exam_session: str | None = None

    def apply(self, document: Document) -> None:
        document.kind = self.kind
        is_paper = self.kind == KIND_PAST_PAPER
        document.exam_year = self.exam_year if is_paper else None
        document.exam_session = (self.exam_session or None) if is_paper else None


def _storage_dir(user_id: uuid.UUID) -> Path:
    return get_settings().upload_dir / str(user_id)


def _safe_title(filename: str, title: str | None) -> str:
    chosen = (title or "").strip() or Path(filename).stem.strip() or "Untitled"
    return chosen[:255]


def validate_and_store(
    user_id: uuid.UUID, filename: str, content_type: str, stream
) -> tuple[Path, int, str | None]:  # type: ignore[no-untyped-def]
    """Check extension, size and PDF signature, then save (encrypted) under a server-chosen name.
    Returns the path, the size and the id of the key used (None when encryption is off). Nothing
    is written until the whole file has passed the checks, so a rejected upload leaves no file."""
    settings = get_settings()
    if not filename.lower().endswith(".pdf"):
        raise AppError(400, "invalid_file_type", "Only PDF files are supported")
    if content_type not in ("application/pdf", "application/x-pdf", "application/octet-stream"):
        raise AppError(400, "invalid_file_type", "Only PDF files are supported")

    limit = settings.max_upload_mb * 1024 * 1024
    data = bytearray()
    while block := stream.read(_READ_BLOCK):
        if not data and not block.startswith(_PDF_MAGIC):
            raise AppError(400, "invalid_file_type", "The file is not a valid PDF")
        data += block
        if len(data) > limit:
            raise AppError(
                413, "file_too_large", f"Files must be {settings.max_upload_mb} MB or smaller"
            )
    if not data:
        raise AppError(400, "empty_file", "The file is empty")
    path = _new_path(user_id, "pdf")
    return path, len(data), file_store.save_encrypted(path, bytes(data))


def _new_path(user_id: uuid.UUID, extension: str) -> Path:
    return _storage_dir(user_id) / f"{uuid.uuid4().hex}.{extension}"


def _read(document: Document) -> bytes:
    return file_store.read_decrypted(Path(document.storage_path), document.encryption_key_id)


def _read_text(document: Document) -> str:
    return _read(document).decode("utf-8")


def create_and_process(
    db: Session,
    embedder: Embedder,
    user_id: uuid.UUID,
    *,
    filename: str,
    title: str | None,
    path: Path,
    size: int,
    key_id: str | None = None,
    llm: GroqService | None = None,
    meta: DocumentMeta | None = None,
) -> Document:
    document = Document(
        user_id=user_id,
        title=_safe_title(filename, title),
        original_filename=Path(filename).name[:255],
        storage_path=str(path),
        encryption_key_id=key_id,
        mime_type="application/pdf",
        file_size=size,
        status=STATUS_PROCESSING,
    )
    (meta or DocumentMeta()).apply(document)
    db.add(document)
    db.commit()
    dispatch(db, embedder, document, llm)
    return document


def create_from_text(
    db: Session,
    embedder: Embedder,
    user_id: uuid.UUID,
    *,
    title: str,
    text: str,
    source_url: str | None = None,
    llm: GroqService | None = None,
    meta: DocumentMeta | None = None,
) -> Document:
    """Index pasted text or the text of a web page. The text is kept as a .txt file so the
    document is stored and deleted exactly like an uploaded PDF."""
    text = text.strip()
    if len(text) < source_service.MIN_TEXT_CHARS:
        raise AppError(
            400, "text_too_short", "Add a little more text so there is something to study"
        )
    if len(text) > source_service.MAX_TEXT_CHARS:
        raise AppError(
            413,
            "text_too_long",
            f"Text must be {source_service.MAX_TEXT_CHARS:,} characters or fewer",
        )
    path = _new_path(user_id, "txt")
    data = text.encode("utf-8")
    key_id = file_store.save_encrypted(path, data)

    label = _safe_title(source_url or "", title)
    document = Document(
        user_id=user_id,
        title=label,
        original_filename=(source_url or f"{label}.txt")[:255],
        storage_path=str(path),
        encryption_key_id=key_id,
        mime_type=SOURCE_WEBSITE_MIME if source_url else SOURCE_TEXT_MIME,
        file_size=len(data),
        status=STATUS_PROCESSING,
    )
    (meta or DocumentMeta()).apply(document)
    db.add(document)
    db.commit()
    dispatch(db, embedder, document, llm)
    return document


def create_from_website(
    db: Session,
    embedder: Embedder,
    user_id: uuid.UUID,
    *,
    url: str,
    title: str | None,
    llm: GroqService | None = None,
    meta: DocumentMeta | None = None,
) -> Document:
    """Add a web address: a page is read as text, a link to a PDF is downloaded as a PDF."""
    fetched = source_service.fetch(url)
    if fetched.kind == "pdf":
        path = _new_path(user_id, "pdf")
        key_id = file_store.save_encrypted(path, fetched.body)
        return create_and_process(
            db,
            embedder,
            user_id,
            filename=source_service.filename_from_url(url),
            title=title,
            path=path,
            size=len(fetched.body),
            key_id=key_id,
            llm=llm,
            meta=meta,
        )
    page_title, text = source_service.extract_text(fetched)
    chosen = (title or "").strip() or page_title or source_service.title_from_url(url)
    return create_from_text(db, embedder, user_id, title=chosen, text=text, source_url=url, llm=llm)


def create_from_youtube(
    db: Session,
    embedder: Embedder,
    user_id: uuid.UUID,
    *,
    url: str,
    title: str | None,
    llm: GroqService | None = None,
    meta: DocumentMeta | None = None,
) -> Document:
    """Add a YouTube lecture from its captions. The transcript is kept as a .txt file (one caption
    per line with its second), so the document is stored, re-indexed and deleted like any other."""
    video_id = youtube_service.parse_video_id(url)
    if video_id is None:
        raise AppError(
            422,
            "invalid_youtube_url",
            "Enter a YouTube link such as youtube.com/watch?v=..., youtu.be/... or "
            "youtube.com/shorts/...",
        )
    snippets = youtube_service.fetch_transcript(video_id)
    text = youtube_service.to_stored(snippets)
    spoken = " ".join(s.text for s in snippets)
    if len(spoken) < source_service.MIN_TEXT_CHARS:
        raise AppError(422, "no_transcript", youtube_service.NO_TRANSCRIPT_MESSAGE)
    if len(text) > source_service.MAX_TEXT_CHARS * 2:
        raise AppError(413, "text_too_long", "This video's transcript is too long to add")

    path = _new_path(user_id, "txt")
    data = text.encode("utf-8")
    key_id = file_store.save_encrypted(path, data)
    chosen = (title or "").strip() or youtube_service.video_title(video_id)
    label = _safe_title(f"YouTube lecture {video_id}", chosen)
    link = youtube_service.canonical_url(video_id)
    document = Document(
        user_id=user_id,
        title=label,
        original_filename=link,
        storage_path=str(path),
        encryption_key_id=key_id,
        mime_type=SOURCE_YOUTUBE_MIME,
        source_url=link,
        file_size=len(data),
        status=STATUS_PROCESSING,
    )
    (meta or DocumentMeta(kind=KIND_LECTURE)).apply(document)
    db.add(document)
    db.commit()
    dispatch(db, embedder, document, llm)
    return document


def dispatch(
    db: Session, embedder: Embedder, document: Document, llm: GroqService | None = None
) -> None:
    """Index a document that was just saved as "processing": right now when
    PROCESS_DOCUMENTS_INLINE is on (tests, small setups), otherwise by the ARQ worker, so a large
    PDF never holds a web request open. If the queue cannot be reached the document and its file
    are removed again and the student is asked to retry, so nothing is left "processing"."""
    if get_settings().process_documents_inline:
        process_stored(db, embedder, document, llm)
        return
    try:
        get_job_queue().enqueue("process_document_job", str(document.id))
    except AppError:
        path = Path(document.storage_path)
        db.delete(document)
        db.commit()
        file_store.delete(path)
        raise


def load_pages(document: Document) -> list[pdf_service.PageText]:
    """The text of a stored document, page by page (a text source is one block)."""
    if document.mime_type == SOURCE_YOUTUBE_MIME:
        return youtube_service.windows(youtube_service.from_stored(_read_text(document)))
    if document.mime_type in (SOURCE_TEXT_MIME, SOURCE_WEBSITE_MIME):
        return [pdf_service.PageText(page_number=None, text=_read_text(document))]
    return pdf_service.extract_pages(_read(document))


def process_stored(
    db: Session, embedder: Embedder, document: Document, llm: GroqService | None = None
) -> None:
    """Index a document from its stored file. What the file holds depends on where it came from: a
    PDF is read page by page, text and web pages are one block, a YouTube transcript is cut into
    timed passages. This is what the worker runs, and what re-indexing runs too."""
    no_text = "Not enough readable text was found to index."
    try:
        data = _read(document)
        if document.mime_type == SOURCE_YOUTUBE_MIME:
            snippets = youtube_service.from_stored(data.decode("utf-8"))
            pages = youtube_service.windows(snippets)
        elif document.mime_type in (SOURCE_TEXT_MIME, SOURCE_WEBSITE_MIME):
            pages = [pdf_service.PageText(page_number=None, text=data.decode("utf-8"))]
        else:
            _process(db, embedder, document, data, llm=llm)
            return
    except (OSError, file_store.FileStoreError, UnicodeDecodeError):
        _fail(db, document, "The stored file could not be read. Please add the material again.")
        return
    _process(db, embedder, document, data, pages=pages, no_text_message=no_text, llm=llm)


def reindex(
    db: Session, embedder: Embedder, document: Document, llm: GroqService | None = None
) -> None:
    """Rebuild a document's passages from its stored file, after a change to how text is read or
    chunked. Saved chats keep their citation snapshots (title, page, snippet)."""
    db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
    document.status = STATUS_PROCESSING
    db.commit()
    process_stored(db, embedder, document, llm)


def _fail(db: Session, document: Document, message: str) -> None:
    db.rollback()
    document.status = STATUS_FAILED
    document.error_message = message
    db.commit()


def _process(
    db: Session,
    embedder: Embedder,
    document: Document,
    data: bytes,
    *,
    pages: list[pdf_service.PageText] | None = None,
    no_text_message: str = _NO_TEXT_MESSAGE,
    llm: GroqService | None = None,
) -> None:
    """Index a document. PDFs are read from `data` (the decrypted file, in memory); other sources
    pass their text as `pages`."""
    settings = get_settings()
    try:
        outline: list[pdf_service.OutlineEntry] = []
        if pages is None:
            pages = pdf_service.extract_pages(data)
            document.page_count = len(pages)
            outline = pdf_service.extract_outline(data)
        chunks = chunking_service.chunk_pages(
            pages, settings.chunk_size_words, settings.chunk_overlap_words, outline
        )
        if not chunks:
            _fail(db, document, no_text_message)
            return
        vectors = embedder.embed_documents([c.content for c in chunks])
        db.add_all(
            DocumentChunk(
                document_id=document.id,
                user_id=document.user_id,
                chunk_index=chunk.chunk_index,
                content=chunk.content,
                page_number=chunk.page_number,
                section_title=chunk.section_title,
                start_seconds=chunk.start_seconds,
                embedding=vector,
            )
            for chunk, vector in zip(chunks, vectors, strict=True)
        )
        document.status = STATUS_READY
        document.error_message = None
        db.commit()
        topic_service.extract_safely(db, llm, document)
    except pdf_service.PdfError as exc:
        _fail(db, document, str(exc))
    except Exception:
        # Boundary of the processing job: record a safe failure instead of leaving it "processing".
        logger.exception("Indexing failed for document %s", document.id)
        _fail(db, document, "Processing failed. Please try uploading the file again.")


def list_documents(
    db: Session, user_id: uuid.UUID, limit: int, offset: int, kind: str | None = None
) -> tuple[list[Document], int]:
    query = select(Document).where(Document.user_id == user_id)
    if kind:
        query = query.where(Document.kind == kind)
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


def get_readable_document(db: Session, user_id: uuid.UUID, document_id: uuid.UUID) -> Document:
    """A document the user owns or that a teacher shared with one of their classes (read-only)."""
    document = db.scalar(
        select(Document).where(Document.id == document_id, readable_documents(user_id))
    )
    if document is None:
        raise NotFoundError("Document")
    return document


def delete_document(db: Session, user_id: uuid.UUID, document_id: uuid.UUID) -> None:
    document = get_owned_document(db, user_id, document_id)
    path = Path(document.storage_path)
    db.delete(document)  # chunks, vectors and topic links go with it (ON DELETE CASCADE)
    db.flush()
    topic_service.prune_unused_topics(db, user_id)  # a topic stays while progress or a quiz uses it
    db.commit()
    file_store.delete(path)


def update_document(
    db: Session,
    user_id: uuid.UUID,
    document_id: uuid.UUID,
    changes: dict[str, object],
) -> Document:
    """Rename a document or change its kind. Exam year and session belong to past papers only, so
    they are cleared when the kind is anything else."""
    document = get_owned_document(db, user_id, document_id)
    if "title" in changes and changes["title"]:
        document.title = str(changes["title"]).strip()[:255]
    if "kind" in changes and changes["kind"]:
        document.kind = str(changes["kind"])
    if "exam_year" in changes:
        document.exam_year = changes["exam_year"]  # type: ignore[assignment]
    if "exam_session" in changes:
        document.exam_session = (
            (str(changes["exam_session"]).strip() or None) if changes["exam_session"] else None
        )
    if document.kind != KIND_PAST_PAPER:
        document.exam_year = None
        document.exam_session = None
    db.commit()
    return document
