import pymupdf

from app.models.document import Document, DocumentChunk
from app.services.chunking_service import chapter_at, chunk_pages
from app.services.pdf_service import OutlineEntry, PageText, extract_outline
from app.tests.conftest import register

_BODY = (
    "Recursion happens when a function calls itself on a smaller input until it reaches a base "
    "case that stops the calls. Each call waits for the next one to return a value. "
)


def _pdf_with_outline(path, toc):  # type: ignore[no-untyped-def]
    doc = pymupdf.open()
    for i in range(1, 5):
        page = doc.new_page()
        page.insert_textbox(pymupdf.Rect(50, 50, 550, 800), f"Page {i}. " + _BODY * 3, fontsize=11)
    if toc:
        doc.set_toc(toc)
    doc.save(path)
    doc.close()
    return path


def test_chapter_is_the_last_top_level_entry_on_or_before_the_page() -> None:
    outline = [
        OutlineEntry(1, "Chapter 1: Basics", 1),
        OutlineEntry(2, "Loops", 2),
        OutlineEntry(1, "Chapter 2: Recursion", 3),
    ]
    assert chapter_at(outline, 1) == "Chapter 1: Basics"
    assert chapter_at(outline, 2) == "Chapter 1: Basics"  # a sub-entry is not a chapter
    assert chapter_at(outline, 3) == "Chapter 2: Recursion"
    assert chapter_at(outline, 9) == "Chapter 2: Recursion"
    assert chapter_at(outline, None) is None
    assert chapter_at([], 2) is None


def test_chunks_take_the_outline_chapter_over_the_heading() -> None:
    pages = [PageText(1, "# A heading\n" + _BODY), PageText(2, "# Another\n" + _BODY)]
    outline = [OutlineEntry(1, "Chapter 1", 1), OutlineEntry(1, "Chapter 2", 2)]
    chunks = chunk_pages(pages, 100, 10, outline)
    assert [c.section_title for c in chunks] == ["Chapter 1", "Chapter 2"]


def test_chunks_fall_back_to_the_nearest_heading_without_an_outline() -> None:
    pages = [PageText(1, "# Base cases\n" + _BODY), PageText(2, _BODY)]
    chunks = chunk_pages(pages, 100, 10)
    # The heading stays in force on the next page until a new one appears
    assert [c.section_title for c in chunks] == ["Base cases", "Base cases"]
    assert chunk_pages([PageText(1, _BODY)], 100, 10)[0].section_title is None


def test_extract_outline_reads_bookmarks_and_tolerates_none(tmp_path) -> None:  # type: ignore[no-untyped-def]
    with_toc = _pdf_with_outline(
        tmp_path / "a.pdf", [[1, "Chapter 1: Basics", 1], [1, "Chapter 2: Recursion", 3]]
    )
    assert [(e.level, e.title, e.page) for e in extract_outline(with_toc)] == [
        (1, "Chapter 1: Basics", 1),
        (1, "Chapter 2: Recursion", 3),
    ]
    assert extract_outline(_pdf_with_outline(tmp_path / "b.pdf", None)) == []
    assert extract_outline(tmp_path / "missing.pdf") == []


def test_upload_stores_the_chapter_and_the_tutor_cites_it(  # type: ignore[no-untyped-def]
    client, db, fake_groq, tmp_path
) -> None:
    register(client)
    path = _pdf_with_outline(
        tmp_path / "book.pdf", [[1, "Chapter 1: Basics", 1], [1, "Chapter 2: Recursion", 3]]
    )
    response = client.post(
        "/api/v1/documents",
        files={"file": ("book.pdf", path.read_bytes(), "application/pdf")},
    )
    assert response.status_code == 201
    chunks = db.query(DocumentChunk).order_by(DocumentChunk.chunk_index).all()
    by_page = {c.page_number: c.section_title for c in chunks}
    assert by_page[1] == "Chapter 1: Basics" and by_page[4] == "Chapter 2: Recursion"

    fake_groq.replies.append(
        {
            "answer": "A function calling itself.",
            "insufficient_evidence": False,
            "used_passages": [1],
        }  # fmt: skip
    )
    answer = client.post("/api/v1/tutor/ask", json={"question": "What is recursion?"}).json()
    assert answer["citations"][0]["section_title"].startswith("Chapter")
    assert db.query(Document).count() == 1
