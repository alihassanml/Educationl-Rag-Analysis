import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import pymupdf

# A line that starts with this marker is a heading. Chunking keeps each heading with the text under
# it, so a passage still says what it is about after it is cut out of the document.
HEADING_MARK = "# "

# A heading is set noticeably larger than the body text, and is short
_HEADING_MIN_EXTRA_PT = 1.0
_HEADING_MAX_CHARS = 120
# A heading takes at most a few lines; a longer run of large text is a paragraph
_HEADING_MAX_LINES = 3
_HEADING_MAX_WORDS = 20
# A line printed on at least this share of pages (and on 3 or more) is a running header or footer
_REPEATED_SHARE = 0.5
# Share of the page height at the top and at the bottom where running headers and footers sit
_MARGIN_SHARE = 0.08
# Fewer drawings than this on a page means there is no ruled table to look for
_TABLE_MIN_DRAWINGS = 6


class PdfError(Exception):
    """The file could not be read as a PDF."""


@dataclass(frozen=True)
class PageText:
    page_number: int | None  # 1-based; None for sources that have no pages
    text: str
    start_seconds: int | None = None  # a lecture passage: where it starts in the video


@dataclass(frozen=True)
class OutlineEntry:
    """One line of the PDF's own table of contents (bookmarks)."""

    level: int  # 1 = top level (a chapter)
    title: str
    page: int  # 1-based


@dataclass(frozen=True)
class _Line:
    text: str
    size: float
    margin: bool = False  # in the top or bottom band of the page, where headers and footers sit


def _clean(text: str) -> str:
    return " ".join(text.split())


@dataclass(frozen=True)
class _Table:
    """The last table of a page, kept so a table that runs on to the next page keeps its header."""

    header: list[str]
    columns: int
    ends_low: bool  # the table reaches the bottom quarter of its page


def _cells(page: pymupdf.Page, table) -> list[list[str]]:  # type: ignore[no-untyped-def]
    rows = [
        [_clean(page.get_text("text", clip=cell)) if cell else "" for cell in row.cells]
        for row in table.rows
    ]
    return [row for row in rows if any(row)]


def _table_lines(header: list[str], body: list[list[str]]) -> list[_Line]:
    """A table as one line per row, each value named by its column ("Plan: Essential; Credit: $10").
    Read cell by cell, a table otherwise comes out as one word per line with no link between a
    value and its column, so a question like "what does the Essential plan include" finds nothing.
    """
    lines = [
        "; ".join(
            f"{name}: {value}" if name else value
            for name, value in zip(header, row, strict=False)
            if value
        )
        for row in body
    ]
    return [_Line(line, 0.0) for line in lines if line]


def _inside(bbox: tuple[float, ...], area: pymupdf.Rect) -> bool:
    x0, y0, x1, y1 = bbox
    return area.contains(pymupdf.Point((x0 + x1) / 2, (y0 + y1) / 2))


def _in_margin(page: pymupdf.Page, bbox: tuple[float, ...]) -> bool:
    band = page.rect.height * _MARGIN_SHARE
    return bbox[3] <= page.rect.y0 + band or bbox[1] >= page.rect.y1 - band


def _find_tables(page: pymupdf.Page):  # type: ignore[no-untyped-def]
    try:
        # Tables are found from their ruling lines. A page with only a few drawings (underlines, a
        # rule under the header) has no table, and skipping the search keeps text PDFs fast to index
        if len(page.get_drawings()) >= _TABLE_MIN_DRAWINGS:
            return [t for t in page.find_tables().tables if t.row_count >= 2]
    except Exception:  # table detection is a bonus; plain text still works without it
        pass
    return []


def _page_lines(page: pymupdf.Page, carried: _Table | None) -> tuple[list[_Line], _Table | None]:
    """The page's lines in reading order, with each table as named rows where it sits.
    `carried` is the previous page's last table: a table at the top of this page with the same
    columns is its continuation, and has no header row of its own."""
    tables = sorted(_find_tables(page), key=lambda t: t.bbox[1])
    areas = [pymupdf.Rect(t.bbox) for t in tables]
    rendered: list[list[_Line]] = []
    last: _Table | None = None
    for i, table in enumerate(tables):
        rows = _cells(page, table)
        columns = max((len(r) for r in rows), default=0)
        continues = (
            i == 0
            and carried is not None
            and carried.ends_low
            and carried.columns == columns
            and areas[0].y0 <= page.rect.y0 + page.rect.height * 0.25
            and rows[:1] != [carried.header]
        )
        if continues and carried is not None:
            header, body = carried.header, rows
        elif len(rows) >= 2:
            header, body = rows[0], rows[1:]
        else:
            header, body = [], rows
        rendered.append(_table_lines(header, body))
        last = _Table(header, columns, areas[i].y1 >= page.rect.y1 - page.rect.height * 0.25)

    placed = [False] * len(tables)
    lines: list[_Line] = []
    for block in page.get_text("dict")["blocks"]:
        if any(_inside(block["bbox"], area) for area in areas):
            continue
        # Each table goes where it sits on the page: before the first text below it. Text in the
        # margins (a page number printed first) does not count, or the table would jump to the top.
        if not _in_margin(page, block["bbox"]):
            for i in range(len(tables)):
                if not placed[i] and block["bbox"][1] >= areas[i].y1 - 1:
                    lines.extend(rendered[i])
                    placed[i] = True
        for line in block.get("lines", []):
            spans = [s for s in line["spans"] if s["text"].strip()]
            text = _clean("".join(s["text"] for s in spans))
            if text and not any(_inside(line["bbox"], area) for area in areas):
                margin = _in_margin(page, line["bbox"])
                lines.append(_Line(text, max(s["size"] for s in spans), margin))
    for i in range(len(tables)):
        if not placed[i]:
            lines.extend(rendered[i])
    # A page without tables ends any table from before it
    return lines, last


