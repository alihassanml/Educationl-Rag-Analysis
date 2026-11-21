import uuid

from sqlalchemy import func, select

from app.models.chat import ChatCitation, ChatMessage, ChatThread
from app.models.document import Document
from app.tests.helpers import register, upload

RECURSION = (
    "Recursion is a method where a function calls itself to solve smaller instances of a problem. "
    "Every recursive function needs a base case that stops the calls."
)


def _two_users(client_factory):  # type: ignore[no-untyped-def]
    alice, bob = client_factory(), client_factory()
    register(alice, "alice@example.com")
    register(bob, "bob@example.com")
    return alice, bob


def _new_thread(client, **body):  # type: ignore[no-untyped-def]
    response = client.post("/api/v1/tutor/threads", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_thread_starts_empty_with_a_default_title(auth_client) -> None:
    thread = _new_thread(auth_client)
    assert thread["title"] == "New chat"
    detail = auth_client.get(f"/api/v1/tutor/threads/{thread['id']}").json()
    assert detail["messages"] == []


def test_list_threads_is_newest_first_and_paginated(auth_client) -> None:
    ids = [_new_thread(auth_client)["id"] for _ in range(3)]
    listed = auth_client.get("/api/v1/tutor/threads").json()
    assert [t["id"] for t in listed] == list(reversed(ids))
    page = auth_client.get("/api/v1/tutor/threads?limit=1&offset=1").json()
    assert [t["id"] for t in page] == [ids[1]]


def test_rename_thread_trims_and_rejects_blank_titles(auth_client) -> None:
    thread = _new_thread(auth_client)
    url = f"/api/v1/tutor/threads/{thread['id']}"
    renamed = auth_client.patch(url, json={"title": "  Recursion revision  "})
    assert renamed.status_code == 200 and renamed.json()["title"] == "Recursion revision"
    assert auth_client.patch(url, json={"title": "   "}).status_code == 422
    assert auth_client.patch(url, json={"title": "x" * 121}).status_code == 422


def test_delete_thread_removes_messages_and_citations(auth_client, db) -> None:
    document = upload(auth_client, [RECURSION]).json()
    thread = _new_thread(auth_client)
    _add_answer(db, thread["id"], document["id"])
    assert db.scalar(select(func.count()).select_from(ChatCitation)) == 1

    assert auth_client.delete(f"/api/v1/tutor/threads/{thread['id']}").status_code == 204
    assert db.scalar(select(func.count()).select_from(ChatMessage)) == 0
    assert db.scalar(select(func.count()).select_from(ChatCitation)) == 0
    assert auth_client.get(f"/api/v1/tutor/threads/{thread['id']}").status_code == 404


def test_another_users_thread_is_404_for_read_rename_and_delete(client_factory) -> None:
    alice, bob = _two_users(client_factory)
    url = f"/api/v1/tutor/threads/{_new_thread(alice)['id']}"
    assert bob.get(url).status_code == 404
    assert bob.patch(url, json={"title": "mine now"}).status_code == 404
    assert bob.delete(url).status_code == 404
    assert alice.get(url).json()["title"] == "New chat"  # untouched
    assert bob.get("/api/v1/tutor/threads").json() == []


def test_unknown_thread_id_is_404_and_signed_out_is_401(client_factory) -> None:
    client = client_factory()
    assert client.get("/api/v1/tutor/threads").status_code == 401
    register(client)
    assert client.get(f"/api/v1/tutor/threads/{uuid.uuid4()}").status_code == 404


def test_citation_to_a_deleted_document_is_marked_source_deleted(auth_client, db) -> None:
    document = upload(auth_client, [RECURSION], title="Programming Notes").json()
    thread = _new_thread(auth_client)
    _add_answer(db, thread["id"], document["id"])
    url = f"/api/v1/tutor/threads/{thread['id']}"

    before = auth_client.get(url).json()["messages"][0]["citations"][0]
    assert before["source_deleted"] is False and before["document_title"] == "Programming Notes"

    assert auth_client.delete(f"/api/v1/documents/{document['id']}").status_code == 204
    db.expire_all()  # the test shares one session; a real request would load fresh rows
    after = auth_client.get(url).json()["messages"][0]["citations"][0]
    assert after["source_deleted"] is True
    assert after["document_title"] == "Programming Notes"  # kept so the history still reads well
    assert after["page_number"] == 1


def _add_answer(db, thread_id: str, document_id: str) -> None:  # type: ignore[no-untyped-def]
    """Insert one answered message with a citation, as the streaming endpoint will later."""
    from app.models.document import DocumentChunk

    chunk = db.scalar(select(DocumentChunk).where(DocumentChunk.document_id == document_id))
    document = db.get(Document, uuid.UUID(document_id))
    thread = db.get(ChatThread, uuid.UUID(thread_id))
    message = ChatMessage(
        thread_id=thread.id,
        user_id=thread.user_id,
        role="assistant",
        content="A function calling itself [1].",
        status="complete",
    )
    db.add(message)
    db.flush()
    db.add(
        ChatCitation(
            message_id=message.id,
            chunk_id=chunk.id,
            document_id=document.id,
            document_title=document.title,
            page_number=1,
            marker=1,
            snippet="Recursion is a method",
        )
    )
    db.commit()
