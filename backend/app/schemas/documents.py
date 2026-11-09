import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    original_filename: str
    file_size: int
    status: str
    error_message: str | None
    page_count: int | None
    created_at: datetime


class DocumentList(BaseModel):
    items: list[DocumentOut]
    total: int
