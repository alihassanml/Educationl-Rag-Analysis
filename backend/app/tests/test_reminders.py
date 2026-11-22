import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.main import app
from app.models.quiz import Question, Topic, TopicProgress
from app.services import reminder_service
from app.services.groq_service import get_groq_service
from app.tests.conftest import FakeGroq, make_pdf, register

NOTES = (
    "Algorithms and complexity: Binary search runs in O(log n) time. "
    "Linear search runs in O(n) time. QuickSort averages O(n log n)."
)


def _correct_picks(db, quiz_id):  # options are shuffled when saved, so read the right ones
    questions = db.scalars(
        select(Question).where(Question.quiz_id == uuid.UUID(quiz_id)).order_by(Question.position)
    ).all()
    return [q.correct_index for q in questions]


def test_spaced_repetition_interval_calculation():
    # Base intervals
    assert reminder_service.calculate_interval_days("needs_revision", 0) == 1
    assert reminder_service.calculate_interval_days("practicing", 0) == 3
    assert reminder_service.calculate_interval_days("doing_well", 0) == 7

    # Doubles with consecutive passes
    assert reminder_service.calculate_interval_days("needs_revision", 1) == 2
    assert reminder_service.calculate_interval_days("needs_revision", 2) == 4
    assert reminder_service.calculate_interval_days("practicing", 1) == 6
    assert reminder_service.calculate_interval_days("doing_well", 1) == 14
    assert reminder_service.calculate_interval_days("doing_well", 2) == 28

    # Capped at max (30 days)
    assert reminder_service.calculate_interval_days("doing_well", 3) == 30


def test_due_topics_listing_and_slip_test_lifecycle(client_factory, db):
    client = client_factory()
    user = register(client, "student@example.com", display_name="Spaced Student")

    # Upload document
    pdf_bytes = make_pdf([NOTES])
    client.post(
        "/api/v1/documents",
        files={"file": ("algo.pdf", pdf_bytes, "application/pdf")},
        data={"title": "Algorithms"},
    )

    topic = Topic(user_id=uuid.UUID(user["id"]), name="Binary Search")
    db.add(topic)
    db.flush()

    # Practiced 2 days ago, needs_revision (interval = 1 day) -> DUE!
    practiced_at = datetime.now(UTC) - timedelta(days=2)
    progress = TopicProgress(
        user_id=uuid.UUID(user["id"]),
        topic_id=topic.id,
        attempt_count=4,
        correct_count=1,
        current_difficulty="beginner",
        consecutive_slip_passes=0,
        last_practiced_at=practiced_at,
    )
    db.add(progress)
    db.commit()

    # 1. Query due topics
    due_res = client.get("/api/v1/reminders/due-topics")
    assert due_res.status_code == 200
    due_topics = due_res.json()
    assert len(due_topics) == 1
    assert due_topics[0]["topic_name"] == "Binary Search"
    assert due_topics[0]["is_due"] is True
    assert due_topics[0]["interval_days"] == 1

    # 2. Generate slip test (3 questions)
    fake_groq = FakeGroq()
    fake_groq.replies.append(
        {
            "questions": [
                {
                    "question": f"Question {i}",
                    "options": ["A", "B", "C", "D"],
                    "correct_index": 0,
                    "explanation": "Because of time complexity.",
                    "source_passages": [1],
                }
                for i in range(1, 4)
            ]
        }
    )
    app.dependency_overrides[get_groq_service] = lambda: fake_groq

    try:
        slip_res = client.post("/api/v1/reminders/slip-tests", json={"topic": "Binary Search"})
        assert slip_res.status_code == 200, slip_res.text
        slip_data = slip_res.json()
        assert slip_data["kind"] == "slip_test"
        assert len(slip_data["questions"]) == 3
        quiz_id = slip_data["id"]

        # 3. Submit passing attempt (score 3/3 >= 2)
        attempt_res = client.post(
            f"/api/v1/quizzes/{quiz_id}/attempts",
            json={
                "answers": [
                    {"question_id": q["id"], "selected_index": pick}
                    for q, pick in zip(
                        slip_data["questions"], _correct_picks(db, quiz_id), strict=True
                    )
                ]
            },
        )
        assert attempt_res.status_code == 201, attempt_res.text

        # Progress should now have consecutive_slip_passes = 1
        db.expire_all()
        updated_prog = db.get(TopicProgress, progress.id)
        assert updated_prog.consecutive_slip_passes == 1
    finally:
        app.dependency_overrides.pop(get_groq_service, None)


def test_notifications_and_daily_reminder_limits(client_factory, db):
    client = client_factory()
    user = register(client, "notif@example.com", display_name="Notification Student")

    topic = Topic(user_id=uuid.UUID(user["id"]), name="QuickSort")
    db.add(topic)
    db.flush()

    # Topic due 3 days ago
    practiced_at = datetime.now(UTC) - timedelta(days=3)
    progress = TopicProgress(
        user_id=uuid.UUID(user["id"]),
        topic_id=topic.id,
        attempt_count=3,
        correct_count=1,
        current_difficulty="beginner",
        consecutive_slip_passes=0,
        last_practiced_at=practiced_at,
    )
    db.add(progress)
    db.commit()

    # Run reminder job (midday UTC, after the default 09:00 reminder hour)
    now = datetime.now(UTC).replace(hour=12, minute=0)
    sent_count = reminder_service.send_due_reminders_job(db, now=now)
    assert sent_count == 1

    # Check notification API
    res = client.get("/api/v1/notifications")
    assert res.status_code == 200
    data = res.json()
    assert data["unread_count"] == 1
    notif_id = data["notifications"][0]["id"]

    # Running job again within 24h should NOT send a duplicate
    sent_count_2 = reminder_service.send_due_reminders_job(db, now=now + timedelta(hours=2))
    assert sent_count_2 == 0

    # Mark as read
    patch_res = client.patch(f"/api/v1/notifications/{notif_id}/read")
    assert patch_res.status_code == 200
    assert patch_res.json()["read_at"] is not None

    # Mark all read
    all_read = client.post("/api/v1/notifications/read-all")
    assert all_read.status_code == 200


def test_reminder_waits_for_the_preferred_hour(client_factory, db):
    client = client_factory()
    user = register(client, "hour@example.com", display_name="Hour Student")
    client.patch("/api/v1/auth/me/preferences", json={"reminder_hour_utc": 15})

    topic = Topic(user_id=uuid.UUID(user["id"]), name="Heaps")
    db.add(topic)
    db.flush()
    db.add(
        TopicProgress(
            user_id=uuid.UUID(user["id"]),
            topic_id=topic.id,
            attempt_count=3,
            correct_count=1,
            current_difficulty="beginner",
            last_practiced_at=datetime.now(UTC) - timedelta(days=3),
        )
    )
    db.commit()

    day = datetime.now(UTC).replace(minute=0)
    assert reminder_service.send_due_reminders_job(db, now=day.replace(hour=14)) == 0
    assert reminder_service.send_due_reminders_job(db, now=day.replace(hour=15)) == 1
    # Still only one a day, however many hourly runs follow
    assert reminder_service.send_due_reminders_job(db, now=day.replace(hour=16)) == 0
