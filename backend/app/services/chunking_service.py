import re
from dataclasses import dataclass

from app.services.pdf_service import OutlineEntry, PageText

_MIN_WORDS = 5
# "# Title" (also "## Title" in pasted Markdown). "#include" or "#define" in pasted code is not one.
_HEADING = re.compile(r"^#{1,4}\s+\S")
# A section shorter than this is joined to the next one on the same page, so a heading with one
# line under it does not become a passage on its own
_MIN_SECTION_WORDS = 40


@dataclass(frozen=True)
class TextChunk:
    chunk_index: int
    page_number: int | None
    content: str
    section_title: str | None = None  # the chapter (PDF outline) or heading the passage sits under


@dataclass
class _Section:
    page_number: int | None
    heading: str  # the heading in force; carried over from the previous page when a section runs on
    words: list[str]


def _sections(pages: list[PageText]) -> list[_Section]:
    """Cut the pages into sections at each heading. A section never crosses a page boundary, so
    every citation points at exactly one page, but it keeps the heading it started under."""
    sections: list[_Section] = []
    heading = ""
    for page in pages:
        current = _Section(page.page_number, heading, [])
        after_heading = False
        for line in page.text.splitlines():
            line = line.strip()
            if _HEADING.match(line):
                text = line.lstrip("#").strip()
                if after_heading and not current.words:
                    heading = f"{heading} {text}"  # a long heading set over two lines
                    current.heading = heading
                    continue
                if current.words:
                    sections.append(current)
                heading = text
                current = _Section(page.page_number, heading, [])
                after_heading = True
            else:
                after_heading = False
                current.words.extend(re.sub(r"[ \t]+", " ", line).split())
        if current.words:
            sections.append(current)

    # Join a short section to the next one on the same page, keeping its heading in the text
    merged: list[_Section] = []
    for section in sections:
        previous = merged[-1] if merged else None
        if (
            previous is not None
            and previous.page_number == section.page_number
            and len(previous.words) < _MIN_SECTION_WORDS
        ):
            previous.words.extend([*section.heading.split(), *section.words])
            continue
        merged.append(section)
    return merged


def _ends_sentence(word: str) -> bool:
    return word.endswith((".", "?", "!", ".)", '."', ":")) or word.endswith(";")


def _windows(words: list[str], size: int, overlap: int) -> list[tuple[int, int]]:
    """(start, end) word ranges of about `size` words, overlapping by about `overlap`.

    A window ends at a sentence end when one falls in its last third, so a sentence is not cut in
    half. A leftover shorter than a third of `size` joins the window before it instead of becoming
    a scrap of a chunk that matches nothing well."""
    total = len(words)
    windows: list[tuple[int, int]] = []
    start = 0
    while start < total:
        end = min(start + size, total)
        if total - end < size // 3:
            end = total
        else:
            for cut in range(end, start + (size * 2) // 3, -1):
                if _ends_sentence(words[cut - 1]):
                    end = cut
                    break
        windows.append((start, end))
        if end >= total:
            break
        # Start the next window about `overlap` words back, at a sentence start when possible
        nxt = max(end - overlap, start + 1)
        for begin in range(nxt, end):
            if _ends_sentence(words[begin - 1]):
                nxt = begin
                break
        start = nxt
    return windows


def chapter_at(outline: list[OutlineEntry], page: int | None) -> str | None:
    """The chapter of a page: the last top-level outline entry that starts on or before it.
    The top level is the shallowest level the outline uses."""
    if page is None or not outline:
        return None
    top = min(e.level for e in outline)
    title = None
    for entry in outline:
        if entry.level == top and entry.page <= page:
            title = entry.title
    return title


def chunk_pages(
    pages: list[PageText],
    size_words: int,
    overlap_words: int,
    outline: list[OutlineEntry] | None = None,
) -> list[TextChunk]:
    """Split the text into overlapping windows inside each section, each starting with the
    section's heading so the passage says what it is about. A chunk never crosses a page
    boundary. Each chunk also records its section title: the chapter from the PDF outline that
    covers its page, else the nearest heading above it."""
    if overlap_words >= size_words:
        raise ValueError("overlap must be smaller than chunk size")
    chunks: list[TextChunk] = []
    for section in _sections(pages):
        words = section.words
        if len(words) < _MIN_WORDS:
            continue
        for start, end in _windows(words, size_words, overlap_words):
            body = " ".join(words[start:end])
            content = f"{section.heading}\n{body}" if section.heading else body
            title = chapter_at(outline or [], section.page_number) or section.heading or None
            chunks.append(
                TextChunk(len(chunks), section.page_number, content, title[:255] if title else None)
            )
    return chunks
