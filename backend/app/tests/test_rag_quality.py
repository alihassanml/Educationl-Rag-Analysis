"""Retrieval quality: what the index is built from, and which questions are searched or sampled."""

import uuid
from pathlib import Path

import pymupdf

from app.services.chunking_service import chunk_pages
from app.services.intent_service import wants_whole_material, without_titles
from app.services.pdf_service import HEADING_MARK, PageText, extract_pages
from app.tests.helpers import register, upload
from app.tests.test_chat_stream import RECURSION, _send, _thread, parse_sse
from app.tests.test_quizzes import generate, reply

# Reading the PDF


def _pdf(tmp_path: Path, pages: list[list[tuple[str, float]]], table_on: int | None = None) -> Path:
    """Pages of (text, font size) lines, each with the same running header and a page footer."""
    doc = pymupdf.open()
    for number, lines in enumerate(pages, start=1):
        page = doc.new_page()
        page.insert_text((50, 30), "Course Pack 2026", fontsize=7)
        y = 80.0
        for text, size in lines:
            page.insert_text((50, y), text, fontsize=size)
            y += size + 10
        if number == table_on:
            rows = [("Plan", "Price"), ("Basic", "$10"), ("Pro", "$40")]
            top, height, left, mid, right = y + 10, 24, 50, 200, 350
            for i in range(len(rows) + 1):
                page.draw_line((left, top + i * height), (right, top + i * height))
            for x in (left, mid, right):
                page.draw_line((x, top), (x, top + len(rows) * height))
            for i, (a, b) in enumerate(rows):
                page.insert_text((left + 6, top + i * height + 16), a, fontsize=11)
                page.insert_text((mid + 6, top + i * height + 16), b, fontsize=11)
        page.insert_text((50, 820), f"Page {number} of {len(pages)}", fontsize=7)
    path = tmp_path / "pack.pdf"
    doc.save(path)
    doc.close()
    return path


BODY = "Paging divides memory into fixed size frames so a process need not be contiguous."


def test_running_headers_and_footers_are_dropped(tmp_path: Path) -> None:
    pages = extract_pages(_pdf(tmp_path, [[(BODY, 11)], [(BODY, 11)], [(BODY, 11)]]))
    for page in pages:
        assert "Course Pack" not in page.text and "Page" not in page.text.replace("Paging", "")
        assert "fixed size frames" in page.text


def test_larger_lines_are_marked_as_headings(tmp_path: Path) -> None:
    pages = extract_pages(_pdf(tmp_path, [[("Memory management", 16), (BODY, 11), (BODY, 11)]]))
    lines = pages[0].text.splitlines()
    assert f"{HEADING_MARK}Memory management" in lines
    assert f"{HEADING_MARK}{BODY}" not in lines and BODY in lines


def test_a_sentence_repeated_in_the_body_of_every_page_is_kept(tmp_path: Path) -> None:
    pages = extract_pages(_pdf(tmp_path, [[(BODY, 11)]] * 4))
    assert all(BODY in page.text for page in pages)


def test_a_table_becomes_one_line_per_row_with_column_names(tmp_path: Path) -> None:
    pages = extract_pages(_pdf(tmp_path, [[(BODY, 11)]], table_on=1))
    assert "Plan: Basic; Price: $10" in pages[0].text
    assert "Plan: Pro; Price: $40" in pages[0].text


def _ruled_table(page, top: float, rows: list[tuple[str, str]]) -> None:  # type: ignore[no-untyped-def]
    height, left, mid, right = 24, 50, 200, 350
    for i in range(len(rows) + 1):
        page.draw_line((left, top + i * height), (right, top + i * height))
    for x in (left, mid, right):
        page.draw_line((x, top), (x, top + len(rows) * height))
    for i, (a, b) in enumerate(rows):
        page.insert_text((left + 6, top + i * height + 16), a, fontsize=11)
        page.insert_text((mid + 6, top + i * height + 16), b, fontsize=11)


def test_a_table_continued_on_the_next_page_keeps_its_header(tmp_path: Path) -> None:
    doc = pymupdf.open()
    first = doc.new_page()
    first.insert_text((50, 80), BODY, fontsize=11)
    _ruled_table(first, 640, [("Phase", "Weeks"), ("Design", "1 to 3"), ("Build", "4 to 6")])
    second = doc.new_page()  # the table runs on with no header row
    _ruled_table(second, 60, [("Testing", "7 to 9"), ("Defense", "10")])
    second.insert_text((50, 200), BODY, fontsize=11)
    path = tmp_path / "plan.pdf"
    doc.save(path)
    pages = extract_pages(path)
    assert "Phase: Build; Weeks: 4 to 6" in pages[0].text
    assert "Phase: Testing; Weeks: 7 to 9" in pages[1].text
    assert "Testing: Defense" not in pages[1].text


