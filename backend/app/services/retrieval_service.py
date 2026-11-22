import re
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import Select, Text, cast, func, select, tuple_
from sqlalchemy.dialects.postgresql import TSQUERY
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import NotFoundError
from app.models.document import STATUS_READY, Document, DocumentChunk
from app.services.embedding_service import Embedder

RRF_K = 60
HYBRID_CANDIDATES = 40  # per ranking (guide section 7, step 3)


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_title: str
    page_number: int | None
    content: str
    similarity: float
    rrf_score: float | None = None  # only set by hybrid retrieval


@dataclass(frozen=True)
class _Candidate:
    chunk: DocumentChunk
    title: str
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


def reciprocal_rank_fusion(
    rankings: Sequence[Sequence[uuid.UUID]], k: int = RRF_K
) -> list[tuple[uuid.UUID, float]]:
    """Fuse ranked id lists: score(d) = sum over lists of 1 / (k + rank), ranks starting at 1.
    Ties keep the order in which an id was first seen."""
    scores: dict[uuid.UUID, float] = {}
    for ranking in rankings:
        for rank, item in enumerate(ranking, start=1):
            scores[item] = scores.get(item, 0.0) + 1.0 / (k + rank)
    first_seen = {item: position for position, item in enumerate(scores)}
    return sorted(scores.items(), key=lambda pair: (-pair[1], first_seen[pair[0]]))


def _scoped(
    stmt: Select,
    user_id: uuid.UUID,
    document_ids: list[uuid.UUID] | None,  # type: ignore[type-arg]
) -> Select:  # type: ignore[type-arg]
    """Restrict to the user's own chunks of ready documents, and the selected documents."""
    stmt = stmt.join(Document, Document.id == DocumentChunk.document_id).where(
        DocumentChunk.user_id == user_id,
        Document.user_id == user_id,
        Document.status == STATUS_READY,
    )
    if document_ids:
        stmt = stmt.where(DocumentChunk.document_id.in_(document_ids))
    return stmt


def _dense_candidates(
    db: Session,
    query_vector: list[float],
    user_id: uuid.UUID,
    document_ids: list[uuid.UUID] | None,
    limit: int,
) -> list[_Candidate]:
    distance = DocumentChunk.embedding.cosine_distance(query_vector)
    stmt = _scoped(
        select(DocumentChunk, Document.title, distance.label("distance")), user_id, document_ids
    )
    rows = db.execute(stmt.order_by(distance).limit(limit))
    return [_Candidate(chunk, title, 1.0 - float(dist)) for chunk, title, dist in rows]


def _fulltext_candidates(
    db: Session,
    query: str,
    query_vector: list[float],
    user_id: uuid.UUID,
    document_ids: list[uuid.UUID] | None,
    limit: int,
) -> list[_Candidate]:
    """Chunks sharing at least one (stemmed) word with the query, best match first.

    plainto_tsquery safely parses any user text; its terms are joined with AND, which would miss
    most natural-language questions, so they are switched to OR before matching. Each row also
    carries its cosine similarity so the same relevance gate can be applied to it.
    """
    tsquery = cast(
        func.replace(cast(func.plainto_tsquery("english", query), Text), "&", "|"), TSQUERY
    )
    distance = DocumentChunk.embedding.cosine_distance(query_vector)
    stmt = _scoped(
        select(DocumentChunk, Document.title, distance.label("distance")), user_id, document_ids
    )
    rows = db.execute(
        stmt.where(DocumentChunk.tsv.op("@@")(tsquery))
        .order_by(func.ts_rank_cd(DocumentChunk.tsv, tsquery).desc(), DocumentChunk.id)
        .limit(limit)
    )
    return [_Candidate(chunk, title, 1.0 - float(dist)) for chunk, title, dist in rows]


def _fuse(dense: list[_Candidate], fulltext: list[_Candidate]) -> list[tuple[_Candidate, float]]:
    by_id = {c.chunk.id: c for c in [*dense, *fulltext]}
    fused = reciprocal_rank_fusion([[c.chunk.id for c in dense], [c.chunk.id for c in fulltext]])
    return [(by_id[chunk_id], score) for chunk_id, score in fused]


