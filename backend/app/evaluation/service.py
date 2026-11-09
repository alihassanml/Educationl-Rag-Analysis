import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, NotFoundError
from app.models.evaluation import (
    RUN_COMPLETED,
    RUN_FAILED,
    RUN_QUEUED,
    EvalDataset,
    EvalItem,
    EvalResult,
    EvalRun,
)
from app.workers.queue import JobQueue

RANKING_DEPTH = 10
QUEUE_DOWN_MESSAGE = "The background service is not running"


class RunConfig(BaseModel):
    """Everything that can change a run's numbers. Stored with the run so runs stay comparable."""

    retrieval_mode: Literal["dense", "hybrid"] = "dense"
    min_similarity: float = Field(
        default_factory=lambda: get_settings().retrieval_min_similarity, ge=-1.0, le=1.0
    )
    depth: int = RANKING_DEPTH
    embedding_model: str = Field(default_factory=lambda: get_settings().embedding_model)


def create_run(
    db: Session, user_id: uuid.UUID, dataset_id: uuid.UUID, overrides: dict[str, Any]
) -> EvalRun:
    """Queue a run for a dataset the user owns. Execution happens in the worker."""
    dataset = db.scalar(
        select(EvalDataset).where(EvalDataset.id == dataset_id, EvalDataset.user_id == user_id)
    )
    if dataset is None:
        raise NotFoundError("Dataset")
    config = RunConfig(**{key: value for key, value in overrides.items() if value is not None})
    run = EvalRun(
        user_id=user_id,
        dataset_id=dataset.id,
        status=RUN_QUEUED,
        config=config.model_dump(),
        items_total=len(dataset.items),
        items_done=0,
    )
    db.add(run)
    db.commit()
    return run


@dataclass(frozen=True)
class DatasetSummary:
    dataset: EvalDataset
    item_count: int
    answerable_count: int


def list_datasets(db: Session, user_id: uuid.UUID) -> list[DatasetSummary]:
    rows = db.execute(
        select(
            EvalDataset,
            func.count(EvalItem.id),
            func.count(EvalItem.id).filter(EvalItem.answerable.is_(True)),
        )
        .outerjoin(EvalItem, EvalItem.dataset_id == EvalDataset.id)
        .where(EvalDataset.user_id == user_id)
        .group_by(EvalDataset.id)
        .order_by(EvalDataset.created_at.desc(), EvalDataset.name)
    )
    return [DatasetSummary(dataset, total, answerable) for dataset, total, answerable in rows]


def start_run(
    db: Session,
    queue: JobQueue,
    user_id: uuid.UUID,
    dataset_id: uuid.UUID,
    overrides: dict[str, Any],
) -> EvalRun:
    """Create a run and hand it to the worker. If the queue is down the run is marked failed
    instead of staying "queued" forever."""
    run = create_run(db, user_id, dataset_id, overrides)
    try:
        queue.enqueue("run_eval_job", str(run.id))
    except AppError:
        run.status = RUN_FAILED
        run.error_message = QUEUE_DOWN_MESSAGE
        run.finished_at = datetime.now(UTC)
        db.commit()
        raise
    return run


def list_runs(
    db: Session, user_id: uuid.UUID, limit: int, offset: int
) -> tuple[list[EvalRun], int]:
    query = select(EvalRun).where(EvalRun.user_id == user_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    runs = db.scalars(query.order_by(EvalRun.created_at.desc()).limit(limit).offset(offset))
    return list(runs), total


def get_run(db: Session, user_id: uuid.UUID, run_id: uuid.UUID) -> EvalRun:
    run = db.scalar(select(EvalRun).where(EvalRun.id == run_id, EvalRun.user_id == user_id))
    if run is None:
        raise NotFoundError("Evaluation run")
    return run


def list_results(
    db: Session,
    run: EvalRun,
    outcome: Literal["all", "failed", "passed"],
    limit: int,
    offset: int,
) -> tuple[list[EvalResult], int]:
    query = (
        select(EvalResult)
        .join(EvalItem, EvalItem.id == EvalResult.item_id)
        .where(EvalResult.run_id == run.id)
    )
    if outcome == "passed":
        query = query.where(EvalResult.passed.is_(True))
    elif outcome == "failed":
        query = query.where(or_(EvalResult.passed.is_(False), EvalResult.error.is_not(None)))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(EvalItem.position).limit(limit).offset(offset))
    return list(rows), total


def compare_runs(
    db: Session, user_id: uuid.UUID, run_ids: list[uuid.UUID]
) -> tuple[list[EvalRun], dict[str, list[Any]]]:
    """Runs in the requested order plus the config keys whose values differ between them."""
    runs = [get_run(db, user_id, run_id) for run_id in run_ids]
    if any(run.status != RUN_COMPLETED for run in runs):
        raise AppError(409, "run_not_finished", "Only completed runs can be compared")
    keys = sorted({key for run in runs for key in run.config})
    diff = {
        key: [run.config.get(key) for run in runs]
        for key in keys
        if len({repr(run.config.get(key)) for run in runs}) > 1
    }
    return runs, diff
