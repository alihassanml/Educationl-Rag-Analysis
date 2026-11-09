import re
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import NotFoundError
from app.models.document import STATUS_READY, Document, DocumentChunk
from app.services.embedding_service import Embedder


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_title: str
    page_number: int | None
    content: str
    similarity: float


def _word_set(text: str) -> set[str]:
    return set(re.findall(r"\w+", text.lower()))


def _is_near_duplicate(candidate: str, kept: list[str], threshold: float) -> bool:
    words = _word_set(candidate)
    for other in kept:
        other_words = _word_set(other)
        union = words | other_words
        if union and len(words & other_words) / len(union) >= threshold:
            return True
    return False


def check_document_scope(db: Session, user_id: uuid.UUID, document_ids: list[uuid.UUID]) -> None:
    """Every requested document must belong to the user, else act as if it does not exist."""
    owned = set(
        db.scalars(
            select(Document.id).where(Document.user_id == user_id, Document.id.in_(document_ids))
        )
    )
    if owned != set(document_ids):
        raise NotFoundError("Document")


def retrieve(
    db: Session,
    embedder: Embedder,
    user_id: uuid.UUID,
    query: str,
    document_ids: list[uuid.UUID] | None = None,
    top_k: int | None = None,
    min_similarity: float | None = None,
) -> list[RetrievedChunk]:
    """Nearest chunks to the query, restricted to this user's ready documents."""
    settings = get_settings()
    top_k = top_k or settings.retrieval_top_k
    threshold = settings.retrieval_min_similarity if min_similarity is None else min_similarity
    if document_ids:
        check_document_scope(db, user_id, document_ids)

    distance = DocumentChunk.embedding.cosine_distance(embedder.embed_query(query))
    stmt = (
        select(DocumentChunk, Document.title, distance.label("distance"))
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(
            DocumentChunk.user_id == user_id,
            Document.user_id == user_id,
            Document.status == STATUS_READY,
        )
        .order_by(distance)
        .limit(top_k * 3)
    )
    if document_ids:
        stmt = stmt.where(DocumentChunk.document_id.in_(document_ids))

    selected: list[RetrievedChunk] = []
    kept_texts: list[str] = []
    for chunk, title, dist in db.execute(stmt):
        similarity = 1.0 - float(dist)
        if similarity < threshold:
            break  # results are ordered, so everything after is weaker
        if _is_near_duplicate(chunk.content, kept_texts, settings.retrieval_duplicate_overlap):
            continue
        kept_texts.append(chunk.content)
        selected.append(
            RetrievedChunk(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                document_title=title,
                page_number=chunk.page_number,
                content=chunk.content,
                similarity=similarity,
            )
        )
        if len(selected) == top_k:
            break
    return selected
