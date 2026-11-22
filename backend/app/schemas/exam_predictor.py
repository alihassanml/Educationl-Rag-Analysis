import uuid
from typing import Literal

from pydantic import BaseModel

from app.schemas.quizzes import Difficulty


class EvidenceQuestion(BaseModel):
    """A real question from one of the student's past papers, with where to find it."""

    question_id: uuid.UUID
    text: str
    marks: int | None
    page_number: int | None
    document_id: uuid.UUID
    paper_title: str
    paper_year: int | None
    paper_session: str | None
    similarity: float | None  # None for an unmatched question


class PredictedTopic(BaseModel):
    topic_id: uuid.UUID
    name: str
    score: int  # 0 to 100
    label: Literal["High", "Medium", "Low"]
    explanation: str  # the rule in plain words, for example "Appeared in 4 of 5 papers"
    papers_with_topic: int
    total_papers: int
    most_recent_year: int | None
    total_marks: int | None
    question_count: int
    evidence: list[EvidenceQuestion]
    # The student's own state on the topic, so the page can offer the right next step
    level: Difficulty | None
    status: str
    pinned: bool  # added to the Course Map priority by the student


class PaperOut(BaseModel):
    document_id: uuid.UUID
    title: str
    year: int | None
    session: str | None
    question_count: int
    processed: bool


class ExamPrediction(BaseModel):
    # ok | need_more_papers (fewer than the minimum) | no_papers | no_topics (nothing to map to)
    status: Literal["ok", "need_more_papers", "no_papers", "no_topics"]
    message: str | None
    min_papers: int
    papers: list[PaperOut]
    pending_papers: int  # past papers whose questions have not been read yet
    failed_papers: int  # papers the last attempt could not read
    topics: list[PredictedTopic]
    unmatched: list[EvidenceQuestion]
    rule: str
    disclaimer: str


class PriorityIn(BaseModel):
    pinned: bool


class PriorityOut(BaseModel):
    topic_id: uuid.UUID
    pinned: bool
