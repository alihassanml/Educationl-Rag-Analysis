import uuid

import pytest
from sqlalchemy import select

from app.models.quiz import PathEvent, Question
from app.services import recommendation_service as rules
from app.services.learning_path_service import Candidate, next_action, order_path
from app.tests.conftest import register
from app.tests.test_quizzes import _answers, generate, reply
from app.tests.test_topics import _book, _upload

TOC = [[1, "Arrays", 1], [1, "Recursion", 3], [1, "Sorting", 5]]


def _c(name: str, status: str, accuracy: int | None, order: int) -> Candidate:
    return Candidate(uuid.uuid5(uuid.NAMESPACE_DNS, name), status, accuracy, order)


def _names(ordered: list[Candidate], cands: list[Candidate], names: list[str]) -> list[str]:
    lookup = {c.topic_id: n for c, n in zip(cands, names, strict=True)}
    return [lookup[c.topic_id] for c in ordered]


# --- the ordering rule


def test_a_path_with_no_results_follows_the_document() -> None:
    cands = [_c(n, rules.INSUFFICIENT_DATA, None, i) for i, n in enumerate("abc")]
    assert _names(order_path(cands), cands, list("abc")) == ["a", "b", "c"]


def test_needs_revision_goes_first_weakest_first_and_doing_well_goes_last() -> None:
    names = ["intro", "arrays", "recursion", "sorting", "graphs", "trees"]
    cands = [
        _c("intro", rules.DOING_WELL, 90, 0),
        _c("arrays", rules.INSUFFICIENT_DATA, None, 1),
        _c("recursion", rules.NEEDS_REVISION, 50, 2),
        _c("sorting", rules.PRACTICING, 70, 3),
        _c("graphs", rules.NEEDS_REVISION, 20, 4),
        _c("trees", rules.DOING_WELL, 85, 5),
    ]
    assert _names(order_path(cands), cands, names) == [
        "graphs",  # weakest
        "recursion",
        "arrays",  # insufficient data and practicing keep their document order
        "sorting",
        "intro",  # doing well, in document order
        "trees",
    ]


def test_equally_weak_topics_keep_document_order() -> None:
    cands = [_c("b", rules.NEEDS_REVISION, 40, 1), _c("a", rules.NEEDS_REVISION, 40, 0)]
    assert _names(order_path(cands), cands, ["b", "a"]) == ["a", "b"]


@pytest.mark.parametrize(
    ("old", "new", "expected"),
    [
        (rules.PRACTICING, rules.NEEDS_REVISION, "Recursion moved up because you scored 2/5."),
        (
            rules.INSUFFICIENT_DATA,
            rules.NEEDS_REVISION,
            "Recursion moved up because you scored 2/5.",
        ),
        (rules.PRACTICING, rules.DOING_WELL, "Recursion moved to review later: you scored 2/5."),
        (
            rules.NEEDS_REVISION,
            rules.PRACTICING,
            "Recursion moved down because you scored 2/5, so it no longer needs revision.",
        ),
        (
            rules.DOING_WELL,
            rules.PRACTICING,
            "Recursion moved back into your path after you scored 2/5.",
        ),
        (rules.INSUFFICIENT_DATA, rules.PRACTICING, None),  # same place on the path
        (rules.NEEDS_REVISION, rules.NEEDS_REVISION, None),
    ],
)
def test_route_change_reasons(old: str, new: str, expected: str | None) -> None:
    assert rules.route_change_reason("Recursion", old, new, 2, 5) == expected


def test_next_action_by_status() -> None:
    assert next_action(rules.INSUFFICIENT_DATA, False, None).kind == "start"
    assert next_action(rules.INSUFFICIENT_DATA, True, "beginner").kind == "practice"
    assert next_action(rules.PRACTICING, True, "intermediate").message.startswith(
        "Take another intermediate quiz"
    )
    assert next_action(rules.NEEDS_REVISION, True, "beginner").kind == "revise"
    assert next_action(rules.DOING_WELL, True, "advanced").kind == "review_later"


# --- through the API


@pytest.fixture
def student(client, tmp_path):  # type: ignore[no-untyped-def]
    register(client)
    _upload(client, _book(tmp_path / "book.pdf", TOC))
    return client


def _quiz(client, db, fake_groq, topic: str, right: int, total: int = 5):  # type: ignore[no-untyped-def]
    fake_groq.replies.append(reply(count=total, topic=topic, start=len(fake_groq.calls) * 20 + 1))
    quiz = generate(client, topic=topic, num_questions=total).json()
    questions = db.scalars(
        select(Question).where(Question.quiz_id == quiz["id"]).order_by(Question.position)
    ).all()
    picks = [
        q.correct_index if i < right else (q.correct_index + 1) % 4 for i, q in enumerate(questions)
    ]
    response = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", json=_answers(quiz, picks))
    assert response.status_code == 201, response.text


