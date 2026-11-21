import uuid

import pytest
from sqlalchemy import func, select, update

from app.models.chat import MessageFeedback
from app.models.user import User
from app.tests.helpers import register, upload
from app.tests.test_chat_stream import QUESTION, RECURSION, _send, _thread, parse_sse


def _answered(client, fake_groq):  # type: ignore[no-untyped-def]
    """Ask one question and return (thread_id, assistant message id)."""
    upload(client, ["Course logistics.", RECURSION], title="Notes")
    thread_id = _thread(client)
    fake_groq.stream_replies.append(["A method [1]."])
    done = parse_sse(_send(client, thread_id).text)[-1][1]
    return thread_id, done["message_id"]


def _rate(client, message_id: str, **body):  # type: ignore[no-untyped-def]
    return client.post(f"/api/v1/tutor/messages/{message_id}/feedback", json=body)


def _make_admin(db, email: str) -> None:  # type: ignore[no-untyped-def]
    db.execute(update(User).where(User.email == email).values(is_admin=True))
    db.commit()


def test_thumbs_up_is_saved_and_shown_in_the_thread(auth_client, fake_groq) -> None:
    thread_id, message_id = _answered(auth_client, fake_groq)
    response = _rate(auth_client, message_id, rating="up")
    assert response.status_code == 200
    assert response.json() == {"message_id": message_id, "rating": "up", "reason": None}
    answer = auth_client.get(f"/api/v1/tutor/threads/{thread_id}").json()["messages"][1]
    assert answer["feedback"] == "up"


def test_rating_again_replaces_the_earlier_rating(auth_client, fake_groq, db) -> None:
    _, message_id = _answered(auth_client, fake_groq)
    _rate(auth_client, message_id, rating="up")
    changed = _rate(auth_client, message_id, rating="down", reason="wrong")
    assert changed.json()["rating"] == "down" and changed.json()["reason"] == "wrong"
    assert db.scalar(select(func.count()).select_from(MessageFeedback)) == 1


@pytest.mark.parametrize(
    "body",
    [
        {"rating": "sideways"},
        {"rating": "down", "reason": "rude"},
        {"rating": "up", "reason": "wrong"},  # a reason only makes sense with a thumbs down
    ],
)
def test_invalid_feedback_is_rejected(auth_client, fake_groq, body) -> None:
    _, message_id = _answered(auth_client, fake_groq)
    assert _rate(auth_client, message_id, **body).status_code == 422


def test_only_the_owner_can_rate_and_only_answers_can_be_rated(client_factory, fake_groq) -> None:
    alice, bob = client_factory(), client_factory()
    register(alice, "alice@example.com")
    register(bob, "bob@example.com")
    thread_id, message_id = _answered(alice, fake_groq)
    assert _rate(bob, message_id, rating="up").status_code == 404
    assert _rate(bob, str(uuid.uuid4()), rating="up").status_code == 404
    question_id = alice.get(f"/api/v1/tutor/threads/{thread_id}").json()["messages"][0]["id"]
    assert _rate(alice, question_id, rating="up").status_code == 404  # a student's own question


def test_feedback_list_is_admin_only(auth_client, fake_groq, db) -> None:
    _, message_id = _answered(auth_client, fake_groq)
    _rate(auth_client, message_id, rating="down", reason="missing_source")
    assert auth_client.get("/api/v1/tutor/feedback").status_code == 403
    _make_admin(db, "student@example.com")

    items = auth_client.get("/api/v1/tutor/feedback").json()
    assert len(items) == 1
    item = items[0]
    assert (item["rating"], item["reason"]) == ("down", "missing_source")
    assert item["question"] == QUESTION and item["answer"] == "A method [1]."
    assert item["abstained"] is False and item["created_at"]
    assert "email" not in item and "user_id" not in item  # no student identity


def test_feedback_list_is_newest_first_and_limited(auth_client, fake_groq, db) -> None:
    upload(auth_client, ["Course logistics.", RECURSION], title="Notes")
    thread_id = _thread(auth_client)
    ids = []
    for _ in range(3):
        fake_groq.stream_replies.append(["A method [1]."])
        ids.append(parse_sse(_send(auth_client, thread_id).text)[-1][1]["message_id"])
        fake_groq.replies.append({"standalone_question": QUESTION})
    for message_id in ids:
        _rate(auth_client, message_id, rating="up")
    _make_admin(db, "student@example.com")
    listed = auth_client.get("/api/v1/tutor/feedback").json()
    assert [i["message_id"] for i in listed] == list(reversed(ids))
    assert len(auth_client.get("/api/v1/tutor/feedback?limit=2").json()) == 2


def test_deleting_a_thread_removes_its_feedback(auth_client, fake_groq, db) -> None:
    thread_id, message_id = _answered(auth_client, fake_groq)
    _rate(auth_client, message_id, rating="up")
    auth_client.delete(f"/api/v1/tutor/threads/{thread_id}")
    assert db.scalar(select(func.count()).select_from(MessageFeedback)) == 0
