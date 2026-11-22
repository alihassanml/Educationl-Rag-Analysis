import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class ClassCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)

    @field_validator("name")
    @classmethod
    def tidy(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Class name must be at least 2 characters")
        return value


class JoinClass(BaseModel):
    join_code: str = Field(min_length=8, max_length=8)

    @field_validator("join_code")
    @classmethod
    def upper(cls, value: str) -> str:
        return value.strip().upper()


class ShareDocument(BaseModel):
    document_id: uuid.UUID


class ClassSummary(BaseModel):
    id: uuid.UUID
    name: str
    teacher_name: str
    member_count: int
    document_count: int
    created_at: datetime
    # Only the teacher who owns the class sees the code
    join_code: str | None = None


class SharedDocument(BaseModel):
    id: uuid.UUID
    title: str
    kind: str
    status: str
    page_count: int | None
    shared_at: datetime


class MemberOut(BaseModel):
    student_id: uuid.UUID
    display_name: str
    joined_at: datetime


class ClassDetail(ClassSummary):
    documents: list[SharedDocument]
    # Teachers get the member list; a student only gets the count, never who else is in the class
    members: list[MemberOut] = Field(default_factory=list)
