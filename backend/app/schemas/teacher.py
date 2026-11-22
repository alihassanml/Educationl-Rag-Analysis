import uuid

from pydantic import BaseModel


class ClassTopic(BaseModel):
    topic: str
    students: int  # how many students have practised it
    accuracy: int  # percent correct across all of them
    status: str  # the same rule as a student's own topics
    weak: bool


class StudentTopic(BaseModel):
    topic: str
    status: str
    level: str
    accuracy: int | None
    attempted: int


class StudentRow(BaseModel):
    student_id: uuid.UUID
    display_name: str
    topics: list[StudentTopic]


class ClassInsights(BaseModel):
    class_id: uuid.UUID
    class_name: str
    student_count: int
    min_students: int
    # A topic is listed once enough students have practised it; `topics_hidden` counts the rest
    topics: list[ClassTopic]
    topics_hidden: int
    students: list[StudentRow]