def test_a_table_stays_where_it_is_when_the_page_number_comes_first(tmp_path: Path) -> None:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((300, 820), "9", fontsize=9)  # page number, written to the file first
    page.insert_text((50, 80), "Text above the table.", fontsize=11)
    _ruled_table(page, 300, [("Plan", "Price"), ("Basic", "$10")])
    path = tmp_path / "placed.pdf"
    doc.save(path)
    text = extract_pages(path)[0].text
    assert text.index("Text above the table.") < text.index("Plan: Basic")


def test_a_paragraph_in_larger_type_is_not_a_heading(tmp_path: Path) -> None:
    lines = (
        [("Note", 16), (BODY, 11)]
        + [(f"Highlighted line number {i} of a longer paragraph", 13) for i in range(4)]
        + [(BODY, 11)] * 6
    )
    text = extract_pages(_pdf(tmp_path, [lines]))[0].text
    assert f"{HEADING_MARK}Note" in text.splitlines()
    assert f"{HEADING_MARK}Highlighted" not in text


# Chunking


def _words(n: int, prefix: str) -> str:
    return " ".join(f"{prefix}{i}" for i in range(n))


def test_every_chunk_starts_with_its_heading_even_on_the_next_page() -> None:
    pages = [
        PageText(1, f"{HEADING_MARK}Outbound calls\n{_words(60, 'a')}"),
        PageText(2, _words(60, "b")),  # the section runs on with no heading of its own
    ]
    chunks = chunk_pages(pages, size_words=100, overlap_words=10)
    assert [c.page_number for c in chunks] == [1, 2]
    assert all(c.content.startswith("Outbound calls\n") for c in chunks)


def test_a_new_heading_starts_a_new_chunk() -> None:
    text = f"{HEADING_MARK}Pricing\n{_words(60, 'p')}\n{HEADING_MARK}Refunds\n{_words(60, 'r')}"
    chunks = chunk_pages([PageText(4, text)], size_words=180, overlap_words=30)
    assert [c.content.split("\n")[0] for c in chunks] == ["Pricing", "Refunds"]
    assert "r0" not in chunks[0].content


def test_a_heading_over_two_lines_is_one_heading() -> None:
    text = f"{HEADING_MARK}Phynxa knowledge base (RAG\n{HEADING_MARK}Source)\n{_words(60, 'w')}"
    chunks = chunk_pages([PageText(1, text)], size_words=100, overlap_words=10)
    assert chunks[0].content.startswith("Phynxa knowledge base (RAG Source)\n")


def test_a_short_section_is_joined_to_the_next_one_on_the_page() -> None:
    text = f"{HEADING_MARK}Contact\nCall us any time\n{HEADING_MARK}Hours\n{_words(60, 'h')}"
    chunks = chunk_pages([PageText(1, text)], size_words=180, overlap_words=30)
    assert len(chunks) == 1
    assert "Call us any time Hours" in chunks[0].content


# Which questions are searched and which are answered from a sample of the material

DOCS = [(uuid.uuid4(), "Phynxa Website Knowledge Base (RAG Source)"), (uuid.uuid4(), "OS Notes")]


def test_broad_requests_with_no_subject_use_the_whole_material() -> None:
    for question in [
        "Explain the hardest topic in Phynxa Website Knowledge Base (RAG Source) simply",
        "What are the main topics?",
        "What does this document cover?",
        "Summarise OS Notes",
    ]:
        assert wants_whole_material(question, documents=DOCS), question
    assert wants_whole_material("", mode="summary", documents=DOCS)


def test_questions_with_a_subject_are_searched() -> None:
    for question in [
        "What is recursion in OS Notes?",
        "Key ideas of recursion",
        "What is the hardest part of deadlock?",
        "How much is the Growth plan?",
        "What do my notes say about deadlock?",
    ]:
        assert not wants_whole_material(question, documents=DOCS), question
    assert not wants_whole_material("deadlock", mode="summary", documents=DOCS)


