"""Executes an evaluation run: retrieval only (no LLM), scored with app.evaluation.metrics."""

import logging
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.evaluation.metrics import (
    bootstrap_ci,
    build_abstention_matrix,
    hit_at_k,
    mean,
    ndcg_at_k,
    percentile,
    precision_at_k,
    reciprocal_rank,
)
from app.evaluation.service import RunConfig
from app.models.document import STATUS_READY, Document, DocumentChunk
from app.models.evaluation import (
    RUN_COMPLETED,
    RUN_FAILED,
    RUN_RUNNING,
    EvalItem,
    EvalResult,
    EvalRun,
)
from app.services.embedding_service import Embedder
from app.services.retrieval_service import RetrievedChunk, retrieve

logger = logging.getLogger("app.evaluation")

KS = (1, 3, 5, 10)
PASS_AT_K = 5
GOLD_NOT_FOUND = "Gold passage not found in your library"
ITEM_FAILED = "Retrieval failed for this item"
RUN_FAILED_MESSAGE = "The evaluation could not be completed"


@dataclass
class ItemOutcome:
    answerable: bool
    answered: bool | None = None
    passed: bool | None = None
    rels: list[bool] | None = None
    n_relevant: int = 0
    first_relevant_rank: int | None = None
    retrieved: list[dict[str, Any]] | None = None
    latency_ms: float | None = None
    error: str | None = None


def _gold_chunk_count(db: Session, user_id: uuid.UUID, title: str, page: int) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(DocumentChunk)
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(
                Document.user_id == user_id,
                DocumentChunk.user_id == user_id,
                Document.status == STATUS_READY,
                Document.title == title,
                DocumentChunk.page_number == page,
            )
        )
        or 0
    )


def _is_gold(chunk: RetrievedChunk, item: EvalItem) -> bool:
    return chunk.document_title == item.gold_document_title and chunk.page_number == item.gold_page


def _evaluate_item(
    db: Session, embedder: Embedder, user_id: uuid.UUID, item: EvalItem, config: RunConfig
) -> ItemOutcome:
    n_relevant = 0
    if item.answerable:
        assert item.gold_document_title is not None and item.gold_page is not None
        n_relevant = _gold_chunk_count(db, user_id, item.gold_document_title, item.gold_page)
        if n_relevant == 0:
            return ItemOutcome(answerable=True, error=GOLD_NOT_FOUND)

    started = time.perf_counter()
    # No similarity cut-off here: the full ranked list is scored, and the gate is applied below.
    ranked = retrieve(
        db,
        embedder,
        user_id,
        item.question,
        top_k=config.depth,
        min_similarity=-1.0,
        mode=config.retrieval_mode,
    )
    latency_ms = (time.perf_counter() - started) * 1000

    answered = bool(ranked) and max(c.similarity for c in ranked) >= config.min_similarity
    rels = [item.answerable and _is_gold(c, item) for c in ranked]
    first_rank = next((rank for rank, relevant in enumerate(rels, start=1) if relevant), None)
    passed = (answered and hit_at_k(rels, PASS_AT_K) == 1.0) if item.answerable else not answered
    return ItemOutcome(
        answerable=item.answerable,
        answered=answered,
        passed=passed,
        rels=rels,
        n_relevant=n_relevant,
        first_relevant_rank=first_rank,
        latency_ms=latency_ms,
        retrieved=[
            {
                "rank": rank,
                "chunk_id": str(chunk.chunk_id),
                "document_title": chunk.document_title,
                "page_number": chunk.page_number,
                "similarity": round(chunk.similarity, 4),
                "relevant": relevant,
            }
            for rank, (chunk, relevant) in enumerate(zip(ranked, rels, strict=True), start=1)
        ],
    )


def _round(value: float) -> float:
    return round(value, 4)


