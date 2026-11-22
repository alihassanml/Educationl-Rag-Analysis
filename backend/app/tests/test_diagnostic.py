import pytest
from sqlalchemy import select

from app.models.quiz import Question, Quiz, Topic, TopicProgress
from app.services.groq_service import LLMUnavailableError
from app.services.recommendation_service import diagnostic_level, diagnostic_plan
from app.tests.conftest import register
from app.tests.test_quizzes import good_question
from app.tests.test_topics import _book, _upload

TOC = [[1, "Arrays", 1], [1, "Recursion", 3], [1, "Sorting", 5]]


# --- pure rules


@pytest.mark.parametrize(
    ("topics", "expected"),
    [
        (0, []),
        (1, [2]),
        (3, [2, 2, 2]),
        (7, [2] * 7),  # 14 questions
        (8, [2] * 7 + [1]),  # the limit of 15 is reached
        (10, [2] * 5 + [1] * 5),
        (15, [1] * 15),
        (20, [1] * 15),  # topics beyond the limit are not asked about
    ],
)
def test_plan_gives_each_topic_one_or_two_questions_within_the_limit(topics, expected) -> None:  # type: ignore[no-untyped-def]
    plan = diagnostic_plan(topics, 15)
    assert plan == expected
    assert sum(plan) <= 15


@pytest.mark.parametrize(
    ("correct", "asked", "level"),
    [
        (0, 1, "beginner"),
        (1, 1, "advanced"),  # all right
        (0, 2, "beginner"),
        (1, 2, "intermediate"),  # half
        (2, 2, "advanced"),
        (1, 3, "beginner"),  # under half
        (2, 3, "intermediate"),
        (0, 0, "beginner"),
    ],
)
def test_level_from_the_diagnostic_score(correct, asked, level) -> None:  # type: ignore[no-untyped-def]
    assert diagnostic_level(correct, asked) == level


# --- through the API


@pytest.fixture
def student(client, tmp_path):  # type: ignore[no-untyped-def]
    register(client)
    _upload(client, _book(tmp_path / "book.pdf", TOC))
    return client


def _queue(fake_groq, topics: int = 3, per_topic: int = 2) -> None:  # type: ignore[no-untyped-def]
    for t in range(topics):
        fake_groq.replies.append(
            {
                "topic": "x",
                "questions": [good_question(t * 10 + i + 1) for i in range(per_topic)],
            }
        )


def test_status_before_and_after_a_document(client, tmp_path) -> None:  # type: ignore[no-untyped-def]
    register(client)
    empty = client.get("/api/v1/diagnostic/status").json()
    assert (empty["available"], empty["suggested"], empty["taken"]) == (False, False, False)
    _upload(client, _book(tmp_path / "book.pdf", TOC))
    ready = client.get("/api/v1/diagnostic/status").json()
    assert (ready["ready_documents"], ready["topic_count"]) == (1, 3)
    assert (ready["available"], ready["suggested"]) == (True, True)


def test_start_writes_two_questions_per_topic_without_leaking_answers(
    student, fake_groq, db
) -> None:  # type: ignore[no-untyped-def]
    _queue(fake_groq)
    response = student.post("/api/v1/diagnostic")
    assert response.status_code == 201
    quiz = response.json()
    assert quiz["kind"] == "diagnostic" and quiz["difficulty"] == "mixed"
    assert len(quiz["questions"]) == 6
    assert "correct_index" not in response.text and "explanation" not in response.text
    assert len(fake_groq.calls) == 3  # one call per topic
    assert "Focus on the topic: Arrays" in fake_groq.calls[0]["user"]
    assert (
        "one beginner-level question and one intermediate-level question"
        in fake_groq.calls[0]["user"]
    )
    topics = {q.topic_id for q in db.scalars(select(Question))}
    assert len(topics) == 3


def test_an_unfinished_diagnostic_is_returned_not_rewritten(student, fake_groq) -> None:  # type: ignore[no-untyped-def]
    _queue(fake_groq)
    first = student.post("/api/v1/diagnostic").json()
    again = student.post("/api/v1/diagnostic")
    assert again.json()["id"] == first["id"]
    assert len(fake_groq.calls) == 3
    assert student.get("/api/v1/diagnostic/status").json()["pending_quiz_id"] == first["id"]


def _submit(client, db, quiz: dict, right_per_topic: dict[str, int]):  # type: ignore[no-untyped-def]
    answers = []
    seen: dict[str, int] = {}
    for q in quiz["questions"]:
        row = db.get(Question, q["id"])
        name = db.get(Topic, row.topic_id).name
        seen[name] = seen.get(name, 0) + 1
        correct = seen[name] <= right_per_topic[name]
        pick = row.correct_index if correct else (row.correct_index + 1) % 4
        answers.append({"question_id": q["id"], "selected_index": pick})
    return client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", json={"answers": answers})


