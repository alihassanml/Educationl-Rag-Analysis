from app.models.classroom import ClassMember, Classroom
from app.models.peer_match import STATUS_ACCEPTED, STATUS_COMPLETED, STATUS_PENDING
from app.models.quiz import Topic, TopicProgress
from app.tests.conftest import FakeGroq, make_pdf, register

SLIDES = (
    "Recursion is a programming technique where a function calls itself. "
    "A base case is required to stop recursion, preventing infinite loops."
)


def _seed_weak_topic(db, user_id, topic_name: str = "Recursion"):
    topic = Topic(user_id=user_id, name=topic_name)
    db.add(topic)
    db.flush()
    # 1 correct out of 5 attempts = 20% (needs_revision)
    progress = TopicProgress(
        user_id=user_id,
        topic_id=topic.id,
        attempt_count=5,
        correct_count=1,
        current_difficulty="beginner",
    )
    db.add(progress)
    db.commit()
    return topic


def test_peer_match_only_shows_opted_in_students_with_matching_weak_topics(
    client_factory, db_session
):
    c1, c2, c3 = client_factory(), client_factory(), client_factory()
    u1 = register(c1, "alice@example.com", display_name="Alice")
    u2 = register(c2, "bob@example.com", display_name="Bob")
    u3 = register(c3, "charlie@example.com", display_name="Charlie")

    _seed_weak_topic(db_session, u1.id, "Recursion")
    _seed_weak_topic(db_session, u2.id, "Recursion")
    _seed_weak_topic(db_session, u3.id, "Recursion")

    # None opted in yet
    res = c1.get("/api/v1/peer-match/matches")
    assert res.status_code == 200
    assert len(res.json()) == 0

    # Alice and Bob opt in; Charlie does not
    c1.patch("/api/v1/auth/me/preferences", json={"peer_match_opt_in": True})
    c2.patch("/api/v1/auth/me/preferences", json={"peer_match_opt_in": True})

    res = c1.get("/api/v1/peer-match/matches")
    assert res.status_code == 200
    matches = res.json()
    assert len(matches) == 1
    assert matches[0]["display_name"] == "Bob"
    assert matches[0]["topic_name"] == "Recursion"
    # Never exposes email or private data
    assert "email" not in matches[0]


def test_peer_match_prefers_students_in_the_same_class(client_factory, db_session):
    c1, c2, c3 = client_factory(), client_factory(), client_factory()
    u1 = register(c1, "u1@example.com", display_name="Student 1")
    u2 = register(c2, "u2@example.com", display_name="Classmate")
    u3 = register(c3, "u3@example.com", display_name="Other Student")

    c1.patch("/api/v1/auth/me/preferences", json={"peer_match_opt_in": True})
    c2.patch("/api/v1/auth/me/preferences", json={"peer_match_opt_in": True})
    c3.patch("/api/v1/auth/me/preferences", json={"peer_match_opt_in": True})

    _seed_weak_topic(db_session, u1.id, "Recursion")
    _seed_weak_topic(db_session, u2.id, "Recursion")
    _seed_weak_topic(db_session, u3.id, "Recursion")

    # Add u1 and u2 to the same class
    cls = Classroom(teacher_id=u1.id, name="Algorithms", join_code="ALGO1234")
    db_session.add(cls)
    db_session.flush()
    db_session.add(ClassMember(class_id=cls.id, student_id=u1.id))
    db_session.add(ClassMember(class_id=cls.id, student_id=u2.id))
    db_session.commit()

    res = c1.get("/api/v1/peer-match/matches")
    assert res.status_code == 200
    matches = res.json()
    assert len(matches) == 2
    # Same class student is listed first
    assert matches[0]["display_name"] == "Classmate"
    assert matches[0]["in_same_class"] is True
    assert matches[1]["display_name"] == "Other Student"
    assert matches[1]["in_same_class"] is False