def compute_metrics(outcomes: list[ItemOutcome]) -> dict[str, Any]:
    """Aggregate per-item outcomes. Items that errored are excluded from every ratio."""
    scored = [o for o in outcomes if o.error is None]
    ranked = [o for o in scored if o.answerable and o.rels is not None]
    hits_at_5 = [hit_at_k(o.rels or [], 5) for o in ranked]
    reciprocal_ranks = [reciprocal_rank(o.rels or []) for o in ranked]
    matrix = build_abstention_matrix([(o.answerable, bool(o.answered)) for o in scored])
    latencies = [o.latency_ms for o in scored if o.latency_ms is not None]

    def per_k(fn) -> dict[str, float]:  # type: ignore[no-untyped-def]
        return {str(k): _round(mean([fn(o, k) for o in ranked])) for k in KS}

    return {
        "n_answerable": len(ranked),
        "n_unanswerable": sum(1 for o in scored if not o.answerable),
        "n_errors": len(outcomes) - len(scored),
        "hit_rate": per_k(lambda o, k: hit_at_k(o.rels or [], k)),
        "precision": per_k(lambda o, k: precision_at_k(o.rels or [], k)),
        "ndcg": per_k(lambda o, k: ndcg_at_k(o.rels or [], k, o.n_relevant)),
        "mrr": _round(mean(reciprocal_ranks)),
        "ci": {
            "hit_rate@5": [_round(v) for v in bootstrap_ci(hits_at_5)],
            "mrr": [_round(v) for v in bootstrap_ci(reciprocal_ranks)],
        },
        "abstention": {
            "tp": matrix.tp,
            "fn": matrix.fn,
            "fp": matrix.fp,
            "tn": matrix.tn,
            "precision": _round(matrix.precision),
            "recall": _round(matrix.recall),
            "f1": _round(matrix.f1),
            "accuracy": _round(matrix.accuracy),
        },
        "pass_rate": _round(mean([1.0 if o.passed else 0.0 for o in scored])),
        "latency_ms": {
            "p50": _round(percentile(latencies, 50)),
            "p95": _round(percentile(latencies, 95)),
        },
    }


def _fail_run(db: Session, run_id: uuid.UUID) -> None:
    db.rollback()
    run = db.get(EvalRun, run_id)
    if run is None:
        return
    run.status = RUN_FAILED
    run.error_message = RUN_FAILED_MESSAGE
    run.finished_at = datetime.now(UTC)
    db.commit()


def execute_run(db: Session, embedder: Embedder, run_id: uuid.UUID) -> None:
    """Run every item of the dataset for the run's owner and store results and metrics."""
    run = db.get(EvalRun, run_id)
    if run is None:
        logger.warning("Evaluation run %s no longer exists", run_id)
        return
    run.status = RUN_RUNNING
    run.started_at = datetime.now(UTC)
    db.commit()

    try:
        config = RunConfig.model_validate(run.config)
        outcomes: list[ItemOutcome] = []
        for item in list(run.dataset.items):
            try:
                outcome = _evaluate_item(db, embedder, run.user_id, item, config)
            except Exception:  # one bad item must not stop the run; it is recorded and logged
                logger.exception("Evaluation item %s failed", item.id)
                db.rollback()
                outcome = ItemOutcome(answerable=item.answerable, error=ITEM_FAILED)
            outcomes.append(outcome)
            db.add(
                EvalResult(
                    run_id=run.id,
                    item_id=item.id,
                    answered=outcome.answered,
                    passed=outcome.passed,
                    first_relevant_rank=outcome.first_relevant_rank,
                    retrieved=outcome.retrieved or [],
                    latency_ms=outcome.latency_ms,
                    error=outcome.error,
                )
            )
            run.items_done += 1
            db.commit()

        run.metrics = compute_metrics(outcomes)
        run.status = RUN_COMPLETED
        run.finished_at = datetime.now(UTC)
        db.commit()
    except Exception:
        logger.exception("Evaluation run %s failed", run_id)
        _fail_run(db, run_id)
