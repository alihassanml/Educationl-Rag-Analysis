import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class NotificationOut(BaseModel):
    id: uuid.UUID
    type: str
    title: str
    body: str
    link: str | None = None
    read_at: datetime | None = None
    created_at: datetime


class NotificationListOut(BaseModel):
    notifications: list[NotificationOut]
    unread_count: int


class DueTopicOut(BaseModel):
    topic_id: uuid.UUID
    topic_name: str
    status: str
    current_difficulty: str
    interval_days: int
    last_practiced_at: datetime
    next_due_at: datetime
    is_due: bool
    days_overdue: int


class StartSlipTestRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=120)
