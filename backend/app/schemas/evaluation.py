import uuid
from datetime import datetime
from typing import Any, Literal, Self

from pydantic import BaseModel, Field

from app.models.evaluation import EvalRun


class DatasetOut(BaseModel):
    id: uuid.UUID
    name: str
    item_count: int
    answerable_count: int
    created_at: datetime


class DatasetList(BaseModel):
    items: list[DatasetOut]
    total: int


class StartRunRequest(BaseModel):
    dataset_id: uuid.UUID
    retrieval_mode: Literal["dense", "hybrid"] | None = None
    min_similarity: float | None = Field(default=None, ge=-1.0, le=1.0)


class RunOut(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    dataset_name: str
    status: str
    config: dict[str, Any]
    metrics: dict[str, Any] | None
    error_message: str | None
    items_done: int
    items_total: int
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None

    @classmethod
    def from_run(cls, run: EvalRun) -> Self:
        return cls(
            id=run.id,
            dataset_id=run.dataset_id,
            dataset_name=run.dataset.name,
            status=run.status,
            config=run.config,
            metrics=run.metrics,
            error_message=run.error_message,
            items_done=run.items_done,
            items_total=run.items_total,
            created_at=run.created_at,
            started_at=run.started_at,
            finished_at=run.finished_at,
        )


class RunList(BaseModel):
    items: list[RunOut]
    total: int


class ResultOut(BaseModel):
    id: uuid.UUID
    question: str
    answerable: bool
    question_type: str
    concept: str | None
    gold_document_title: str | None
    gold_page: int | None
    answered: bool | None
    passed: bool | None
    first_relevant_rank: int | None
    retrieved: list[dict[str, Any]]
    latency_ms: float | None
    error: str | None


class ResultList(BaseModel):
    items: list[ResultOut]
    total: int


class CompareOut(BaseModel):
    runs: list[RunOut]
    config_diff: dict[str, list[Any]]
