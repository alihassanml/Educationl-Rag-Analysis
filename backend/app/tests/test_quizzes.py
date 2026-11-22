import pytest
from sqlalchemy import func, select

from app.models.quiz import Question, QuizAttempt, TopicProgress
from app.services.groq_service import LLMOutputError, LLMUnavailableError
from app.services.quiz_service import validate_generated
from app.tests.helpers import register, upload

NOTES = (
    "Recursion is a method where a function calls itself to solve smaller problems. "
    "Every recursive function needs a base case that stops the calls and a recursive case that "
    "moves toward it. Without a base case the function would call itself forever and overflow "
    "the call stack. Recursion is often used for trees, factorials and divide and conquer."
)


def good_question(n: int = 1, passages: list[int] | None = None) -> dict:
    return {
        "question": f"Question number {n} about recursion?",
        "options": [f"right {n}", f"wrong a {n}", f"wrong b {n}", f"wrong c {n}"],
        "correct_index": 0,
        "explanation": "Because the notes say so.",
        "source_passages": passages or [1],
    }


def reply(count: int = 5, topic: str = "Recursion", start: int = 1) -> dict:
    return {"topic": topic, "questions": [good_question(start + i) for i in range(count)]}


def generate(client, **body):  # type: ignore[no-untyped-def]
    return client.post("/api/v1/quizzes/generate", json=body)


@pytest.fixture
def material(auth_client):  # type: ignore[no-untyped-def]
    return upload(auth_client, [NOTES], title="Programming Notes").json()


def test_generate_saves_validated_quiz_without_leaking_answers(auth_client, material, fake_groq):
    fake_groq.replies.append(reply())
    response = generate(auth_client, difficulty="beginner", num_questions=5)
    assert response.status_code == 201
    body = response.json()
    assert body["topic"] == "Recursion"
    assert len(body["questions"]) == 5
    assert body["source_documents"] == ["Programming Notes"]
    assert "correct_index" not in response.text and "explanation" not in response.text

    fetched = auth_client.get(f"/api/v1/quizzes/{body['id']}")
    assert "correct_index" not in fetched.text and "explanation" not in fetched.text


def test_correct_answer_survives_option_shuffling(auth_client, material, fake_groq, db):
    fake_groq.replies.append(reply(count=3))
    generate(auth_client, num_questions=3)
    for q in db.scalars(select(Question)):
        assert q.options[q.correct_index].startswith("right")


def test_invalid_questions_are_rejected_and_regenerated(auth_client, material, fake_groq, db):
    bad = [
        {**good_question(1), "correct_index": 7},  # correct option does not exist
        {**good_question(2), "options": ["same", "same", "x", "y"]},  # duplicate options
        {**good_question(3), "options": ["only", "two"]},
        good_question(4, passages=[42]),  # cites a passage that was never supplied
        good_question(5, passages=[]),
    ]
    fake_groq.replies.append({"topic": "Recursion", "questions": bad + [good_question(6)]})
    fake_groq.replies.append({"topic": "x", "questions": [good_question(7), good_question(8)]})
    fake_groq.replies.append({"topic": "x", "questions": [good_question(9), good_question(10)]})
    response = generate(auth_client, num_questions=5)
    assert response.status_code == 201
    assert len(response.json()["questions"]) == 5
    assert len(fake_groq.calls) == 3
    assert db.scalar(select(func.count()).select_from(Question)) == 5


def test_generation_fails_cleanly_when_model_keeps_returning_bad_output(
    auth_client, material, fake_groq, db
):
    fake_groq.replies.extend([LLMOutputError("bad")] * 3)
    response = generate(auth_client, num_questions=5)
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "quiz_generation_failed"
    assert db.scalar(select(func.count()).select_from(Question)) == 0


def test_provider_outage_is_a_friendly_503(auth_client, material, fake_groq):
    fake_groq.replies.append(LLMUnavailableError("busy"))
    assert generate(auth_client).status_code == 503


def test_generate_without_material_is_a_clear_422(auth_client, fake_groq):
    response = generate(auth_client)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "no_material"
    assert fake_groq.calls == []


