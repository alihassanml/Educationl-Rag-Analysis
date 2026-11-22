import io

from app.main import app
from app.models.viva import STATUS_IN_PROGRESS
from app.services.groq_service import get_groq_service
from app.tests.conftest import FakeGroq, make_pdf, register

NOTES = (
    "In computer science, recursion is a method of solving a problem where the solution "
    "depends on smaller instances. A recursive function must have at least one base case "
    "to terminate; otherwise infinite recursion leads to stack overflow. "
    "Every recursive call places an activation record on the call stack."
)


def _seed_topic_and_doc(client, title: str = "Recursion Notes"):
    pdf_bytes = make_pdf([NOTES])
    client.post(
        "/api/v1/documents",
        files={"file": (f"{title}.pdf", pdf_bytes, "application/pdf")},
        data={"title": title},
    )


def test_viva_audio_transcription(client_factory):
    client = client_factory()
    register(client, "student@example.com", display_name="Student")

    fake_groq = FakeGroq()
    fake_groq.transcribe_replies = ["Recursion requires a terminating base case."]
    app.dependency_overrides[get_groq_service] = lambda: fake_groq

    try:
        audio_file = io.BytesIO(b"RIFF....WAVEfmt ....data....")
        res = client.post(
            "/api/v1/viva/transcribe",
            files={"file": ("test.webm", audio_file, "audio/webm")},
        )
        assert res.status_code == 200, res.text
        assert res.json()["transcript"] == "Recursion requires a terminating base case."
        assert len(fake_groq.transcribe_calls) == 1
    finally:
        app.dependency_overrides.pop(get_groq_service, None)


def test_viva_session_generation_conceals_future_questions(client_factory):
    client = client_factory()
    register(client, "student2@example.com", display_name="Student Two")
    _seed_topic_and_doc(client)

    fake_groq = FakeGroq()
    fake_groq.replies = [
        {
            "questions": [
                {"question": f"Question {i}", "ideal_answer": f"Ideal {i}", "source_indices": [1]}
                for i in range(1, 6)
            ]
        }
    ]
    app.dependency_overrides[get_groq_service] = lambda: fake_groq

    try:
        res = client.post("/api/v1/viva/sessions", json={"topic": "Recursion"})
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["status"] == STATUS_IN_PROGRESS
        assert data["total_turns"] == 5
        assert data["current_turn_index"] == 0
        assert data["current_turn"]["question_text"] == "Question 1"
        # Anti-cheating rule: future turns (2-5) must not be revealed!
        assert len(data["completed_turns"]) == 0
    finally:
        app.dependency_overrides.pop(get_groq_service, None)


def test_viva_turn_flow_followup_and_rubric_grading(client_factory, db):
    client = client_factory()
    register(client, "student3@example.com", display_name="Student Three")
    _seed_topic_and_doc(client)

    fake_groq = FakeGroq()
    # 1. Viva question generation (5 questions)
    fake_groq.replies.append(
        {
            "questions": [
                {"question": f"Question {i}", "ideal_answer": f"Ideal {i}", "source_indices": [1]}
                for i in range(1, 6)
            ]
        }
    )
    # 2. Turn 0 follow-up generation
    fake_groq.replies.append(
        {"follow_up_question": "Why does missing a base case cause a stack overflow?"}
    )
    # 3. Turn 0 grading
    fake_groq.replies.append(
        {
            "accuracy": 2,
            "completeness": 2,
            "own_words": 2,
            "feedback": "Clear explanation referencing stack activation frames.",
            "ideal_answer": "Each call allocates a frame on the call stack.",
        }
    )

    app.dependency_overrides[get_groq_service] = lambda: fake_groq
    try:
        # Start session
        session_res = client.post("/api/v1/viva/sessions", json={"topic": "Recursion"}).json()
        session_id = session_res["id"]

        # Step 1: Submit initial answer
        ans1 = client.post(
            f"/api/v1/viva/sessions/{session_id}/answer",
            json={
                "turn_index": 0,
                "answer": "A function that calls itself.",
                "is_follow_up": False,
            },
        )
        assert ans1.status_code == 200, ans1.text
        turn1_state = ans1.json()["current_turn"]
        assert turn1_state["is_follow_up_pending"] is True
        assert "stack overflow" in turn1_state["follow_up_question"]

        # Step 2: Tab switch detected during exam
        ts_res = client.post(f"/api/v1/viva/sessions/{session_id}/tab-switch", json={"count": 2})
        assert ts_res.status_code == 200
        assert ts_res.json()["tab_switch_count"] == 2

        # Step 3: Submit follow-up answer
        ans2 = client.post(
            f"/api/v1/viva/sessions/{session_id}/answer",
            json={
                "turn_index": 0,
                "answer": "Because stack frames accumulate indefinitely without returning.",
                "is_follow_up": True,
            },
        )
        assert ans2.status_code == 200, ans2.text
        data = ans2.json()
        assert len(data["completed_turns"]) == 1
        turn_rep = data["completed_turns"][0]
        assert turn_rep["grade_score"] == 6
        assert turn_rep["grade_accuracy"] == 2
        assert len(turn_rep["sources"]) >= 1

        # Turn 1 is now active
        assert data["current_turn_index"] == 1
        assert data["current_turn"]["question_text"] == "Question 2"
    finally:
        app.dependency_overrides.pop(get_groq_service, None)


def test_viva_session_forbidden_for_other_students(client_factory):
    c1, c2 = client_factory(), client_factory()
    register(c1, "owner@example.com")
    register(c2, "intruder@example.com")
    _seed_topic_and_doc(c1)

    fake_groq = FakeGroq()
    fake_groq.replies.append(
        {
            "questions": [
                {"question": f"Question {i}", "ideal_answer": f"Ideal {i}", "source_indices": [1]}
                for i in range(1, 6)
            ]
        }
    )
    app.dependency_overrides[get_groq_service] = lambda: fake_groq
    try:
        sess = c1.post("/api/v1/viva/sessions", json={"topic": "Recursion"}).json()
        session_id = sess["id"]

        # c2 attempts to view session
        res = c2.get(f"/api/v1/viva/sessions/{session_id}")
        assert res.status_code == 403
    finally:
        app.dependency_overrides.pop(get_groq_service, None)