def _path(client) -> dict:  # type: ignore[no-untyped-def]
    response = client.get("/api/v1/learning-path")
    assert response.status_code == 200
    return response.json()


def test_a_new_path_follows_the_documents_with_sources_and_a_current_step(student) -> None:  # type: ignore[no-untyped-def]
    path = _path(student)
    assert [s["name"] for s in path["steps"]] == ["Arrays", "Recursion", "Sorting"]
    assert [s["position"] for s in path["steps"]] == [1, 2, 3]
    first = path["steps"][0]
    assert first["is_current"] and path["current_topic_id"] == first["topic_id"]
    assert (first["status"], first["level"], first["accuracy_percent"]) == (
        "insufficient_data",
        None,
        None,
    )
    assert first["next_action"]["kind"] == "start"
    source = path["steps"][1]["sources"][0]
    assert (source["first_page"], source["last_page"]) == (3, 4)
    assert path["events"] == [] and path["latest_event"] is None


def test_a_bad_result_moves_the_topic_up_and_says_why(student, db, fake_groq) -> None:  # type: ignore[no-untyped-def]
    _quiz(student, db, fake_groq, "Recursion", right=2)  # 40%
    path = _path(student)
    assert [s["name"] for s in path["steps"]] == ["Recursion", "Arrays", "Sorting"]
    assert path["steps"][0]["status"] == "needs_revision" and path["steps"][0]["is_current"]
    assert path["steps"][0]["level"] == "beginner"
    assert path["steps"][0]["next_action"]["kind"] == "revise"
    assert path["latest_event"]["reason"] == "Recursion moved up because you scored 2/5."
    assert path["latest_event"]["topic"] == "Recursion"
    assert (path["latest_event"]["old_status"], path["latest_event"]["new_status"]) == (
        "insufficient_data",
        "needs_revision",
    )


def test_recovery_and_mastery_reroute_again(student, db, fake_groq) -> None:  # type: ignore[no-untyped-def]
    _quiz(student, db, fake_groq, "Recursion", right=2)
    _quiz(student, db, fake_groq, "Recursion", right=5)  # 7/10 = 70%: practicing
    _quiz(student, db, fake_groq, "Arrays", right=5)  # 5/5: doing well, goes to the end
    path = _path(student)
    assert [s["name"] for s in path["steps"]] == ["Recursion", "Sorting", "Arrays"]
    assert path["steps"][2]["status"] == "doing_well"
    assert path["steps"][2]["next_action"]["kind"] == "review_later"
    assert path["current_topic_id"] == path["steps"][0]["topic_id"]
    assert [e["reason"] for e in path["events"]] == [
        "Arrays moved to review later: you scored 5/5.",
        "Recursion moved down because you scored 5/5, so it no longer needs revision.",
        "Recursion moved up because you scored 2/5.",
    ]


def test_a_result_that_changes_nothing_on_the_path_records_no_event(student, db, fake_groq) -> None:  # type: ignore[no-untyped-def]
    # 60%: "practicing", which sits in the same place on the path as "not enough data"
    _quiz(student, db, fake_groq, "Sorting", right=3, total=5)
    assert db.query(PathEvent).count() == 0
    assert [s["name"] for s in _path(student)["steps"]] == ["Arrays", "Recursion", "Sorting"]


def test_when_every_topic_is_doing_well_there_is_no_current_step(student, db, fake_groq) -> None:  # type: ignore[no-untyped-def]
    for topic in ("Arrays", "Recursion", "Sorting"):
        _quiz(student, db, fake_groq, topic, right=5)
    path = _path(student)
    assert path["current_topic_id"] is None
    assert not any(s["is_current"] for s in path["steps"])


def test_one_student_never_sees_anothers_path(client_factory, db, fake_groq, tmp_path) -> None:  # type: ignore[no-untyped-def]
    a, b = client_factory(), client_factory()
    register(a, "a@example.com")
    _upload(a, _book(tmp_path / "a.pdf", TOC))
    _quiz(a, db, fake_groq, "Recursion", right=1)
    register(b, "b@example.com")
    other = _path(b)
    assert other["steps"] == [] and other["events"] == []


def test_topics_of_a_deleted_document_leave_the_path(student) -> None:  # type: ignore[no-untyped-def]
    document = student.get("/api/v1/documents").json()["items"][0]
    student.delete(f"/api/v1/documents/{document['id']}")
    assert _path(student)["steps"] == []


def test_the_path_needs_signing_in(client) -> None:  # type: ignore[no-untyped-def]
    assert client.get("/api/v1/learning-path").status_code == 401
