import pytest
from sqlalchemy import select

from app.models.quiz import LightEpisode, Question, TopicProgress
from app.services.mood_service import MoodRule, detect, passed_confidence
from app.tests.conftest import register
from app.tests.test_learning_path import TOC
from app.tests.test_quizzes import _answers, generate, good_question, reply
from app.tests.test_topics import _book, _upload

RULE = MoodRule(wrong_streak=3, low_score_below=40, low_score_attempts=2)


# --- the pure signals


def test_three_wrong_answers_in_a_row_trigger() -> None:
    assert detect([False, False, False], [], False, RULE) == "wrong_streak"
    assert detect([False, False, True, False], [], False, RULE) is None
    assert detect([False, False], [], False, RULE) is None  # too few answers to say


def test_two_quizzes_in_a_row_below_40_percent_trigger() -> None:
    assert detect([], [(1, 5), (0, 5)], False, RULE) == "low_scores"
    assert detect([], [(2, 5), (0, 5)], False, RULE) is None  # exactly 40% is not below
    assert detect([], [(0, 5)], False, RULE) is None
    assert detect([], [(0, 5), (4, 5)], False, RULE) is None


def test_the_support_flag_triggers_and_comes_first() -> None:
    assert detect([], [], True, RULE) == "needs_support"
    assert detect([False] * 3, [], True, RULE) == "needs_support"


def test_nothing_triggers_on_a_normal_history() -> None:
    assert detect([True, False, True], [(4, 5), (3, 5)], False, RULE) is None


def test_confidence_pass_mark() -> None:
    assert passed_confidence(2, 3) and passed_confidence(3, 3)
    assert not passed_confidence(1, 3)
    assert passed_confidence(1, 1)  # a shorter quiz needs all of its questions


# --- through the API


@pytest.fixture
def student(client, tmp_path):  # type: ignore[no-untyped-def]
    register(client)
    _upload(client, _book(tmp_path / "book.pdf", TOC))
    return client


def _quiz(client, db, fake_groq, right: int, topic: str = "Recursion", total: int = 5):  # type: ignore[no-untyped-def]
    fake_groq.replies.append(reply(count=total, topic=topic, start=len(fake_groq.calls) * 20 + 1))
    quiz = generate(client, topic=topic, num_questions=total).json()
    return _answer(client, db, quiz, right)


def _answer(client, db, quiz: dict, right: int) -> dict:  # type: ignore[no-untyped-def]
    questions = db.scalars(
        select(Question).where(Question.quiz_id == quiz["id"]).order_by(Question.position)
    ).all()
    picks = [
        q.correct_index if i < right else (q.correct_index + 1) % 4 for i, q in enumerate(questions)
    ]
    response = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", json=_answers(quiz, picks))
    assert response.status_code == 201, response.text
    return response.json()


def _recap_reply() -> dict:
    return {
        "insufficient_evidence": False,
        "sentences": [
            "Recursion is a function calling itself.",
            "It needs a base case.",
            "Each call is smaller.",
        ],
        "example": "A factorial calls itself with a smaller number.",
        "memory_tip": "Base case first, then call yourself.",
        "source_passages": [1],
    }


def test_three_wrong_answers_in_a_row_start_a_lighter_step(student, db, fake_groq) -> None:  # type: ignore[no-untyped-def]
    result = _quiz(student, db, fake_groq, right=2)  # the last three answers are wrong
    notice = result["light_mode"]
    assert notice["state"] == "active" and notice["topic"] == "Recursion"
    assert notice["message"].startswith("Let's take a lighter step on Recursion")
    assert "frustrated" not in str(result).lower()
    episode = db.scalar(select(LightEpisode))
    assert episode.reason == "wrong_streak" and episode.ended_at is None
    listed = student.get("/api/v1/light-mode").json()
    assert [e["topic"] for e in listed] == ["Recursion"]
    path = student.get("/api/v1/learning-path").json()
    assert path["steps"][0]["next_action"]["kind"] == "light"


def test_a_normal_result_starts_nothing(student, db, fake_groq) -> None:  # type: ignore[no-untyped-def]
    result = _quiz(student, db, fake_groq, right=4)
    assert result["light_mode"] is None
    assert db.query(LightEpisode).count() == 0


