from datetime import datetime

from pydantic import BaseModel


class StyleSource(BaseModel):
    document_title: str
    page_number: int | None


class GlossaryItem(BaseModel):
    term: str
    definition: str
    source: StyleSource


class PhraseItem(BaseModel):
    text: str
    source: StyleSource


class StructureItem(BaseModel):
    pattern: str
    source: StyleSource


class TeacherStyle(BaseModel):
    glossary: list[GlossaryItem]
    phrases: list[PhraseItem]
    structure: list[StructureItem]
    built_at: datetime


class TeacherStyleStatus(BaseModel):
    # At least one ready document marked as Teacher material
    available: bool
    teacher_documents: list[str]
    # A profile exists and was built from the current teacher material
    ready: bool
    style: TeacherStyle | None
