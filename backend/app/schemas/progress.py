import uuid
from datetime import date, datetime

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


# --- Study insights: what the student has done with their material, from chat and library data ---


class DayActivity(BaseModel):
    date: date
    questions: int
    quizzes: int


class DocumentUsage(BaseModel):
    id: uuid.UUID
    title: str
    source_type: str
    page_count: int | None
    chunk_count: int
    times_cited: int
    pages_cited: int
    last_cited_at: datetime | None


class HotPage(BaseModel):
    document_id: uuid.UUID
    document_title: str
    page_number: int
    times_cited: int


class StudyInsights(BaseModel):
    questions_asked: int
    answers_with_sources: int
    answers_not_found: int
    citations_total: int
    pages_indexed: int
    chunks_indexed: int
    helpful_votes: int
    unhelpful_votes: int
    active_days: int
    current_streak: int
    longest_streak: int
    today: date
    activity: list[DayActivity]
    documents: list[DocumentUsage]
    hot_pages: list[HotPage]