def test_peer_challenge_duel_flow_and_scoring(client_factory, db_session):
    c1, c2 = client_factory(), client_factory()
    u1 = register(c1, "p1@example.com", display_name="Player One")
    u2 = register(c2, "p2@example.com", display_name="Player Two")

    c1.patch("/api/v1/auth/me/preferences", json={"peer_match_opt_in": True})
    c2.patch("/api/v1/auth/me/preferences", json={"peer_match_opt_in": True})

    # Upload material for both players
    pdf_bytes = make_pdf([SLIDES])
    c1.post(
        "/api/v1/documents",
        files={"file": ("slides.pdf", pdf_bytes, "application/pdf")},
        data={"title": "Slides"},
    )
    c2.post(
        "/api/v1/documents",
        files={"file": ("slides.pdf", pdf_bytes, "application/pdf")},
        data={"title": "Slides"},
    )

    _seed_weak_topic(db_session, u1.id, "Recursion")
    _seed_weak_topic(db_session, u2.id, "Recursion")

    # 1. Player One challenges Player Two
    res = c1.post(
        "/api/v1/peer-match/challenges",
        json={"opponent_id": str(u2.id), "topic_name": "Recursion", "difficulty": "intermediate"},
    )
    assert res.status_code == 200, res.text
    challenge = res.json()
    assert challenge["status"] == STATUS_PENDING
    assert challenge["my_role"] == "challenger"
    challenge_id = challenge["id"]

    # Notification delivered to opponent
    notifs = c2.get("/api/v1/notifications").json()
    assert notifs["unread_count"] >= 1
    assert "challenged you to a duel" in notifs["notifications"][0]["body"]

    # 2. Player Two accepts challenge
    # Mock LLM generation for both quiz generations
    fake_groq = FakeGroq()
    q_resp = {
        "questions": [
            {
                "question": "What is recursion?",
                "options": [
                    "A function calling itself",
                    "A loop",
                    "A data structure",
                    "A compiler",
                ],
                "correct_index": 0,
                "explanation": "Recursion calls itself.",
                "source_passages": [1],
            }
        ]
    }
    fake_groq.replies = [q_resp, q_resp]  # For challenger quiz, then opponent quiz

    from app.main import app
    from app.services.groq_service import get_groq_service

    app.dependency_overrides[get_groq_service] = lambda: fake_groq
    try:
        accept_res = c2.post(f"/api/v1/peer-match/challenges/{challenge_id}/accept")
        assert accept_res.status_code == 200, accept_res.text
        accepted_data = accept_res.json()
        assert accepted_data["status"] == STATUS_ACCEPTED
        assert accepted_data["my_quiz_id"] is not None

        # 3. Challenger submits quiz attempt (score 1/1, took 45s)
        sub1 = c1.post(
            f"/api/v1/peer-match/challenges/{challenge_id}/submit",
            json={"answers": [0], "time_seconds": 45},
        )
        assert sub1.status_code == 200
        assert sub1.json()["my_completed"] is True
        assert sub1.json()["opponent_completed"] is False
        assert sub1.json()["status"] == STATUS_ACCEPTED

        # 4. Opponent submits quiz attempt (score 1/1, took 60s)
        sub2 = c2.post(
            f"/api/v1/peer-match/challenges/{challenge_id}/submit",
            json={"answers": [0], "time_seconds": 60},
        )
        assert sub2.status_code == 200
        data2 = sub2.json()
        assert data2["status"] == STATUS_COMPLETED
        # Score tied: Player One had faster time (45s < 60s) -> Player One wins!
        assert data2["winner_id"] == str(u1.id)
        assert data2["winner_name"] == "Player One"
    finally:
        app.dependency_overrides.pop(get_groq_service, None)


def test_blocking_prevents_matching_and_challenging(client_factory, db_session):
    c1, c2 = client_factory(), client_factory()
    u1 = register(c1, "b1@example.com", display_name="User B1")
    u2 = register(c2, "b2@example.com", display_name="User B2")

    c1.patch("/api/v1/auth/me/preferences", json={"peer_match_opt_in": True})
    c2.patch("/api/v1/auth/me/preferences", json={"peer_match_opt_in": True})

    _seed_weak_topic(db_session, u1.id, "Recursion")
    _seed_weak_topic(db_session, u2.id, "Recursion")

    # Block u2
    block_res = c1.post("/api/v1/peer-match/block", json={"blocked_user_id": str(u2.id)})
    assert block_res.status_code == 200

    # User B2 should no longer appear in matches
    matches = c1.get("/api/v1/peer-match/matches").json()
    assert len(matches) == 0

    # Trying to challenge blocked user fails
    chal = c1.post(
        "/api/v1/peer-match/challenges",
        json={"opponent_id": str(u2.id), "topic_name": "Recursion"},
    )
    assert chal.status_code == 400
