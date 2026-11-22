import re
from dataclasses import dataclass

from app.services.pdf_service import PageText

_MIN_WORDS = 5


@dataclass(frozen=True)
class TextChunk:
    chunk_index: int
    page_number: int | None
    content: str


def chunk_pages(pages: list[PageText], size_words: int, overlap_words: int) -> list[TextChunk]:
    """Split each page into overlapping word windows. A chunk never crosses a page boundary,
    so every citation points at exactly one page."""
    if overlap_words >= size_words:
        raise ValueError("overlap must be smaller than chunk size")
    step = size_words - overlap_words
    chunks: list[TextChunk] = []
    for page in pages:
        words = re.sub(r"[ \t]+", " ", page.text).split()
        if len(words) < _MIN_WORDS:
            continue
        for start in range(0, len(words), step):
            window = words[start : start + size_words]
            if len(window) < _MIN_WORDS or (start > 0 and len(window) <= overlap_words):
                break
            chunks.append(TextChunk(len(chunks), page.page_number, " ".join(window)))
            if start + size_words >= len(words):
                break
    return chunks