def retrieve(
    db: Session,
    embedder: Embedder,
    user_id: uuid.UUID,
    query: str,
    document_ids: list[uuid.UUID] | None = None,
    top_k: int | None = None,
    min_similarity: float | None = None,
    mode: Literal["dense", "hybrid"] | None = None,
) -> list[RetrievedChunk]:
    """Most relevant chunks for the query, restricted to this user's ready documents.

    "dense" ranks by vector similarity. "hybrid" fuses the vector ranking with a full-text
    ranking (reciprocal rank fusion). In both modes a chunk must reach the similarity threshold,
    so hybrid can reorder and add keyword matches but never lowers the abstention bar.
    """
    settings = get_settings()
    top_k = top_k or settings.retrieval_top_k
    threshold = settings.retrieval_min_similarity if min_similarity is None else min_similarity
    mode = mode or settings.retrieval_mode
    if document_ids:
        check_document_scope(db, user_id, document_ids)

    query_vector = embedder.embed_query(query)
    if mode == "hybrid":
        dense = _dense_candidates(db, query_vector, user_id, document_ids, HYBRID_CANDIDATES)
        fulltext = _fulltext_candidates(
            db, query, query_vector, user_id, document_ids, HYBRID_CANDIDATES
        )
        ordered = _fuse(dense, fulltext)
    else:
        dense = _dense_candidates(db, query_vector, user_id, document_ids, top_k * 3)
        ordered = [(candidate, None) for candidate in dense]  # type: ignore[misc]

    selected: list[RetrievedChunk] = []
    kept_texts: list[str] = []
    for candidate, rrf_score in ordered:
        if candidate.similarity < threshold:
            continue
        if _is_near_duplicate(
            candidate.chunk.content, kept_texts, settings.retrieval_duplicate_overlap
        ):
            continue
        kept_texts.append(candidate.chunk.content)
        selected.append(
            RetrievedChunk(
                chunk_id=candidate.chunk.id,
                document_id=candidate.chunk.document_id,
                document_title=candidate.title,
                page_number=candidate.chunk.page_number,
                content=candidate.chunk.content,
                similarity=candidate.similarity,
                rrf_score=rrf_score,
            )
        )
        if len(selected) == top_k:
            break
    return selected


def _spread(count: int, picks: int) -> list[int]:
    """`picks` indexes spread evenly over `count` chunks, to cover the whole document."""
    picks = min(picks, count)
    return sorted({int((i + 0.5) * count / picks) for i in range(picks)})


def document_titles(
    db: Session, user_id: uuid.UUID, document_ids: list[uuid.UUID] | None = None
) -> list[tuple[uuid.UUID, str]]:
    """(id, title) of the user's ready documents, newest first, optionally a selection."""
    stmt = select(Document.id, Document.title).where(
        Document.user_id == user_id, Document.status == STATUS_READY
    )
    if document_ids:
        stmt = stmt.where(Document.id.in_(document_ids))
    return [(row[0], row[1]) for row in db.execute(stmt.order_by(Document.created_at.desc()))]


def retrieve_coverage(
    db: Session,
    user_id: uuid.UUID,
    document_ids: list[uuid.UUID] | None = None,
    limit: int | None = None,
) -> list[RetrievedChunk]:
    """A sample of passages from across the material, with no similarity bar.

    For requests with no specific subject ("quiz me on everything"). The sample is shared out
    between the documents and spread over each one, so every part of the material can be used.
    """
    limit = limit or get_settings().retrieval_coverage_chunks
    if document_ids:
        check_document_scope(db, user_id, document_ids)
    counts = db.execute(
        _scoped(
            select(Document.id, Document.title, func.count(DocumentChunk.id)), user_id, document_ids
        )
        .group_by(Document.id, Document.title, Document.created_at)
        .order_by(Document.created_at.desc())
        .limit(limit)
    ).all()
    if not counts:
        return []

    quota, extra = divmod(limit, len(counts))
    wanted: dict[uuid.UUID, list[int]] = {}
    for position, (document_id, _title, total) in enumerate(counts):
        wanted[document_id] = _spread(total, quota + (1 if position < extra else 0))
    titles = {document_id: title for document_id, title, _ in counts}

    rows = db.execute(
        select(DocumentChunk)
        .where(
            DocumentChunk.user_id == user_id,
            tuple_(DocumentChunk.document_id, DocumentChunk.chunk_index).in_(
                [
                    (document_id, index)
                    for document_id, indexes in wanted.items()
                    for index in indexes
                ]
            ),
        )
        .order_by(DocumentChunk.document_id, DocumentChunk.chunk_index)
    ).scalars()
    return [
        RetrievedChunk(
            chunk_id=chunk.id,
            document_id=chunk.document_id,
            document_title=titles[chunk.document_id],
            page_number=chunk.page_number,
            content=chunk.content,
            similarity=0.0,  # chosen for coverage, not matched to a query
        )
        for chunk in rows
    ]