def test_topic_not_in_material_does_not_call_the_model(auth_client, material, fake_groq):
    response = generate(auth_client, topic="Medieval pottery glazes")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "topic_not_in_material"
    assert fake_groq.calls == []


def test_topic_given_by_user_is_used_and_reused(auth_client, material, fake_groq, db):
    for _ in range(2):
        fake_groq.replies.append(reply(count=3, topic="ignored"))
    first = generate(auth_client, topic="Recursion", num_questions=3).json()
    second = generate(auth_client, topic="recursion", num_questions=3).json()
    assert first["topic"] == second["topic"] == "Recursion"
    from app.models.quiz import Topic

    assert db.scalar(select(func.count()).select_from(Topic)) == 1


def _answers(quiz: dict, picks: list[int]) -> dict:
    return {
        "answers": [
            {"question_id": q["id"], "selected_index": picks[i]}
            for i, q in enumerate(quiz["questions"])
        ]
    }


def _correct_picks(db, quiz_id) -> list[int]:  # type: ignore[no-untyped-def]
    questions = db.scalars(
        select(Question).where(Question.quiz_id == quiz_id).order_by(Question.position)
    ).all()
    return [q.correct_index for q in questions]


def test_attempt_is_scored_stored_once_and_updates_progress(auth_client, material, fake_groq, db):
    fake_groq.replies.append(reply(count=5))
    quiz = generate(auth_client, num_questions=5).json()
    picks = _correct_picks(db, quiz["id"])
    picks[0] = (picks[0] + 1) % 4  # get exactly one wrong

    response = auth_client.post(
        f"/api/v1/quizzes/{quiz['id']}/attempts", json=_answers(quiz, picks)
    )
    assert response.status_code == 201
    result = response.json()
    assert (result["score"], result["total_questions"], result["percent"]) == (4, 5, 80)
    assert result["results"][0]["is_correct"] is False
    assert result["results"][1]["is_correct"] is True
    assert result["results"][0]["explanation"]
    assert result["results"][0]["sources"] == [
        {
            "document_title": "Programming Notes",
            "page_number": 1,
            "section_title": None,
            "start_seconds": None,
            "source_url": None,
        }
    ]
    assert result["topic_status"] == "doing_well"

    progress = db.scalar(select(TopicProgress))
    assert (progress.attempt_count, progress.correct_count) == (5, 4)

    duplicate = auth_client.post(
        f"/api/v1/quizzes/{quiz['id']}/attempts", json=_answers(quiz, picks)
    )
    assert duplicate.status_code == 409
    assert db.scalar(select(func.count()).select_from(QuizAttempt)) == 1
    again = db.scalar(select(TopicProgress))
    assert (again.attempt_count, again.correct_count) == (5, 4)

    stored = auth_client.get(f"/api/v1/quizzes/{quiz['id']}/attempt").json()
    assert stored["score"] == 4
    assert auth_client.get(f"/api/v1/quizzes/{quiz['id']}").json()["attempt"]["score"] == 4


def test_incomplete_or_invalid_answers_are_rejected_without_saving(
    auth_client, material, fake_groq, db
):
    fake_groq.replies.append(reply(count=3))
    quiz = generate(auth_client, num_questions=3).json()
    partial = {"answers": _answers(quiz, [0, 0, 0])["answers"][:2]}
    assert (
        auth_client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", json=partial).status_code == 422
    )
    out_of_range = _answers(quiz, [0, 0, 9])
    assert (
        auth_client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", json=out_of_range).status_code
        == 422
    )
    first = _answers(quiz, [0, 0, 0])["answers"]
    duplicated = {"answers": [first[0], first[0], first[1], first[2]]}
    assert (
        auth_client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", json=duplicated).status_code
        == 422
    )
    assert db.scalar(select(func.count()).select_from(QuizAttempt)) == 0
    assert auth_client.get(f"/api/v1/quizzes/{quiz['id']}/attempt").status_code == 404


