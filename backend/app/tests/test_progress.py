from sqlalchemy import select

from app.models.quiz import Question
from app.tests.helpers import register, upload
from app.tests.test_quizzes import NOTES, _answers, generate, reply


def _take(client, db, fake_groq, topic: str, right: int, total: int = 5) -> dict:
    fake_groq.replies.append(reply(count=total, topic=topic, start=len(fake_groq.calls) * 20 + 1))
    quiz = generate(client, topic=None, num_questions=total).json()
    questions = db.scalars(
        select(Question).where(Question.quiz_id == quiz["id"]).order_by(Question.position)
    ).all()
    picks = [
        q.correct_index if i < right else (q.correct_index + 1) % 4 for i, q in enumerate(questions)
    ]
    response = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", json=_answers(quiz, picks))
    assert response.status_code == 201, response.text
    return response.json()


def test_new_student_summary_is_empty_not_fake(auth_client):
    body = auth_client.get("/api/v1/progress/summary").json()
    assert body["documents_total"] == 0
    assert body["quizzes_completed"] == 0
    assert body["average_score_percent"] is None
    assert body["next_step"] is None and body["recent_activity"] == []
    assert auth_client.get("/api/v1/progress/topics").json()["items"] == []


def test_summary_and_topics_reflect_attempts(auth_client, db, fake_groq):
    upload(auth_client, [NOTES], title="Notes")
    _take(auth_client, db, fake_groq, "Recursion", right=2)  # 40%
    _take(auth_client, db, fake_groq, "Sorting", right=5)  # 100% but only 5 answers
    # now() is constant inside the test transaction, so order the two attempts explicitly
    from datetime import UTC, datetime, timedelta

    from app.models.quiz import QuizAttempt

    for attempt in db.scalars(select(QuizAttempt)):
        attempt.completed_at = datetime(2026, 1, 1, tzinfo=UTC) + timedelta(days=attempt.score)
    db.flush()

    summary = auth_client.get("/api/v1/progress/summary").json()
    assert summary["documents_ready"] == 1
    assert summary["quizzes_completed"] == 2
    assert summary["average_score_percent"] == 70
    assert summary["topics_needing_revision"] == 1
    assert summary["needs_revision"][0]["topic_name"] == "Recursion"
    assert summary["next_step"]["topic_name"] == "Recursion"
    assert "2/5" in summary["next_step"]["recommendation"]["message"]
    assert [a["topic"] for a in summary["recent_activity"]] == ["Sorting", "Recursion"]
    assert summary["latest_document"]["title"] == "Notes"

    topics = auth_client.get("/api/v1/progress/topics").json()
    assert [t["topic_name"] for t in topics["items"]] == ["Recursion", "Sorting"]
    assert topics["items"][0]["accuracy_percent"] == 40
    assert topics["items"][1]["status"] == "doing_well"
    assert topics["rules"] == {
        "min_attempts": 3,
        "needs_revision_below_percent": 60,
        "doing_well_from_percent": 80,
    }


def test_progress_accumulates_across_quizzes_on_one_topic(auth_client, db, fake_groq):
    upload(auth_client, [NOTES])
    _take(auth_client, db, fake_groq, "Recursion", right=2)
    result = _take(auth_client, db, fake_groq, "Recursion", right=5)
    topic = auth_client.get("/api/v1/progress/topics").json()["items"][0]
    assert (topic["questions_attempted"], topic["correct_answers"]) == (10, 7)
    assert topic["accuracy_percent"] == 70 and topic["status"] == "practicing"
    assert result["topic_status"] == "practicing"


def test_progress_is_private_per_student(client_factory, db, fake_groq):
    alice, bob = client_factory(), client_factory()
    register(alice, "alice@example.com")
    register(bob, "bob@example.com")
    upload(alice, [NOTES])
    _take(alice, db, fake_groq, "Recursion", right=1)
    assert bob.get("/api/v1/progress/topics").json()["items"] == []
    assert bob.get("/api/v1/progress/summary").json()["quizzes_completed"] == 0
