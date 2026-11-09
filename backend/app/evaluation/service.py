import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import NotFoundError
from app.models.evaluation import RUN_QUEUED, EvalDataset, EvalRun

RANKING_DEPTH = 10


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