def test_quizzes_are_private_to_their_owner(client_factory, fake_groq):
    alice, bob = client_factory(), client_factory()
    register(alice, "alice@example.com")
    register(bob, "bob@example.com")
    upload(alice, [NOTES])
    fake_groq.replies.append(reply(count=3))
    quiz = generate(alice, num_questions=3).json()

    assert bob.get(f"/api/v1/quizzes/{quiz['id']}").status_code == 404
    assert bob.get(f"/api/v1/quizzes/{quiz['id']}/attempt").status_code == 404
    assert (
        bob.post(
            f"/api/v1/quizzes/{quiz['id']}/attempts", json=_answers(quiz, [0, 0, 0])
        ).status_code
        == 404
    )
    assert bob.get("/api/v1/quizzes").json()["total"] == 0
    assert generate(bob).status_code == 422  # Bob has no material, Alice's is invisible to him


def test_cannot_generate_from_another_users_document(client_factory):
    alice, bob = client_factory(), client_factory()
    register(alice, "alice@example.com")
    register(bob, "bob@example.com")
    doc = upload(alice, [NOTES]).json()
    assert generate(bob, document_ids=[doc["id"]]).status_code == 404


def test_list_includes_attempt_state(auth_client, material, fake_groq):
    fake_groq.replies.append(reply(count=3))
    generate(auth_client, num_questions=3)
    body = auth_client.get("/api/v1/quizzes").json()
    assert body["total"] == 1 and body["items"][0]["attempt"] is None


def test_validate_generated_ignores_non_list_input():
    assert validate_generated("nonsense", 3, set()) == ([], 0)


def _pdf_text(data: bytes) -> str:
    import pymupdf

    with pymupdf.open(stream=data, filetype="pdf") as doc:
        return "\n".join(page.get_text() for page in doc)


def test_notes_pdf_has_questions_answers_and_sources(auth_client, material, fake_groq, db):
    fake_groq.replies.append(reply(count=3))
    quiz = generate(auth_client, num_questions=3).json()
    picks = _correct_picks(db, quiz["id"])
    picks[0] = (picks[0] + 1) % 4
    auth_client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", json=_answers(quiz, picks))

    response = auth_client.get(f"/api/v1/quizzes/{quiz['id']}/notes.pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "attachment" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")
    text = _pdf_text(response.content)
    assert "Question number 1 about recursion?" in text
    assert "Because the notes say so." in text
    assert "Programming Notes" in text
    assert "2 of 3" in text


def test_notes_pdf_needs_a_submitted_attempt(auth_client, material, fake_groq):
    fake_groq.replies.append(reply(count=3))
    quiz = generate(auth_client, num_questions=3).json()
    # Answers stay hidden until the quiz is submitted, so the notes are not available either
    assert auth_client.get(f"/api/v1/quizzes/{quiz['id']}/notes.pdf").status_code == 404


def test_notes_pdf_of_another_users_quiz_is_404(client_factory, fake_groq, db):
    alice, bob = client_factory(), client_factory()
    register(alice, "alice@example.com")
    register(bob, "bob@example.com")
    upload(alice, [NOTES])
    fake_groq.replies.append(reply(count=3))
    quiz = generate(alice, num_questions=3).json()
    alice.post(
        f"/api/v1/quizzes/{quiz['id']}/attempts",
        json=_answers(quiz, _correct_picks(db, quiz["id"])),
    )
    assert bob.get(f"/api/v1/quizzes/{quiz['id']}/notes.pdf").status_code == 404


def test_download_file_name_is_readable_by_the_browser(auth_client, material, fake_groq, db):
    fake_groq.replies.append(reply(count=3))
    quiz = generate(auth_client, num_questions=3).json()
    auth_client.post(
        f"/api/v1/quizzes/{quiz['id']}/attempts",
        json=_answers(quiz, _correct_picks(db, quiz["id"])),
    )
    response = auth_client.get(
        f"/api/v1/quizzes/{quiz['id']}/notes.pdf", headers={"Origin": "http://localhost:3000"}
    )
    assert "content-disposition" in response.headers["access-control-expose-headers"].lower()
