import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.quizzes import Recommendation


class Rules(BaseModel):
    min_attempts: int
    needs_revision_below_percent: int
    doing_well_from_percent: int


class TopicProgressOut(BaseModel):
    topic_id: uuid.UUID
    topic_name: str
    questions_attempted: int
    correct_answers: int
    accuracy_percent: int | None
    status: str
    recommendation: Recommendation
    last_practiced_at: datetime


class TopicProgressList(BaseModel):
    items: list[TopicProgressOut]
    rules: Rules


class ActivityItem(BaseModel):
    quiz_id: uuid.UUID
    quiz_title: str
    topic: str | None
    score: int
    total_questions: int
    percent: int
    completed_at: datetime


class LatestDocument(BaseModel):
    id: uuid.UUID
    title: str


class ProgressSummary(BaseModel):
    documents_total: int
    documents_ready: int
    quizzes_completed: int
    average_score_percent: int | None
    topics_needing_revision: int
    needs_revision: list[TopicProgressOut]
    next_step: TopicProgressOut | None
    recent_activity: list[ActivityItem]
    score_history: list[ActivityItem]
    latest_document: LatestDocument | None
