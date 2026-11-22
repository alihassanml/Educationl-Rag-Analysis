import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class StartVivaRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=120)


class VivaCitation(BaseModel):
    document_title: str
    page_number: int | None = None
    section_title: str | None = None
    start_seconds: int | None = None
    source_url: str | None = None


class VivaTurnPublic(BaseModel):
    turn_index: int
    question_text: str
    follow_up_question: str | None = None
    student_answer: str | None = None
    follow_up_answer: str | None = None
    is_follow_up_pending: bool = False
    is_completed: bool = False


class VivaTurnReport(BaseModel):
    turn_index: int
    question_text: str
    follow_up_question: str | None = None
    student_answer: str | None = None
    follow_up_answer: str | None = None
    grade_accuracy: int
    grade_completeness: int
    grade_own_words: int
    grade_score: int
    grade_feedback: str
    ideal_answer: str
    sources: list[VivaCitation] = []


class VivaSessionDetail(BaseModel):
    id: uuid.UUID
    topic_name: str
    status: str
    tab_switch_count: int
    current_turn_index: int
    total_turns: int = 5
    # Seconds allowed per answer (config); the page counts down from it
    time_limit_seconds: int = 90
    current_turn: VivaTurnPublic | None = None
    total_score: int | None = None
    max_score: int | None = None
    overall_feedback: str | None = None
    completed_turns: list[VivaTurnReport] = []
    created_at: datetime
    completed_at: datetime | None = None


class SubmitVivaAnswerRequest(BaseModel):
    turn_index: int
    answer: str = Field(min_length=1, max_length=5000)
    is_follow_up: bool = False


class TranscribeResponse(BaseModel):
    transcript: str


class TabSwitchRequest(BaseModel):
    count: int = Field(default=1, ge=1, le=100)


class VivaSessionSummary(BaseModel):
    id: uuid.UUID
    topic_name: str
    status: str
    total_score: int
    max_score: int
    tab_switch_count: int
    created_at: datetime
    completed_at: datetime | None = None