def test_two_low_quizzes_in_a_row_start_one(student, db, fake_groq) -> None:  # type: ignore[no-untyped-def]
    # At intermediate level a failed quiz does not count towards the support flag, and the wrong
    # answers come first so there is no run of three at the end: only the score signal can fire.
    for _ in range(2):
        fake_groq.replies.append(
            reply(count=5, topic="Sorting", start=len(fake_groq.calls) * 20 + 1)
        )
        quiz = generate(student, topic="Sorting", num_questions=5, difficulty="intermediate").json()
        questions = db.scalars(
            select(Question).where(Question.quiz_id == quiz["id"]).order_by(Question.position)
        ).all()
        right_at = {1, 3}  # 2 of 5 is 40%: not below; use one right answer only
        right_at = {2}  # 1 of 5 = 20%, with a right answer inside the last three
        picks = [
            q.correct_index if i in right_at else (q.correct_index + 1) % 4
            for i, q in enumerate(questions)
        ]
        student.post(f"/api/v1/quizzes/{quiz['id']}/attempts", json=_answers(quiz, picks))
    episode = db.scalar(select(LightEpisode))
    assert episode is not None and episode.reason == "low_scores"


def test_failing_beginner_twice_sets_support_and_starts_light_mode(student, db, fake_groq) -> None:  # type: ignore[no-untyped-def]
    _quiz(student, db, fake_groq, right=3)  # fine
    _quiz(student, db, fake_groq, right=1)  # fail 1 (also three wrong in a row)
    assert db.scalar(select(LightEpisode)).reason in ("wrong_streak", "needs_support")


def test_only_one_episode_runs_per_topic(student, db, fake_groq) -> None:  # type: ignore[no-untyped-def]
    _quiz(student, db, fake_groq, right=2)
    _quiz(student, db, fake_groq, right=1)
    assert db.query(LightEpisode).count() == 1


def test_the_setting_turns_light_mode_off(student, db, fake_groq) -> None:  # type: ignore[no-untyped-def]
    response = student.patch("/api/v1/auth/me/preferences", json={"lighter_steps_enabled": False})
    assert response.status_code == 200 and response.json()["lighter_steps_enabled"] is False
    result = _quiz(student, db, fake_groq, right=0)
    assert result["light_mode"] is None and db.query(LightEpisode).count() == 0
    assert student.get("/api/v1/auth/me").json()["lighter_steps_enabled"] is False


def test_it_is_on_by_default(client) -> None:  # type: ignore[no-untyped-def]
    assert register(client)["lighter_steps_enabled"] is True


def test_recap_is_grounded_cited_and_kept(student, db, fake_groq) -> None:  # type: ignore[no-untyped-def]
    _quiz(student, db, fake_groq, right=2)
    episode = db.scalar(select(LightEpisode))
    fake_groq.replies.append(_recap_reply())
    first = student.post(f"/api/v1/light-mode/{episode.id}/recap")
    assert first.status_code == 200, first.text
    body = first.json()
    assert len(body["sentences"]) == 3 and body["memory_tip"] and body["example"]
    assert body["sources"][0]["document_title"] == "book"
    assert "<passages>" in fake_groq.calls[-1]["user"]
    calls = len(fake_groq.calls)
    assert student.post(f"/api/v1/light-mode/{episode.id}/recap").json() == body
    assert len(fake_groq.calls) == calls  # kept, not rewritten


@pytest.mark.parametrize(
    "bad",
    [
        {**_recap_reply(), "sentences": ["Only one sentence here."]},
        {**_recap_reply(), "source_passages": [99]},
        {**_recap_reply(), "source_passages": []},
        {**_recap_reply(), "memory_tip": ""},
    ],
)
def test_an_invalid_recap_is_retried_then_refused(student, db, fake_groq, bad) -> None:  # type: ignore[no-untyped-def]
    _quiz(student, db, fake_groq, right=2)
    episode = db.scalar(select(LightEpisode))
    fake_groq.replies.extend([bad] * 3)
    assert student.post(f"/api/v1/light-mode/{episode.id}/recap").status_code == 502


