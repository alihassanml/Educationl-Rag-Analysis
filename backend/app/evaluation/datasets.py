"""Labelled question sets for the Evaluation Lab, stored as JSONL and imported per user."""

import json
import uuid
from pathlib import Path
from typing import Literal, Self

from pydantic import BaseModel, Field, ValidationError, model_validator
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.evaluation import EvalDataset, EvalItem


class EvalItemIn(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    answerable: bool
    gold_document_title: str | None = Field(default=None, max_length=255)
    gold_page: int | None = Field(default=None, ge=1)
    question_type: Literal["factual", "conceptual", "multi_hop", "numeric"] = "factual"
    concept: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def gold_passage_matches_answerability(self) -> Self:
        has_gold = self.gold_document_title is not None and self.gold_page is not None
        partial = (self.gold_document_title is None) != (self.gold_page is None)
        if partial:
            raise ValueError("gold_document_title and gold_page must be given together")
        if self.answerable and not has_gold:
            raise ValueError("an answerable question needs gold_document_title and gold_page")
        if not self.answerable and has_gold:
            raise ValueError("an unanswerable question must not have a gold passage")
        return self


def load_jsonl(path: Path) -> list[EvalItemIn]:
    items: list[EvalItemIn] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            items.append(EvalItemIn.model_validate(json.loads(line)))
        except (json.JSONDecodeError, ValidationError) as exc:
            raise ValueError(f"{path.name}, line {line_number}: {exc}") from exc
    return items


def import_dataset(
    db: Session, user_id: uuid.UUID, name: str, items: list[EvalItemIn]
) -> EvalDataset:
    """Create the dataset for this user, replacing any existing dataset with the same name."""
    db.execute(delete(EvalDataset).where(EvalDataset.user_id == user_id, EvalDataset.name == name))
    dataset = EvalDataset(
        user_id=user_id,
        name=name,
        items=[
            EvalItem(position=position, **item.model_dump()) for position, item in enumerate(items)
        ],
    )
    db.add(dataset)
    db.commit()
    return dataset


def _as_items(dataset: EvalDataset) -> list[EvalItemIn]:
    return [
        EvalItemIn(
            question=i.question,
            answerable=i.answerable,
            gold_document_title=i.gold_document_title,
            gold_page=i.gold_page,
            question_type=i.question_type,  # type: ignore[arg-type]
            concept=i.concept,
        )
        for i in dataset.items
    ]


def ensure_dataset(
    db: Session, user_id: uuid.UUID, name: str, items: list[EvalItemIn]
) -> EvalDataset:
    """Like import_dataset, but keeps the existing dataset, and with it every run made on it,
    when its questions are identical. Replacing a dataset deletes its run history."""
    existing = db.scalar(
        select(EvalDataset).where(EvalDataset.user_id == user_id, EvalDataset.name == name)
    )
    if existing is not None and _as_items(existing) == items:
        return existing
    return import_dataset(db, user_id, name, items)
