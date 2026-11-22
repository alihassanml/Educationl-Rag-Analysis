import uuid
from datetime import UTC, date, datetime, timedelta

from app.models.chat import ChatCitation, ChatMessage, ChatThread
from app.models.document import Document, DocumentChunk
from app.services.insights_service import ACTIVITY_DAYS, streaks
from app.tests.helpers import upload
from app.tests.test_chat_threads import RECURSION

URL = "/api/v1/progress/insights"


def test_streaks_count_consecutive_days_and_survive_until_tomorrow() -> None:
    today = date(2026, 3, 10)
    days = {today - timedelta(days=n) for n in (1, 2, 3)} | {date(2026, 2, 1), date(2026, 2, 2)}
    assert streaks(days, today) == (3, 3)  # yesterday still counts
    assert streaks(days | {today}, today) == (4, 4)
    assert streaks({today - timedelta(days=2)}, today) == (0, 1)  # a missed day breaks it
    assert streaks(set(), today) == (0, 0)


def test_new_student_insights_are_zero_with_an_empty_window(auth_client) -> None:
    body = auth_client.get(URL).json()
    assert body["questions_asked"] == 0 and body["current_streak"] == 0
    assert body["documents"] == [] and body["hot_pages"] == []
    assert len(body["activity"]) == ACTIVITY_DAYS
    assert body["activity"][-1]["date"] == body["today"]
    assert all(d["questions"] == 0 for d in body["activity"])


def _ask_and_answer(db, document_id: str, page: int, when: datetime) -> None:  # type: ignore[no-untyped-def]
    document = db.get(Document, uuid.UUID(document_id))
    chunk = db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).first()
    thread = ChatThread(user_id=document.user_id, title="Recursion")
    db.add(thread)
    db.flush()
    question = ChatMessage(
        thread_id=thread.id,
        user_id=thread.user_id,
        role="user",
        content="What is recursion?",
        created_at=when,
    )
    answer = ChatMessage(
        thread_id=thread.id,
        user_id=thread.user_id,
        role="assistant",
        content="It calls itself [1].",
        status="complete",
        created_at=when + timedelta(seconds=1),
    )
    db.add_all([question, answer])
    db.flush()
    db.add(
        ChatCitation(
            message_id=answer.id,
            chunk_id=chunk.id,
            document_id=document.id,
            document_title=document.title,
            page_number=page,
            marker=1,
            snippet="Recursion",
        )
    )
    db.commit()


def test_insights_reflect_questions_citations_and_streak(auth_client, db) -> None:
    document = upload(auth_client, [RECURSION, RECURSION], title="Algorithms").json()
    now = datetime.now(UTC)
    _ask_and_answer(db, document["id"], 1, now)
    _ask_and_answer(db, document["id"], 1, now - timedelta(days=1))
    _ask_and_answer(db, document["id"], 2, now - timedelta(days=1))

    body = auth_client.get(URL, params={"tz": "UTC"}).json()
    assert body["questions_asked"] == 3
    assert body["answers_with_sources"] == 3 and body["answers_not_found"] == 0
    assert body["citations_total"] == 3
    assert body["current_streak"] == 2 and body["active_days"] == 2
    assert [d["questions"] for d in body["activity"][-2:]] == [2, 1]

    [doc] = body["documents"]
    assert (doc["title"], doc["page_count"], doc["times_cited"], doc["pages_cited"]) == (
        "Algorithms",
        2,
        3,
        2,
    )
    assert body["pages_indexed"] == 2 and body["chunks_indexed"] == doc["chunk_count"] > 0
    assert [(p["page_number"], p["times_cited"]) for p in body["hot_pages"]] == [(1, 2), (2, 1)]


def test_insights_are_private_and_ignore_unknown_time_zones(client_factory, db) -> None:
    from app.tests.helpers import register

    alice, bob = client_factory(), client_factory()
    register(alice, "alice@example.com")
    register(bob, "bob@example.com")
    document = upload(alice, [RECURSION]).json()
    _ask_and_answer(db, document["id"], 1, datetime.now(UTC))

    assert alice.get(URL, params={"tz": "Not/AZone"}).json()["questions_asked"] == 1
    other = bob.get(URL).json()
    assert other["questions_asked"] == 0 and other["documents"] == [] and other["hot_pages"] == []
