import uuid

import pytest

from app.models.quiz import Topic, TopicProgress
from app.tests.conftest import register


def _student(client_factory, db, name: str, topics: dict[str, tuple[int, int]]):  # type: ignore[no-untyped-def]
    """A registered student with topic progress: {topic: (correct, attempted)}."""
    client = client_factory()
    user = register(client, f"{name.lower()}@example.com", display_name=name)
    for topic_name, (correct, attempted) in topics.items():
        topic = Topic(user_id=uuid.UUID(user["id"]), name=topic_name)
        db.add(topic)
        db.flush()
        db.add(
            TopicProgress(
                user_id=uuid.UUID(user["id"]),
                topic_id=topic.id,
                attempt_count=attempted,
                correct_count=correct,
            )
        )
    db.commit()
    return client, user


@pytest.fixture
def teacher(client_factory):  # type: ignore[no-untyped-def]
    client = client_factory()
    register(client, "teacher@example.com", role="teacher", display_name="Ms Khan")
    return client


def _class_with(teacher, students):  # type: ignore[no-untyped-def]
    classroom = teacher.post("/api/v1/classes", json={"name": "CS101"}).json()
    for client, _ in students:
        client.post("/api/v1/classes/join", json={"join_code": classroom["join_code"]})
    return classroom


def test_weak_topics_are_aggregated_across_the_class(client_factory, db, teacher) -> None:  # type: ignore[no-untyped-def]
    students = [
        _student(client_factory, db, "Amy", {"Recursion": (2, 10), "Sorting": (9, 10)}),
        _student(client_factory, db, "Ben", {"recursion": (3, 10), "Sorting": (10, 10)}),
        _student(client_factory, db, "Cal", {"Recursion": (1, 10), "Sorting": (8, 10)}),
    ]
    classroom = _class_with(teacher, students)
    body = teacher.get(f"/api/v1/teacher/classes/{classroom['id']}/insights").json()
    by_name = {t["topic"].lower(): t for t in body["topics"]}
    assert by_name["recursion"]["accuracy"] == 20 and by_name["recursion"]["weak"] is True
    assert by_name["recursion"]["students"] == 3
    assert by_name["sorting"]["accuracy"] == 90 and by_name["sorting"]["weak"] is False
    assert [t["topic"].lower() for t in body["topics"]] == ["recursion", "sorting"]  # weakest first
    assert body["topics_hidden"] == 0


def test_a_topic_with_fewer_than_three_students_is_held_back(client_factory, db, teacher) -> None:  # type: ignore[no-untyped-def]
    students = [
        _student(client_factory, db, "Amy", {"Recursion": (2, 10), "Graphs": (1, 5)}),
        _student(client_factory, db, "Ben", {"Recursion": (3, 10)}),
    ]
    classroom = _class_with(teacher, students)
    body = teacher.get(f"/api/v1/teacher/classes/{classroom['id']}/insights").json()
    assert body["topics"] == [] and body["topics_hidden"] == 2 and body["min_students"] == 3
    assert body["student_count"] == 2


def test_the_teacher_sees_each_members_topic_status_by_display_name(
    client_factory, db, teacher
) -> None:  # type: ignore[no-untyped-def]
    students = [_student(client_factory, db, "Amy", {"Recursion": (2, 10)})]
    classroom = _class_with(teacher, students)
    body = teacher.get(f"/api/v1/teacher/classes/{classroom['id']}/insights").json()
    row = body["students"][0]
    assert row["display_name"] == "Amy"
    assert row["topics"] == [
        {
            "topic": "Recursion",
            "status": "needs_revision",
            "level": "beginner",
            "accuracy": 20,
            "attempted": 10,
        }
    ]
    assert "amy@example.com" not in str(body)


def test_students_outside_the_class_never_appear(client_factory, db, teacher) -> None:  # type: ignore[no-untyped-def]
    inside = _student(client_factory, db, "Amy", {"Recursion": (2, 10)})
    _student(client_factory, db, "Zed", {"Secret topic": (0, 10)})
    classroom = _class_with(teacher, [inside])
    text = teacher.get(f"/api/v1/teacher/classes/{classroom['id']}/insights").text
    assert "Zed" not in text and "Secret topic" not in text


def test_a_student_who_left_disappears_from_the_dashboard(client_factory, db, teacher) -> None:  # type: ignore[no-untyped-def]
    amy = _student(client_factory, db, "Amy", {"Recursion": (2, 10)})
    classroom = _class_with(teacher, [amy])
    amy[0].delete(f"/api/v1/classes/{classroom['id']}/membership")
    body = teacher.get(f"/api/v1/teacher/classes/{classroom['id']}/insights").json()
    assert body["students"] == [] and body["student_count"] == 0


def test_only_the_teacher_of_the_class_can_open_it(client_factory, db, teacher) -> None:  # type: ignore[no-untyped-def]
    amy = _student(client_factory, db, "Amy", {})
    classroom = _class_with(teacher, [amy])
    url = f"/api/v1/teacher/classes/{classroom['id']}/insights"
    assert amy[0].get(url).status_code == 403  # a student
    rival = client_factory()
    register(rival, "rival@example.com", role="teacher", display_name="Mr Rival")
    assert rival.get(url).status_code == 404  # another teacher
    assert client_factory().get(url).status_code == 401
    assert teacher.get(f"/api/v1/teacher/classes/{uuid.uuid4()}/insights").status_code == 404


def test_the_threshold_comes_from_config(client_factory, db, teacher, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "class_min_students_for_aggregates", 2)
    students = [
        _student(client_factory, db, "Amy", {"Recursion": (2, 10)}),
        _student(client_factory, db, "Ben", {"Recursion": (3, 10)}),
    ]
    classroom = _class_with(teacher, students)
    body = teacher.get(f"/api/v1/teacher/classes/{classroom['id']}/insights").json()
    assert [t["topic"] for t in body["topics"]] == ["Recursion"]


def test_a_teacher_cannot_open_a_members_private_documents_or_chats(
    client_factory, db, teacher
) -> None:  # type: ignore[no-untyped-def]
    from app.tests.conftest import make_pdf

    amy = _student(client_factory, db, "Amy", {})
    _class_with(teacher, [amy])
    upload = amy[0].post(
        "/api/v1/documents",
        files={
            "file": (
                "diary.pdf",
                make_pdf(["My private diary entry about recursion."]),
                "application/pdf",
            )
        },
    )
    document_id = upload.json()["id"]
    thread_id = amy[0].post("/api/v1/tutor/threads", json={}).json()["id"]

    assert teacher.get(f"/api/v1/documents/{document_id}").status_code == 404
    assert teacher.get(f"/api/v1/tutor/threads/{thread_id}").status_code == 404
    assert teacher.get("/api/v1/documents").json()["total"] == 0
    assert "diary" not in teacher.get("/api/v1/tutor/threads").text