def _shape(text: str) -> str:
    """A line with its numbers blanked, so "Page 3 of 38" and "Page 4 of 38" count as the same."""
    return re.sub(r"\d+", "#", text.lower())


def _running_lines(pages: list[list[_Line]]) -> set[str]:
    """Lines in the top or bottom margin that repeat on most pages. Only the margins count, so a
    sentence that happens to repeat in the body (a slide title, a definition) is kept."""
    if len(pages) < 3:
        return set()
    seen = Counter(
        shape for lines in pages for shape in {_shape(line.text) for line in lines if line.margin}
    )
    needed = max(3, int(len(pages) * _REPEATED_SHARE))
    return {shape for shape, count in seen.items() if count >= needed}


def _body_size(pages: list[list[_Line]]) -> float:
    sizes: Counter[float] = Counter()
    for lines in pages:
        for line in lines:
            sizes[round(line.size, 1)] += len(line.text)
    return sizes.most_common(1)[0][0] if sizes else 0.0


def _open(source: Path | bytes) -> pymupdf.Document:
    """A PDF from a path, or from bytes already in memory (a decrypted upload)."""
    if isinstance(source, bytes):
        return pymupdf.open(stream=source, filetype="pdf")
    return pymupdf.open(source)


def extract_pages(path: Path | bytes) -> list[PageText]:
    """Extract text page by page. Pages without text are kept with empty text.

    Running headers and footers (the same line on most pages, such as the document title or
    "Page 3 of 38") are dropped: they say nothing about the page, yet they make every page look
    like a match for a question that names the document. Headings, told apart by font size, are
    marked with HEADING_MARK so chunks keep the title of their section."""
    try:
        with _open(path) as pdf:
            if pdf.needs_pass:
                raise PdfError("The PDF is password protected")
            pages: list[list[_Line]] = []
            carried: _Table | None = None
            for page in pdf:
                lines, carried = _page_lines(page, carried)
                pages.append(lines)
    except (pymupdf.FileDataError, pymupdf.EmptyFileError, RuntimeError) as exc:
        raise PdfError("The file is not a readable PDF") from exc

    running = _running_lines(pages)
    body = _body_size(pages)
    result: list[PageText] = []
    for index, lines in enumerate(pages):
        kept = [line for line in lines if not (line.margin and _shape(line.text) in running)]
        flags = _heading_flags(kept, body)
        text = "\n".join(
            f"{HEADING_MARK}{line.text}" if flag else line.text
            for line, flag in zip(kept, flags, strict=True)
        )
        result.append(PageText(page_number=index + 1, text=text.strip()))
    return result


def _heading_flags(lines: list[_Line], body: float) -> list[bool]:
    """Which lines are headings: set larger than the body text and short. A run of larger lines
    longer than a heading would be (a highlighted paragraph, a pull quote) stays body text."""
    flags = [
        bool(body)
        and line.size >= body + _HEADING_MIN_EXTRA_PT
        and len(line.text) <= _HEADING_MAX_CHARS
        for line in lines
    ]
    start = 0
    while start < len(flags):
        if not flags[start]:
            start += 1
            continue
        end = start
        while end < len(flags) and flags[end]:
            end += 1
        run = lines[start:end]
        words = sum(len(r.text.split()) for r in run)
        if len(run) > _HEADING_MAX_LINES or words > _HEADING_MAX_WORDS:
            flags[start:end] = [False] * (end - start)
        start = end
    return flags


def extract_outline(path: Path | bytes) -> list[OutlineEntry]:
    """The PDF's table of contents, in order. Empty when the file has none or it cannot be read;
    a missing outline is normal, so this never raises."""
    try:
        with _open(path) as pdf:
            if pdf.needs_pass:
                return []
            entries = []
            for level, title, page in pdf.get_toc(simple=True):
                title = _clean(str(title))[:255]
                if title and page >= 1 and level >= 1:
                    entries.append(OutlineEntry(level, title, int(page)))
            return entries
    except Exception:
        return []
