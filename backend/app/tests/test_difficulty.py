import pymupdf
import pytest
from sqlalchemy import select

from app.models.quiz import Question, Quiz, Topic, TopicProgress
from app.services.recommendation_service import (
    LevelRule,
    level_reason,
    needs_support,
    next_failed_streak,
    next_level,
)
from app.tests.conftest import register
from app.tests.helpers import upload
from app.tests.test_chat_stream import QUESTION, RECURSION, _send, _thread, parse_sse
from app.tests.test_quizzes import NOTES, _answers, generate, reply

RULE = LevelRule(up_from=80, down_below=50, support_after=2)


# --- the pure rule, including its boundaries


@pytest.mark.parametrize(
    ("current", "correct", "total", "expected"),
    [
        ("beginner", 4, 5, "intermediate"),  # exactly 80% moves up
        ("beginner", 79, 100, "beginner"),  # 79% stays
        ("intermediate", 9, 10, "advanced"),
        ("advanced", 5, 5, "advanced"),  # nothing above advanced
        ("intermediate", 5, 10, "intermediate"),  # exactly 50% stays
        ("intermediate", 49, 100, "beginner"),  # just under 50% moves down
        ("advanced", 2, 5, "intermediate"),
        ("beginner", 0, 5, "beginner"),  # nothing below beginner
        ("intermediate", 3, 5, "intermediate"),  # 60% stays
        ("beginner", 0, 0, "beginner"),  # nothing answered: no change
        ("unknown", 5, 5, "intermediate"),  # an unrecognised level is treated as beginner
    ],
)
def test_next_level(current: str, correct: int, total: int, expected: str) -> None:
    assert next_level(current, correct, total, RULE) == expected


def test_thresholds_come_from_the_rule_not_from_constants() -> None:
    strict = LevelRule(up_from=90, down_below=70, support_after=1)
    assert next_level("beginner", 4, 5, strict) == "beginner"  # 80% is no longer enough
    assert next_level("intermediate", 3, 5, strict) == "beginner"  # 60% is now a fail


def test_two_failed_attempts_in_a_row_at_beginner_need_support() -> None:
    streak = next_failed_streak(0, "beginner", 1, 5, RULE)
    assert streak == 1 and not needs_support(streak, RULE)
    streak = next_failed_streak(streak, "beginner", 2, 5, RULE)
    assert streak == 2 and needs_support(streak, RULE)


def test_the_run_ends_on_a_pass_or_a_fail_at_another_level() -> None:
    assert next_failed_streak(1, "beginner", 3, 5, RULE) == 0  # 60% is not a fail
    assert next_failed_streak(1, "intermediate", 0, 5, RULE) == 0
    assert next_failed_streak(1, "beginner", 5, 10, RULE) == 0  # exactly 50% is not a fail


def test_reason_names_the_score_topic_and_next_level() -> None:
    assert (
        level_reason("Recursion", 9, 10, "intermediate", "advanced")
        == "You scored 9/10, so your next quiz on Recursion will be advanced."
    )
    assert "will be beginner" in level_reason("Recursion", 1, 5, "intermediate", "beginner")
    assert "stays intermediate" in level_reason("Recursion", 3, 5, "intermediate", "intermediate")
    assert "top level" in level_reason("Recursion", 5, 5, "advanced", "advanced")


# --- through the API


def _take(client, db, fake_groq, right: int, total: int = 5, **body) -> tuple[dict, dict]:  # type: ignore[no-untyped-def]
    fake_groq.replies.append(
        reply(count=total, topic="Recursion", start=len(fake_groq.calls) * 20 + 1)
    )
    quiz = generate(client, topic="Recursion", num_questions=total, **body).json()
    questions = db.scalars(
        select(Question).where(Question.quiz_id == quiz["id"]).order_by(Question.position)
    ).all()
    picks = [
        q.correct_index if i < right else (q.correct_index + 1) % 4 for i, q in enumerate(questions)
    ]
    result = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", json=_answers(quiz, picks))
    assert result.status_code == 201, result.text
    return quiz, result.json()


@pytest.fixture
def material(auth_client):  # type: ignore[no-untyped-def]
    return upload(auth_client, [NOTES], title="Programming Notes").json()


def test_the_level_climbs_then_falls_and_the_next_quiz_follows_it(
    auth_client, material, fake_groq, db
) -> None:  # type: ignore[no-untyped-def]
    quiz, result = _take(auth_client, db, fake_groq, right=4)  # first quiz: no history
    assert quiz["difficulty"] == "beginner"
    assert (result["previous_difficulty"], result["next_difficulty"], result["level_change"]) == (
        "beginner",
        "intermediate",
        "up",
    )
    assert result["difficulty_reason"] == (
        "You scored 4/5, so your next quiz on Recursion will be intermediate."
    )

    quiz, result = _take(auth_client, db, fake_groq, right=5)  # no difficulty sent: uses the level
    assert quiz["difficulty"] == "intermediate" and result["next_difficulty"] == "advanced"

    quiz, result = _take(auth_client, db, fake_groq, right=2)
    assert quiz["difficulty"] == "advanced"
    assert (result["next_difficulty"], result["level_change"]) == ("intermediate", "down")

    progress = db.scalar(select(TopicProgress))
    assert progress.current_difficulty == "intermediate"