def test_the_result_seeds_every_topics_level(student, fake_groq, db) -> None:  # type: ignore[no-untyped-def]
    _queue(fake_groq)
    quiz = student.post("/api/v1/diagnostic").json()
    response = _submit(student, db, quiz, {"Arrays": 2, "Recursion": 1, "Sorting": 0})
    assert response.status_code == 201, response.text
    result = response.json()

    levels = {
        db.get(Topic, p.topic_id).name: (p.current_difficulty, p.attempt_count, p.correct_count)
        for p in db.scalars(select(TopicProgress))
    }
    assert levels == {
        "Arrays": ("advanced", 2, 2),
        "Recursion": ("intermediate", 2, 1),
        "Sorting": ("beginner", 2, 0),
    }
    diagnostic = result["diagnostic"]
    assert diagnostic["strengths"] == ["Arrays"]
    assert diagnostic["weak_topics"] == ["Sorting"]
    assert [(t["topic"], t["level"]) for t in diagnostic["topics"]] == [
        ("Arrays", "advanced"),
        ("Recursion", "intermediate"),
        ("Sorting", "beginner"),
    ]
    assert result["kind"] == "diagnostic" and result["next_difficulty"] is None

    # The saved result gives the same summary, and the next quiz on a topic uses its level
    assert student.get(f"/api/v1/quizzes/{quiz['id']}/attempt").json()["diagnostic"] == diagnostic
    status = student.get("/api/v1/diagnostic/status").json()
    assert (status["taken"], status["suggested"], status["available"]) == (True, False, True)
    assert status["latest_quiz_id"] == quiz["id"]


def test_a_quiz_after_the_diagnostic_starts_at_the_seeded_level(student, fake_groq, db) -> None:  # type: ignore[no-untyped-def]
    _queue(fake_groq)
    quiz = student.post("/api/v1/diagnostic").json()
    _submit(student, db, quiz, {"Arrays": 2, "Recursion": 1, "Sorting": 0})
    fake_groq.replies.append({"topic": "x", "questions": [good_question(i) for i in range(1, 4)]})
    practice = student.post(
        "/api/v1/quizzes/generate", json={"topic": "Arrays", "num_questions": 3}
    )
    assert practice.json()["difficulty"] == "advanced"
    assert practice.json()["kind"] == "practice"


def test_retaking_creates_a_new_diagnostic_and_resets_the_levels(student, fake_groq, db) -> None:  # type: ignore[no-untyped-def]
    _queue(fake_groq)
    first = student.post("/api/v1/diagnostic").json()
    _submit(student, db, first, {"Arrays": 2, "Recursion": 2, "Sorting": 2})
    _queue(fake_groq)
    second = student.post("/api/v1/diagnostic").json()
    assert second["id"] != first["id"]
    _submit(student, db, second, {"Arrays": 0, "Recursion": 0, "Sorting": 0})
    assert {p.current_difficulty for p in db.scalars(select(TopicProgress))} == {"beginner"}
    assert db.query(Quiz).filter(Quiz.kind == "diagnostic").count() == 2


def test_no_topics_is_a_clear_422_and_asks_the_model_nothing(client, fake_groq, tmp_path) -> None:  # type: ignore[no-untyped-def]
    register(client)
    _upload(client, _book(tmp_path / "plain.pdf", None))  # no outline, no headings
    response = client.post("/api/v1/diagnostic")
    assert response.status_code == 422 and response.json()["error"]["code"] == "no_topics"
    assert fake_groq.calls == []


def test_model_outage_and_unusable_output_fail_cleanly(student, fake_groq, db) -> None:  # type: ignore[no-untyped-def]
    fake_groq.replies.append(LLMUnavailableError("busy"))
    assert student.post("/api/v1/diagnostic").status_code == 503
    fake_groq.replies.extend([{"topic": "x", "questions": []}] * 9)
    response = student.post("/api/v1/diagnostic")
    assert response.status_code == 502
    assert db.query(Quiz).count() == 0


def test_a_diagnostic_belongs_to_one_student(client_factory, fake_groq, db, tmp_path) -> None:  # type: ignore[no-untyped-def]
    a, b = client_factory(), client_factory()
    register(a, "a@example.com")
    _upload(a, _book(tmp_path / "a.pdf", TOC))
    _queue(fake_groq)
    quiz = a.post("/api/v1/diagnostic").json()
    register(b, "b@example.com")
    answers = {
        "answers": [{"question_id": q["id"], "selected_index": 0} for q in quiz["questions"]]
    }
    assert b.post(f"/api/v1/quizzes/{quiz['id']}/attempts", json=answers).status_code == 404
    assert b.get("/api/v1/diagnostic/status").json()["pending_quiz_id"] is None


def test_the_diagnostic_needs_signing_in(client) -> None:  # type: ignore[no-untyped-def]
    assert client.get("/api/v1/diagnostic/status").status_code == 401
    assert client.post("/api/v1/diagnostic").status_code == 401
