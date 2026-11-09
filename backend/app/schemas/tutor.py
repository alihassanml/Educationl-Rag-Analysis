import uuid

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    document_ids: list[uuid.UUID] | None = Field(default=None, max_length=50)


class Citation(BaseModel):
    document_id: uuid.UUID
    document_title: str
    page_number: int | None
    chunk_id: uuid.UUID


class AskResponse(BaseModel):
    answer: str
    citations: list[Citation]
    insufficient_evidence: bool