def test_a_document_title_is_taken_out_of_the_search() -> None:
    assert without_titles("What is paging in OS Notes?", DOCS) == "what is paging ?"
    # A title that is also the subject stays: "operating systems" is what is asked about
    assert without_titles("What are operating systems?", [(uuid.uuid4(), "Operating Systems")]) == (
        "what are operating systems?"
    )


def test_the_hardest_topic_in_a_named_document_is_answered_from_a_sample(
    auth_client, fake_groq
) -> None:
    # The title's words appear in the material too, so a search would "find" the wrong passage
    upload(
        auth_client,
        ["About these Course Notes and how grading works.", RECURSION],
        title="Course Notes",
    )
    thread_id = _thread(auth_client)
    fake_groq.stream_replies.append(["Recursion is the hardest [2]."])
    events = parse_sse(
        _send(auth_client, thread_id, "Explain the hardest topic in Course Notes simply").text
    )

    assert events[-1][1]["abstained"] is False
    prompt = fake_groq.stream_calls[0]["user"]
    assert "sample from across the student's material" in prompt
    assert "Recursion is a method" in prompt and "grading" in prompt  # spread over the document


def test_a_question_naming_a_document_searches_only_that_document(auth_client, fake_groq) -> None:
    upload(auth_client, [RECURSION], title="Recursion Notes")
    upload(
        auth_client,
        ["Recursion in biology means a pattern repeating inside itself."],
        title="Biology",
    )
    thread_id = _thread(auth_client)
    fake_groq.stream_replies.append(["A base case [1]."])
    _send(auth_client, thread_id, "What is recursion in Recursion Notes?")
    prompt = fake_groq.stream_calls[0]["user"]
    assert "base case" in prompt and "biology" not in prompt
    assert "sample from across" not in prompt  # a real search, not a sample


# Quiz follow-ups: "give me 10 more"


def test_a_follow_up_with_no_subject_quizzes_the_material_instead_of_failing(
    auth_client, fake_groq
) -> None:
    upload(auth_client, [RECURSION], title="Notes")
    fake_groq.replies.append(reply(count=3))
    response = generate(auth_client, topic="more", num_questions=3)
    assert response.status_code == 201  # not "your material does not cover that topic"


def test_a_follow_up_quiz_is_told_not_to_repeat_the_earlier_questions(
    auth_client, fake_groq
) -> None:
    upload(auth_client, [RECURSION], title="Notes")
    fake_groq.replies.append(reply(count=3))
    first = generate(auth_client, num_questions=3).json()
    fake_groq.replies.append(reply(count=3, start=1))  # the model repeats itself at first
    fake_groq.replies.append(reply(count=3, start=10))
    second = generate(auth_client, num_questions=3, exclude_quiz_id=first["id"]).json()

    asked = {q["question_text"] for q in first["questions"]}
    assert asked.isdisjoint(q["question_text"] for q in second["questions"])
    assert "already answered these questions" in fake_groq.calls[1]["user"]
    assert "Question number 1 about recursion?" in fake_groq.calls[1]["user"]


def test_another_users_quiz_cannot_be_used_to_leak_its_questions(client_factory, fake_groq) -> None:
    owner, other = client_factory(), client_factory()
    register(owner, "owner@example.com")
    register(other, "other@example.com")
    upload(owner, [RECURSION], title="Notes")
    fake_groq.replies.append(reply(count=3))
    theirs = generate(owner, num_questions=3).json()

    upload(other, [RECURSION], title="Notes")
    fake_groq.replies.append(reply(count=3, start=20))
    generate(other, num_questions=3, exclude_quiz_id=theirs["id"])
    assert "already answered" not in fake_groq.calls[-1]["user"]


# Re-indexing documents uploaded before a chunking change


def test_reindex_rebuilds_the_passages_of_a_stored_document(db, tmp_path: Path) -> None:
    from sqlalchemy import select

    from app.models.document import DocumentChunk
    from app.services import document_service
    from app.tests.helpers import FakeEmbedder, add_document, make_user

    user = make_user(db, "student@example.com", is_admin=False)
    document = add_document(db, user, "Notes", [RECURSION], tmp_path)
    for chunk in db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == document.id)):
        chunk.content = "stale passage from the old chunker"
    db.commit()

    document_service.reindex(db, FakeEmbedder(), document)

    contents = db.scalars(
        select(DocumentChunk.content).where(DocumentChunk.document_id == document.id)
    ).all()
    assert document.status == "ready"
    assert contents and all("stale" not in c for c in contents)
    assert any("Recursion is a method" in c for c in contents)
