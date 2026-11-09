import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Difficulty = Literal["beginner", "intermediate", "advanced"]


class GenerateQuizRequest(BaseModel):
    topic: str | None = Field(default=None, max_length=120)
    document_ids: list[uuid.UUID] | None = Field(default=None, max_length=50)
    difficulty: Difficulty = "beginner"
    num_questions: int = Field(default=5, ge=3, le=10)

    @field_validator("topic")
    @classmethod
    def blank_topic_is_none(cls, value: str | None) -> str | None:
        value = (value or "").strip()
        return value or None


class QuestionPublic(BaseModel):
    id: uuid.UUID
    position: int
    question_text: str
    options: list[str]


class AttemptSummary(BaseModel):
    score: int
    total_questions: int
    completed_at: datetime


class QuizSummary(BaseModel):
    id: uuid.UUID
    title: str
    topic: str | None
    difficulty: str
    question_count: int
    source_documents: list[str]
    created_at: datetime
    attempt: AttemptSummary | None


class QuizList(BaseModel):
    items: list[QuizSummary]
    total: int


class QuizDetail(QuizSummary):
    questions: list[QuestionPublic]


class AnswerIn(BaseModel):
    question_id: uuid.UUID
    selected_index: int = Field(ge=0, le=9)


class AttemptRequest(BaseModel):
    answers: list[AnswerIn] = Field(min_length=1, max_length=50)


class SourceRef(BaseModel):
    document_title: str
    page_number: int | None


class QuestionResult(BaseModel):
    question_id: uuid.UUID
    question_text: str
    options: list[str]
    selected_index: int
    correct_index: int
    is_correct: bool
    explanation: str
    sources: list[SourceRef]


class Recommendation(BaseModel):
    action: str
    message: str


class AttemptResult(BaseModel):
    attempt_id: uuid.UUID
    quiz_id: uuid.UUID
    quiz_title: str
    topic: str | None
    score: int
    total_questions: int
    percent: int
    completed_at: datetime
    results: list[QuestionResult]
    topic_status: str | None
    recommendation: Recommendation | None
