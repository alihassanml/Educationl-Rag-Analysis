import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.quizzes import Difficulty


class PathSource(BaseModel):
    document_id: uuid.UUID
    document_title: str
    first_page: int | None
    last_page: int | None


class NextAction(BaseModel):
    # start: no answers yet | practice: more answers needed or in between | revise: below the
    # revision threshold | review_later: doing well
    kind: Literal["start", "practice", "revise", "review_later", "light"]
    message: str


class PathStep(BaseModel):
    topic_id: uuid.UUID
    name: str
    position: int  # 1-based place on the path
    status: str
    level: Difficulty | None  # None until the topic has a diagnostic or a quiz result
    accuracy_percent: int | None
    questions_attempted: int
    sources: list[PathSource]
    next_action: NextAction
    is_current: bool
    # A running lighter step on this topic (a recap and a confidence quiz), if there is one
    light_episode_id: uuid.UUID | None = None
    # Why the topic is first on the path when it was moved there for the exam
    priority_reason: str | None = None


class PathEventOut(BaseModel):
    id: uuid.UUID
    topic_id: uuid.UUID
    topic: str
    old_status: str
    new_status: str
    reason: str
    created_at: datetime


class LearningPath(BaseModel):
    steps: list[PathStep]
    current_topic_id: uuid.UUID | None
    latest_event: PathEventOut | None
    events: list[PathEventOut]
