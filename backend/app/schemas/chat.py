import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    snippet: str
    source_deleted: bool


class MessageOut(BaseModel):
    id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    standalone_query: str | None
    rewrite_used: bool
    abstained: bool
    status: Literal["complete", "stopped", "failed"]
    created_at: datetime
    citations: list[CitationOut]
    feedback: Literal["up", "down"] | None = None


class ThreadDetail(ThreadOut):
    messages: list[MessageOut]
