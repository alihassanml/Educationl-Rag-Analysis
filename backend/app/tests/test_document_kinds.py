from app.tests.conftest import make_pdf, register
from app.tests.test_topics import _BODY


def _upload(client, **form):  # type: ignore[no-untyped-def]
    return client.post(
        "/api/v1/documents",
        files={"file": ("p.pdf", make_pdf([_BODY * 3]), "application/pdf")},
        data=form,
    )


def test_kind_defaults_to_notes(auth_client) -> None:  # type: ignore[no-untyped-def]
    body = _upload(auth_client).json()
    assert (body["kind"], body["exam_year"], body["exam_session"]) == ("notes", None, None)


def test_the_student_picks_the_kind_and_exam_details_on_upload(auth_client) -> None:  # type: ignore[no-untyped-def]
    body = _upload(auth_client, kind="past_paper", exam_year="2025", exam_session="Summer").json()
    assert (body["kind"], body["exam_year"], body["exam_session"]) == ("past_paper", 2025, "Summer")


def test_exam_details_are_dropped_for_other_kinds(auth_client) -> None:  # type: ignore[no-untyped-def]
    body = _upload(auth_client, kind="textbook", exam_year="2025").json()
    assert body["kind"] == "textbook" and body["exam_year"] is None


def test_an_unknown_kind_is_rejected(auth_client) -> None:  # type: ignore[no-untyped-def]
    assert _upload(auth_client, kind="homework").status_code == 422


def test_pasted_text_takes_a_kind(auth_client) -> None:  # type: ignore[no-untyped-def]
    response = auth_client.post(
        "/api/v1/documents/text",
        json={"title": "Slides", "text": _BODY * 3, "kind": "teacher_material"},
    )
    assert response.json()["kind"] == "teacher_material"


def test_kind_can_be_changed_later_and_exam_details_follow(auth_client) -> None:  # type: ignore[no-untyped-def]
    doc = _upload(auth_client).json()
    patched = auth_client.patch(
        f"/api/v1/documents/{doc['id']}",
        json={"kind": "past_paper", "exam_year": 2024, "exam_session": "Winter"},
    ).json()
    assert (patched["kind"], patched["exam_year"], patched["exam_session"]) == (
        "past_paper",
        2024,
        "Winter",
    )
    back = auth_client.patch(f"/api/v1/documents/{doc['id']}", json={"kind": "lecture"}).json()
    assert (back["kind"], back["exam_year"], back["exam_session"]) == ("lecture", None, None)
    renamed = auth_client.patch(f"/api/v1/documents/{doc['id']}", json={"title": "Week 1"}).json()
    assert renamed["title"] == "Week 1" and renamed["kind"] == "lecture"


def test_patch_validates_and_checks_ownership(client_factory) -> None:  # type: ignore[no-untyped-def]
    a, b = client_factory(), client_factory()
    register(a, "a@example.com")
    doc = _upload(a).json()
    assert a.patch(f"/api/v1/documents/{doc['id']}", json={"kind": "nope"}).status_code == 422
    assert a.patch(f"/api/v1/documents/{doc['id']}", json={"exam_year": 1500}).status_code == 422
    register(b, "b@example.com")
    assert b.patch(f"/api/v1/documents/{doc['id']}", json={"kind": "lecture"}).status_code == 404


def test_the_library_can_be_filtered_by_kind(auth_client) -> None:  # type: ignore[no-untyped-def]
    _upload(auth_client, kind="textbook")
    _upload(auth_client, kind="past_paper")
    _upload(auth_client)
    listed = auth_client.get("/api/v1/documents?kind=past_paper").json()
    assert listed["total"] == 1 and listed["items"][0]["kind"] == "past_paper"
    assert auth_client.get("/api/v1/documents").json()["total"] == 3
    assert auth_client.get("/api/v1/documents?kind=bogus").status_code == 422