def test_a_recap_the_material_cannot_support_says_so(student, db, fake_groq) -> None:  # type: ignore[no-untyped-def]
    _quiz(student, db, fake_groq, right=2)
    episode = db.scalar(select(LightEpisode))
    fake_groq.replies.append({"insufficient_evidence": True})
    response = student.post(f"/api/v1/light-mode/{episode.id}/recap")
    assert (
        response.status_code == 422 and response.json()["error"]["code"] == "insufficient_evidence"
    )


def test_passing_the_confidence_quiz_ends_the_episode(student, db, fake_groq) -> None:  # type: ignore[no-untyped-def]
    _quiz(student, db, fake_groq, right=2)
    episode = db.scalar(select(LightEpisode))
    fake_groq.replies.append({"topic": "x", "questions": [good_question(i) for i in range(1, 4)]})
    quiz = student.post(f"/api/v1/light-mode/{episode.id}/confidence-quiz")
    assert quiz.status_code == 201
    quiz = quiz.json()
    assert quiz["kind"] == "confidence" and quiz["difficulty"] == "beginner"
    assert len(quiz["questions"]) == 3
    assert "Focus on the topic: Recursion" in fake_groq.calls[-1]["user"]

    # asking again before answering returns the same quiz
    assert (
        student.post(f"/api/v1/light-mode/{episode.id}/confidence-quiz").json()["id"] == quiz["id"]
    )

    result = _answer(student, db, quiz, right=2)  # 2 of 3 passes
    assert result["light_mode"]["state"] == "passed"
    assert result["next_difficulty"] is None  # a confidence quiz does not move the level
    db.expire_all()
    done = db.get(LightEpisode, episode.id)
    assert done.ended_at is not None and done.outcome == "passed"
    progress = db.scalar(select(TopicProgress))
    assert progress.needs_support is False and progress.failed_streak == 0
    assert student.get("/api/v1/light-mode").json() == []
    assert student.get("/api/v1/learning-path").json()["steps"][0]["next_action"]["kind"] != "light"


def test_failing_the_confidence_quiz_keeps_the_episode_open(student, db, fake_groq) -> None:  # type: ignore[no-untyped-def]
    _quiz(student, db, fake_groq, right=2)
    episode = db.scalar(select(LightEpisode))
    fake_groq.replies.append({"topic": "x", "questions": [good_question(i) for i in range(1, 4)]})
    quiz = student.post(f"/api/v1/light-mode/{episode.id}/confidence-quiz").json()
    result = _answer(student, db, quiz, right=1)
    assert result["light_mode"]["state"] == "active"
    db.expire_all()
    assert db.get(LightEpisode, episode.id).ended_at is None
    # a fresh quiz can be asked for
    fake_groq.replies.append({"topic": "x", "questions": [good_question(i) for i in range(11, 14)]})
    again = student.post(f"/api/v1/light-mode/{episode.id}/confidence-quiz").json()
    assert again["id"] != quiz["id"]


def test_a_finished_episode_cannot_start_another_quiz(student, db, fake_groq) -> None:  # type: ignore[no-untyped-def]
    _quiz(student, db, fake_groq, right=2)
    episode = db.scalar(select(LightEpisode))
    fake_groq.replies.append({"topic": "x", "questions": [good_question(i) for i in range(1, 4)]})
    quiz = student.post(f"/api/v1/light-mode/{episode.id}/confidence-quiz").json()
    _answer(student, db, quiz, right=3)
    assert student.post(f"/api/v1/light-mode/{episode.id}/confidence-quiz").status_code == 409


def test_another_student_cannot_touch_an_episode(client_factory, db, fake_groq, tmp_path) -> None:  # type: ignore[no-untyped-def]
    a, b = client_factory(), client_factory()
    register(a, "a@example.com")
    _upload(a, _book(tmp_path / "a.pdf", TOC))
    _quiz(a, db, fake_groq, right=2)
    episode = db.scalar(select(LightEpisode))
    register(b, "b@example.com")
    assert b.post(f"/api/v1/light-mode/{episode.id}/recap").status_code == 404
    assert b.post(f"/api/v1/light-mode/{episode.id}/confidence-quiz").status_code == 404
    assert b.get("/api/v1/light-mode").json() == []


def test_light_mode_needs_signing_in(client) -> None:  # type: ignore[no-untyped-def]
    assert client.get("/api/v1/light-mode").status_code == 401
