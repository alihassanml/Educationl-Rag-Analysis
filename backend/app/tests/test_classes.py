import uuid

import pytest

from app.core.errors import NotFoundError
from app.services import retrieval_service, teacher_style_service
from app.tests.conftest import FakeEmbedder, make_pdf, register
from app.tests.test_chat_stream import _send, _thread, parse_sse

SLIDES = (
    "Recursion happens when a function calls itself. Every recursive function needs a base case "
    "that stops the calls, otherwise the stack overflows."
)
QUESTION = "What does a recursive function need to stop the calls?"


@pytest.fixture
def people(client_factory):  # type: ignore[no-untyped-def]
    """A teacher, two students (one will join), and a teacher's shared document."""
    teacher, member, outsider = client_factory(), client_factory(), client_factory()
    teacher_user = register(teacher, "teacher@example.com", role="teacher", display_name="Ms Khan")
    member_user = register(member, "member@example.com", display_name="Mina")
    outsider_user = register(outsider, "outsider@example.com", display_name="Omar")
    return {
        "teacher": teacher,
        "member": member,
        "outsider": outsider,
        "teacher_user": teacher_user,
        "member_user": member_user,
        "outsider_user": outsider_user,
    }


def _upload(client, text: str = SLIDES, title: str = "Week 1 slides"):  # type: ignore[no-untyped-def]
    response = client.post(
        "/api/v1/documents",
        files={"file": (f"{title}.pdf", make_pdf([text]), "application/pdf")},
        data={"title": title},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _class(teacher, name: str = "CS101"):  # type: ignore[no-untyped-def]
    response = teacher.post("/api/v1/classes", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def _shared_class(people):  # type: ignore[no-untyped-def]
    classroom = _class(people["teacher"])
    document = _upload(people["teacher"])
    shared = people["teacher"].post(
        f"/api/v1/classes/{classroom['id']}/documents", json={"document_id": document["id"]}
    )
    assert shared.status_code == 204
    return classroom, document


def _join(client, classroom):  # type: ignore[no-untyped-def]
    return client.post("/api/v1/classes/join", json={"join_code": classroom["join_code"]})


def _retrievable(db, user: dict, document_id: str) -> bool:  # type: ignore[no-untyped-def]
    chunks = retrieval_service.retrieve(db, FakeEmbedder(), uuid.UUID(user["id"]), QUESTION)
    return any(str(c.document_id) == document_id for c in chunks)


# --- creating and joining


def test_a_teacher_creates_a_class_with_a_join_code(people) -> None:  # type: ignore[no-untyped-def]
    classroom = _class(people["teacher"])
    assert len(classroom["join_code"]) == 8 and classroom["join_code"].isalnum()
    assert classroom["teacher_name"] == "Ms Khan"
    assert classroom["member_count"] == 0


def test_a_student_cannot_create_a_class(people) -> None:  # type: ignore[no-untyped-def]
    response = people["member"].post("/api/v1/classes", json={"name": "Mine"})
    assert response.status_code == 403


def test_a_student_joins_with_the_code_and_a_wrong_code_finds_nothing(people) -> None:  # type: ignore[no-untyped-def]
    classroom = _class(people["teacher"])
    assert (
        people["member"].post("/api/v1/classes/join", json={"join_code": "ZZZZZZZZ"}).status_code
        == 404
    )
    joined = _join(people["member"], classroom)
    assert joined.status_code == 200
    body = joined.json()
    assert body["name"] == "CS101" and body["join_code"] is None  # students never get the code back
    assert _join(people["member"], classroom).status_code == 200  # joining twice changes nothing
    assert people["teacher"].get("/api/v1/classes").json()[0]["member_count"] == 1


def test_codes_are_case_insensitive_and_teachers_cannot_join(people) -> None:  # type: ignore[no-untyped-def]
    classroom = _class(people["teacher"])
    lower = {"join_code": classroom["join_code"].lower()}
    assert people["member"].post("/api/v1/classes/join", json=lower).status_code == 200
    assert _join(people["teacher"], classroom).status_code == 403


def test_each_user_lists_only_their_own_classes(people) -> None:  # type: ignore[no-untyped-def]
    classroom = _class(people["teacher"])
    _class(people["teacher"], "Other class")
    _join(people["member"], classroom)
    assert len(people["teacher"].get("/api/v1/classes").json()) == 2
    assert [c["name"] for c in people["member"].get("/api/v1/classes").json()] == ["CS101"]
    assert people["outsider"].get("/api/v1/classes").json() == []


# --- what each side can see of a class


def test_a_teacher_sees_members_by_display_name_only(people) -> None:  # type: ignore[no-untyped-def]
    classroom, _ = _shared_class(people)
    _join(people["member"], classroom)
    detail = people["teacher"].get(f"/api/v1/classes/{classroom['id']}").json()
    assert [m["display_name"] for m in detail["members"]] == ["Mina"]
    assert "member@example.com" not in str(detail)
    assert detail["join_code"] == classroom["join_code"]


def test_a_member_sees_the_documents_but_not_the_other_students(people) -> None:  # type: ignore[no-untyped-def]
    classroom, document = _shared_class(people)
    _join(people["member"], classroom)
    detail = people["member"].get(f"/api/v1/classes/{classroom['id']}").json()
    assert [d["id"] for d in detail["documents"]] == [document["id"]]
    assert detail["members"] == [] and detail["join_code"] is None
    assert detail["member_count"] == 1


def test_a_non_member_gets_404_for_a_class(people) -> None:  # type: ignore[no-untyped-def]
    classroom, _ = _shared_class(people)
    assert people["outsider"].get(f"/api/v1/classes/{classroom['id']}").status_code == 404


def test_another_teacher_cannot_manage_my_class(client_factory, people) -> None:  # type: ignore[no-untyped-def]
    classroom, document = _shared_class(people)
    rival = client_factory()
    register(rival, "rival@example.com", role="teacher", display_name="Mr Rival")
    base = f"/api/v1/classes/{classroom['id']}"
    assert rival.get(base).status_code == 404
    assert rival.delete(base).status_code == 404
    assert rival.delete(f"{base}/documents/{document['id']}").status_code == 404
    own = _upload(rival, title="Rival slides")
    assert rival.post(f"{base}/documents", json={"document_id": own["id"]}).status_code == 404


def test_only_my_own_documents_can_be_shared(people, client_factory) -> None:  # type: ignore[no-untyped-def]
    classroom = _class(people["teacher"])
    private = _upload(people["member"], title="Mina's private notes")
    response = people["teacher"].post(
        f"/api/v1/classes/{classroom['id']}/documents", json={"document_id": private["id"]}
    )
    assert response.status_code == 404


# --- shared documents are readable by members only


def test_a_member_can_open_a_shared_document_and_a_non_member_cannot(people) -> None:  # type: ignore[no-untyped-def]
    classroom, document = _shared_class(people)
    url = f"/api/v1/documents/{document['id']}"
    assert people["member"].get(url).status_code == 404  # not joined yet
    _join(people["member"], classroom)
    assert people["member"].get(url).status_code == 200
    assert people["outsider"].get(url).status_code == 404


def test_shared_documents_are_read_only_for_students(people) -> None:  # type: ignore[no-untyped-def]
    classroom, document = _shared_class(people)
    _join(people["member"], classroom)
    url = f"/api/v1/documents/{document['id']}"
    assert people["member"].patch(url, json={"title": "Mine now"}).status_code == 404
    assert people["member"].delete(url).status_code == 404
    assert people["teacher"].get(url).json()["title"] == "Week 1 slides"
    # and it is not listed among the student's own uploads
    assert people["member"].get("/api/v1/documents").json()["total"] == 0


def test_only_members_retrieve_the_shared_passages(people, db) -> None:  # type: ignore[no-untyped-def]
    classroom, document = _shared_class(people)
    assert not _retrievable(db, people["member_user"], document["id"])  # not joined
    _join(people["member"], classroom)
    assert _retrievable(db, people["member_user"], document["id"])
    assert not _retrievable(db, people["outsider_user"], document["id"])


def test_selecting_a_shared_document_needs_membership(people, db) -> None:  # type: ignore[no-untyped-def]
    classroom, document = _shared_class(people)
    ids = [uuid.UUID(document["id"])]
    outsider = uuid.UUID(people["outsider_user"]["id"])
    with pytest.raises(NotFoundError):
        retrieval_service.check_document_scope(db, outsider, ids)
    _join(people["member"], classroom)
    retrieval_service.check_document_scope(db, uuid.UUID(people["member_user"]["id"]), ids)


def test_leaving_removing_unsharing_or_deleting_the_class_ends_access(people, db) -> None:  # type: ignore[no-untyped-def]
    classroom, document = _shared_class(people)
    base = f"/api/v1/classes/{classroom['id']}"
    member = people["member_user"]

    _join(people["member"], classroom)
    assert people["member"].delete(f"{base}/membership").status_code == 204
    assert not _retrievable(db, member, document["id"])

    _join(people["member"], classroom)
    assert people["teacher"].delete(f"{base}/members/{member['id']}").status_code == 204
    assert not _retrievable(db, member, document["id"])

    _join(people["member"], classroom)
    assert people["teacher"].delete(f"{base}/documents/{document['id']}").status_code == 204
    assert not _retrievable(db, member, document["id"])

    assert (
        people["teacher"]
        .post(f"{base}/documents", json={"document_id": document["id"]})
        .status_code
        == 204
    )
    assert _retrievable(db, member, document["id"])
    assert people["teacher"].delete(base).status_code == 204
    assert not _retrievable(db, member, document["id"])
    assert people["member"].get(base).status_code == 404


def test_a_member_cannot_remove_other_students(people) -> None:  # type: ignore[no-untyped-def]
    classroom, _ = _shared_class(people)
    _join(people["member"], classroom)
    _join(people["outsider"], classroom)
    base = f"/api/v1/classes/{classroom['id']}"
    response = people["member"].delete(f"{base}/members/{people['outsider_user']['id']}")
    assert response.status_code == 403


# --- the tutor answers from shared material and cites it


def test_a_member_gets_a_cited_answer_from_the_shared_document(people, fake_groq) -> None:  # type: ignore[no-untyped-def]
    classroom, document = _shared_class(people)
    _join(people["member"], classroom)
    client = people["member"]
    thread = _thread(client)
    fake_groq.stream_replies.append(["It needs a base case [1]."])
    response = _send(client, thread, QUESTION)
    assert response.status_code == 200
    events = dict(parse_sse(response.text))
    sources = (
        events["sources"]["sources"] if isinstance(events["sources"], dict) else events["sources"]
    )
    assert any(s["document_title"] == "Week 1 slides" for s in sources)
    assert "base case" in fake_groq.stream_calls[0]["user"]


def test_a_non_member_gets_no_passages_and_cannot_pick_the_document(people, fake_groq) -> None:  # type: ignore[no-untyped-def]
    _, document = _shared_class(people)
    client = people["outsider"]
    thread = _thread(client)
    picked = _send(client, thread, QUESTION, document_ids=[document["id"]])
    assert picked.status_code == 404
    assert fake_groq.stream_calls == []


# --- shared material counts as teacher material for Teacher-Clone


def test_shared_documents_count_as_teacher_material_for_members_only(people, db) -> None:  # type: ignore[no-untyped-def]
    classroom, document = _shared_class(people)
    member = uuid.UUID(people["member_user"]["id"])
    outsider = uuid.UUID(people["outsider_user"]["id"])
    assert teacher_style_service.teacher_documents(db, member) == []
    _join(people["member"], classroom)
    assert [str(d.id) for d in teacher_style_service.teacher_documents(db, member)] == [
        document["id"]
    ]
    assert teacher_style_service.teacher_documents(db, outsider) == []
