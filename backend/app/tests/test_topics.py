import uuid

import pymupdf
import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.models.document import Document
from app.models.quiz import DocumentTopic, Topic, TopicProgress
from app.services import topic_service
from app.services.pdf_service import OutlineEntry
from app.services.topic_service import TopicCandidate
from app.tests.conftest import register
from app.tests.test_quizzes import good_question

_BODY = (
    "This chapter explains the idea in detail with definitions and worked examples so that the "
    "student can follow every step and remember the key terms later on. "
)


def _book(path, toc, pages=6):  # type: ignore[no-untyped-def]
    doc = pymupdf.open()
    for i in range(1, pages + 1):
        page = doc.new_page()
        page.insert_textbox(
            pymupdf.Rect(50, 50, 550, 800), f"Topic page {i} text. " + _BODY * 4, fontsize=11
        )
    if toc:
        doc.set_toc(toc)
    doc.save(path)
    doc.close()
    return path


def _upload(client, path):  # type: ignore[no-untyped-def]
    response = client.post(
        "/api/v1/documents",
        files={"file": (path.name, path.read_bytes(), "application/pdf")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _links(db, document_id):  # type: ignore[no-untyped-def]
    return [
        (t.name, link.position, link.first_page, link.last_page)
        for link, t in db.execute(
            select(DocumentTopic, Topic)
            .join(Topic, Topic.id == DocumentTopic.topic_id)
            .where(DocumentTopic.document_id == uuid.UUID(document_id))
            .order_by(DocumentTopic.position)
        )
    ]


# --- pure rules


def test_outline_topics_run_to_the_page_before_the_next_entry() -> None:
    outline = [
        OutlineEntry(1, "Book title", 1),  # a single top-level entry is not a usable list
        OutlineEntry(2, "Arrays", 1),
        OutlineEntry(2, "Recursion", 4),
        OutlineEntry(2, "Sorting", 7),
    ]
    found = topic_service.from_outline(outline, page_count=10)
    assert [(c.name, c.first_page, c.last_page) for c in found] == [
        ("Arrays", 1, 3),
        ("Recursion", 4, 6),
        ("Sorting", 7, 10),
    ]


def test_outline_with_too_many_or_too_few_entries_is_not_used() -> None:
    assert topic_service.from_outline([OutlineEntry(1, "Only one", 1)], 5) == []
    many = [OutlineEntry(1, f"Chapter {i}", i) for i in range(1, 30)]
    assert topic_service.from_outline(many, 40) == []


def test_heading_topics_keep_order_and_span_their_pages() -> None:
    rows = [("Intro", 1), ("Intro", 1), ("Loops", 2), ("Loops", 3), (None, 3), ("Loops", 3)]
    found = topic_service.from_headings(rows)
    assert [(c.name, c.first_page, c.last_page) for c in found] == [
        ("Intro", 1, 1),
        ("Loops", 2, 3),
    ]
    assert topic_service.from_headings([("Only", 1)]) == []
    assert topic_service.from_headings([("Intro", None), ("Loops", None)])[0].first_page is None


def test_duplicate_names_differing_only_in_case_are_merged() -> None:
    got = topic_service._dedupe(
        [TopicCandidate("Recursion"), TopicCandidate("  recursion "), TopicCandidate("Sorting")]
    )
    assert [c.name for c in got] == ["Recursion", "Sorting"]


# --- on upload


def test_pdf_outline_topics_are_saved_in_document_order(client, db, tmp_path) -> None:  # type: ignore[no-untyped-def]
    register(client)
    path = _book(
        tmp_path / "book.pdf",
        [[1, "Arrays", 1], [1, "Recursion", 3], [1, "Sorting", 5]],
    )
    document = _upload(client, path)
    assert _links(db, document["id"]) == [
        ("Arrays", 1, 1, 2),
        ("Recursion", 2, 3, 4),
        ("Sorting", 3, 5, 6),
    ]


def test_a_document_without_topics_still_becomes_ready(client, db, tmp_path) -> None:  # type: ignore[no-untyped-def]
    register(client)
    document = _upload(client, _book(tmp_path / "plain.pdf", None))
    assert document["status"] == "ready"
    assert _links(db, document["id"]) == []


def test_llm_names_topics_only_when_nothing_else_works(
    client, db, fake_groq, tmp_path, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(get_settings(), "topics_llm_fallback", True)
    register(client)
    fake_groq.replies.append(
        {"topics": ["Definitions", "Worked examples", "Quantum chromodynamics", 7]}
    )
    document = _upload(client, _book(tmp_path / "plain.pdf", None))
    # "Quantum chromodynamics" shares no word with the document, and 7 is not a name
    assert [n for n, *_ in _links(db, document["id"])] == ["Definitions", "Worked examples"]
    assert "<passages>" in fake_groq.calls[0]["user"]


def test_llm_is_not_asked_when_the_outline_is_enough(
    client, fake_groq, tmp_path, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(get_settings(), "topics_llm_fallback", True)
    register(client)
    _upload(client, _book(tmp_path / "b.pdf", [[1, "Arrays", 1], [1, "Sorting", 4]]))
    assert fake_groq.calls == []


def test_unusable_llm_output_leaves_no_topics(client, db, fake_groq, tmp_path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(get_settings(), "topics_llm_fallback", True)
    register(client)
    fake_groq.replies.append({"topics": "not a list"})
    document = _upload(client, _book(tmp_path / "plain.pdf", None))
    assert document["status"] == "ready" and _links(db, document["id"]) == []


def test_pasted_text_headings_become_topics(client, db) -> None:  # type: ignore[no-untyped-def]
    register(client)
    text = "# Arrays\n" + _BODY * 3 + "\n# Sorting\n" + _BODY * 3
    response = client.post("/api/v1/documents/text", json={"title": "Pasted", "text": text})
    assert response.status_code == 201
    links = _links(db, response.json()["id"])
    assert [(n, first) for n, _, first, _ in links] == [("Arrays", None), ("Sorting", None)]


# --- deleting, sharing between documents, other students


def test_topics_follow_their_documents_but_survive_progress(client, db, tmp_path) -> None:  # type: ignore[no-untyped-def]
    register(client)
    first = _upload(client, _book(tmp_path / "a.pdf", [[1, "Arrays", 1], [1, "Sorting", 4]]))
    second = _upload(client, _book(tmp_path / "b.pdf", [[1, "arrays", 1], [1, "Graphs", 4]]))
    assert db.query(Topic).count() == 3  # "Arrays" and "arrays" are one topic

    sorting = db.scalar(select(Topic).where(Topic.name == "Sorting"))
    db.add(
        TopicProgress(
            user_id=sorting.user_id, topic_id=sorting.id, attempt_count=3, correct_count=1
        )
    )
    db.flush()

    assert client.delete(f"/api/v1/documents/{first['id']}").status_code == 204
    names = sorted(t.name for t in db.scalars(select(Topic)))
    assert names == [
        "Arrays",
        "Graphs",
        "Sorting",
    ]  # Arrays is still in doc 2, Sorting has progress

    assert client.delete(f"/api/v1/documents/{second['id']}").status_code == 204
    assert [t.name for t in db.scalars(select(Topic))] == ["Sorting"]


def test_each_student_gets_their_own_topic_rows(client_factory, db, tmp_path) -> None:  # type: ignore[no-untyped-def]
    a, b = client_factory(), client_factory()
    register(a, "a@example.com")
    _upload(a, _book(tmp_path / "a.pdf", [[1, "Arrays", 1], [1, "Sorting", 4]]))
    register(b, "b@example.com")
    _upload(b, _book(tmp_path / "b.pdf", [[1, "Arrays", 1], [1, "Sorting", 4]]))
    assert db.query(Topic).count() == 4
    assert db.query(Topic.user_id).distinct().count() == 2


def test_reextracting_replaces_the_links(client, db, tmp_path) -> None:  # type: ignore[no-untyped-def]
    register(client)
    document = _upload(client, _book(tmp_path / "a.pdf", [[1, "Arrays", 1], [1, "Sorting", 4]]))
    row = db.get(Document, uuid.UUID(document["id"]))
    topic_service.extract_for_document(db, None, row)
    topic_service.extract_for_document(db, None, row)
    assert len(_links(db, document["id"])) == 2


# --- quizzes pull a topic's own passages


def test_a_quiz_on_an_extracted_topic_uses_that_topics_pages(
    client, db, fake_groq, tmp_path
) -> None:  # type: ignore[no-untyped-def]
    register(client)
    path = tmp_path / "book.pdf"
    doc = pymupdf.open()
    for text in ["Arrays store items in order. " * 12, "Sorting arranges items in order. " * 12]:
        doc.new_page().insert_textbox(pymupdf.Rect(50, 50, 550, 800), text, fontsize=11)
    doc.set_toc([[1, "Arrays", 1], [1, "Sorting", 2]])
    doc.save(path)
    doc.close()
    _upload(client, path)

    fake_groq.replies.append({"topic": "x", "questions": [good_question(i) for i in range(1, 4)]})
    response = client.post(
        "/api/v1/quizzes/generate", json={"topic": "sorting", "num_questions": 3}
    )
    assert response.status_code == 201
    prompt = fake_groq.calls[0]["user"]
    assert "Sorting arranges items" in prompt and "Arrays store items" not in prompt
    assert response.json()["topic"] == "Sorting"


def test_anchor_chunks_are_owned_by_the_student(client_factory, db, tmp_path) -> None:  # type: ignore[no-untyped-def]
    a, b = client_factory(), client_factory()
    register(a, "a@example.com")
    _upload(a, _book(tmp_path / "a.pdf", [[1, "Arrays", 1], [1, "Sorting", 4]]))
    me = db.scalar(select(Topic).where(Topic.name == "Arrays"))
    other = register(b, "b@example.com")
    assert topic_service.anchor_chunks(db, me.user_id, me.id, 5)
    assert topic_service.anchor_chunks(db, uuid.UUID(other["id"]), me.id, 5) == []


@pytest.mark.parametrize("name", ["", "   "])
def test_blank_topic_names_become_general(db, client, name) -> None:  # type: ignore[no-untyped-def]
    user = register(client)
    topic = topic_service.get_or_create_topic(db, uuid.UUID(user["id"]), name)
    assert topic.name == "General"