def test_a_score_of_exactly_80_percent_moves_up_and_exactly_50_stays(
    auth_client, material, fake_groq, db
) -> None:  # type: ignore[no-untyped-def]
    _, up = _take(auth_client, db, fake_groq, right=8, total=10)
    assert up["next_difficulty"] == "intermediate"
    _, same = _take(auth_client, db, fake_groq, right=5, total=10)
    assert (same["previous_difficulty"], same["next_difficulty"]) == (
        "intermediate",
        "intermediate",
    )
    assert same["level_change"] == "same"
    _, down = _take(auth_client, db, fake_groq, right=4, total=10)
    assert down["next_difficulty"] == "beginner"


def test_a_level_chosen_by_hand_is_used_and_moves_from_there(
    auth_client, material, fake_groq, db
) -> None:  # type: ignore[no-untyped-def]
    quiz, result = _take(auth_client, db, fake_groq, right=5, difficulty="intermediate")
    assert quiz["difficulty"] == "intermediate"
    assert result["next_difficulty"] == "advanced"
    # An explicit level beats the stored one on the next quiz as well
    quiz, _ = _take(auth_client, db, fake_groq, right=3, difficulty="beginner")
    assert quiz["difficulty"] == "beginner"


def test_the_stored_result_reports_the_same_level_change(
    auth_client, material, fake_groq, db
) -> None:  # type: ignore[no-untyped-def]
    quiz, result = _take(auth_client, db, fake_groq, right=5)
    again = auth_client.get(f"/api/v1/quizzes/{quiz['id']}/attempt").json()
    for key in ("previous_difficulty", "next_difficulty", "level_change", "difficulty_reason"):
        assert again[key] == result[key]


def test_two_failed_beginner_quizzes_flag_the_topic_for_support(
    auth_client, material, fake_groq, db
) -> None:  # type: ignore[no-untyped-def]
    _take(auth_client, db, fake_groq, right=1)
    assert db.scalar(select(TopicProgress)).needs_support is False
    _take(auth_client, db, fake_groq, right=0)
    progress = db.scalar(select(TopicProgress))
    assert progress.failed_streak == 2 and progress.needs_support is True
    _take(auth_client, db, fake_groq, right=4)  # a pass ends the run
    progress = db.scalar(select(TopicProgress))
    assert progress.failed_streak == 0 and progress.needs_support is False


def test_the_quiz_records_the_level_it_really_used(auth_client, material, fake_groq, db) -> None:  # type: ignore[no-untyped-def]
    _take(auth_client, db, fake_groq, right=5)
    quiz, _ = _take(auth_client, db, fake_groq, right=5)
    assert db.get(Quiz, quiz["id"]).difficulty == "intermediate"
    assert quiz["title"] == "Recursion (intermediate)"
    assert db.scalar(select(Topic).where(Topic.name == "Recursion")) is not None


def test_a_quiz_with_no_topic_history_starts_at_beginner(auth_client, material, fake_groq) -> None:  # type: ignore[no-untyped-def]
    fake_groq.replies.append(reply(count=3))
    assert generate(auth_client, num_questions=3).json()["difficulty"] == "beginner"


# --- simpler explanations for topics that need revision


def _book(path):  # type: ignore[no-untyped-def]
    doc = pymupdf.open()
    for text in ["Course logistics and grading policy. " * 10, RECURSION * 6]:
        doc.new_page().insert_textbox(pymupdf.Rect(50, 50, 550, 800), text, fontsize=11)
    doc.set_toc([[1, "Logistics", 1], [1, "Recursion basics", 2]])
    doc.save(path)
    doc.close()


def _weak_recursion(client, db, tmp_path, correct: int):  # type: ignore[no-untyped-def]
    path = tmp_path / "b.pdf"
    _book(path)
    client.post(
        "/api/v1/documents", files={"file": ("b.pdf", path.read_bytes(), "application/pdf")}
    )
    topic = db.scalar(select(Topic).where(Topic.name == "Recursion basics"))
    db.add(
        TopicProgress(
            user_id=topic.user_id, topic_id=topic.id, attempt_count=10, correct_count=correct
        )
    )
    db.flush()


def test_answers_on_a_weak_topic_are_asked_for_in_simpler_words(
    client, db, fake_groq, tmp_path
) -> None:  # type: ignore[no-untyped-def]
    register(client)
    _weak_recursion(client, db, tmp_path, correct=3)  # 30%: needs revision
    thread = _thread(client)
    fake_groq.stream_replies.append(["A function calls itself [1]."])
    events = parse_sse(_send(client, thread).text)
    assert "finding this topic hard" in fake_groq.stream_calls[0]["user"]
    assert events[-1][1]["simplified"] is True
    saved = client.get(f"/api/v1/tutor/threads/{thread}").json()["messages"][-1]
    assert saved["simplified"] is True


def test_answers_on_a_topic_that_is_fine_are_not_simplified(
    client, db, fake_groq, tmp_path
) -> None:  # type: ignore[no-untyped-def]
    register(client)
    _weak_recursion(client, db, tmp_path, correct=9)
    thread = _thread(client)
    fake_groq.stream_replies.append(["A function calls itself [1]."])
    events = parse_sse(_send(client, thread).text)
    assert "finding this topic hard" not in fake_groq.stream_calls[0]["user"]
    assert events[-1][1]["simplified"] is False
    assert QUESTION in fake_groq.stream_calls[0]["user"]
