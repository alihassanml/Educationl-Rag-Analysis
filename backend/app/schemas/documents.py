import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field


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
    mime_type: str = Field(exclude=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def source_type(self) -> str:
        """pdf, website or text, taken from how the document was stored."""
        return {"text/html": "website", "text/plain": "text"}.get(self.mime_type, "pdf")


class TextDocumentIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    text: str = Field(min_length=1, max_length=250_000)


class WebsiteDocumentIn(BaseModel):
    url: str = Field(min_length=4, max_length=2048)
    title: str | None = Field(default=None, max_length=255)


class DocumentList(BaseModel):
    items: list[DocumentOut]
    total: int
