import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class LightEpisodeOut(BaseModel):
    id: uuid.UUID
    topic_id: uuid.UUID
    topic: str
    reason: str
    started_at: datetime
    ended_at: datetime | None
    has_recap: bool
    confidence_quiz_id: uuid.UUID | None


class RecapSource(BaseModel):
    document_title: str
    page_number: int | None
    section_title: str | None = None


class Recap(BaseModel):
    """A quick recap of a topic, written only from the student's own passages and cited."""

    episode_id: uuid.UUID
    topic: str
    sentences: list[str]
    example: str
    memory_tip: str
    sources: list[RecapSource]


class LightModeNotice(BaseModel):
    """Shown with a quiz result: a lighter step has started, or has just been completed."""

    episode_id: uuid.UUID
    topic_id: uuid.UUID
    topic: str
    state: Literal["active", "passed"]
    message: str
