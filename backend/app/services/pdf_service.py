from dataclasses import dataclass
from pathlib import Path

import pymupdf


class PdfError(Exception):
    """The file could not be read as a PDF."""


@dataclass(frozen=True)
class PageText:
    page_number: int | None  # 1-based; None for sources that have no pages
    text: str


def extract_pages(path: Path) -> list[PageText]:
    """Extract text page by page. Pages without text are kept with empty text."""
    try:
        with pymupdf.open(path) as pdf:
            if pdf.needs_pass:
                raise PdfError("The PDF is password protected")
            return [
                PageText(page_number=index + 1, text=page.get_text("text").strip())
                for index, page in enumerate(pdf)
            ]
    except (pymupdf.FileDataError, pymupdf.EmptyFileError, RuntimeError) as exc:
        raise PdfError("The file is not a readable PDF") from exc
