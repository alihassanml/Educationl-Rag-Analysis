import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ThreadCreate(BaseModel):
    title: str | None = Field(default=None, max_length=120)


class ThreadRename(BaseModel):
    title: str = Field(max_length=120)

    @field_validator("title")
    @classmethod
    def not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Title cannot be empty")
        return value


class ThreadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime


class CitationOut(BaseModel):
    marker: int
    chunk_id: uuid.UUID | None
    document_id: uuid.UUID | None
    document_title: str
    page_number: int | None
    section_title: str | None = None
    start_seconds: int | None = None
    source_url: str | None = None
    snippet: str
    source_deleted: bool


class MessageOut(BaseModel):
    id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    standalone_query: str | None
    rewrite_used: bool
    abstained: bool
    simplified: bool = False
    status: Literal["complete", "stopped", "failed"]
    created_at: datetime
    citations: list[CitationOut]
    feedback: Literal["up", "down"] | None = None


class ThreadDetail(ThreadOut):
    messages: list[MessageOut]


ChatMode = Literal["ask", "quiz", "summary", "simple"]


class MessageCreate(BaseModel):
    question: str = Field(min_length=2, max_length=1000)
    document_ids: list[uuid.UUID] | None = Field(default=None, max_length=50)
    # How the answer is written. The student's own words are saved as typed; the mode only
    # changes the instruction the answer call receives.
    mode: ChatMode = "ask"


class FeedbackIn(BaseModel):
    rating: Literal["up", "down"]
    reason: Literal["wrong", "missing_source", "unclear"] | None = None

    @model_validator(mode="after")
    def reason_only_with_thumbs_down(self) -> "FeedbackIn":
        if self.reason is not None and self.rating != "down":
            raise ValueError("A reason can only be given with a thumbs down")
        return self


class FeedbackOut(BaseModel):
    message_id: uuid.UUID
    rating: Literal["up", "down"]
    reason: str | None


class FeedbackItem(FeedbackOut):
    """One row of the admin "Live feedback" list. It carries no student identity."""

    question: str
    answer: str
    abstained: bool
    created_at: datetime
