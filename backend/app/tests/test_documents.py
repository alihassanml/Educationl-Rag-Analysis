from sqlalchemy import func, select

from app.models.document import DocumentChunk
from app.tests.helpers import make_pdf, register, upload

RECURSION = (
    "Recursion is a method where a function calls itself to solve smaller instances of a problem. "
    "Every recursive function needs a base case that stops the calls and a recursive case."
)


def test_upload_extracts_chunks_and_marks_ready(auth_client, db) -> None:
    response = upload(
        auth_client, [RECURSION, "Sorting arranges items in order."], title="Algorithms"
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "ready"
    assert body["page_count"] == 2
    assert body["title"] == "Algorithms"
    chunks = db.scalars(select(DocumentChunk).order_by(DocumentChunk.chunk_index)).all()
    assert [c.page_number for c in chunks] == [1, 2]


def test_non_pdf_extension_rejected(auth_client) -> None:
    response = auth_client.post(
        "/api/v1/documents", files={"file": ("notes.txt", b"hello world", "text/plain")}
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_file_type"


def test_fake_pdf_with_pdf_name_rejected_by_signature(auth_client) -> None:
    response = auth_client.post(
        "/api/v1/documents", files={"file": ("evil.pdf", b"MZ not a pdf", "application/pdf")}
    )
    assert response.status_code == 400


def test_oversized_file_rejected_and_not_left_on_disk(auth_client, isolated_upload_dir) -> None:
    big = b"%PDF-1.4\n" + b"0" * (1024 * 1024 + 10)  # limit is 1 MB in tests
    response = auth_client.post(
        "/api/v1/documents", files={"file": ("big.pdf", big, "application/pdf")}
    )
    assert response.status_code == 413
    assert not list(isolated_upload_dir.rglob("*.pdf"))


def test_image_only_pdf_is_marked_failed_with_helpful_message(auth_client) -> None:
    response = upload(auth_client, ["", ""])
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "failed"
    assert "text-based PDF" in body["error_message"]


def test_corrupt_pdf_is_marked_failed(auth_client) -> None:
    response = auth_client.post(
        "/api/v1/documents",
        files={"file": ("broken.pdf", b"%PDF-1.4 this is not really a pdf", "application/pdf")},
    )
    assert response.status_code == 201
    assert response.json()["status"] == "failed"


def test_list_is_paginated_and_newest_first(auth_client, db) -> None:
    from datetime import UTC, datetime, timedelta

    from app.models.document import Document

    for name in ("one", "two", "three"):
        upload(auth_client, [RECURSION], title=name)
    # now() is constant inside the test transaction, so spread the timestamps explicitly
    base = datetime(2026, 1, 1, tzinfo=UTC)
    for offset, title in enumerate(("one", "two", "three")):
        doc = db.scalar(select(Document).where(Document.title == title))
        doc.created_at = base + timedelta(days=offset)
    db.flush()

    page = auth_client.get("/api/v1/documents?limit=2").json()
    assert page["total"] == 3
    assert [d["title"] for d in page["items"]] == ["three", "two"]
    rest = auth_client.get("/api/v1/documents?limit=2&offset=2").json()["items"]
    assert [d["title"] for d in rest] == ["one"]


def test_delete_removes_document_chunks_and_file(auth_client, db, isolated_upload_dir) -> None:
    document = upload(auth_client, [RECURSION]).json()
    assert len(list(isolated_upload_dir.rglob("*.pdf"))) == 1
    assert auth_client.delete(f"/api/v1/documents/{document['id']}").status_code == 204
    assert auth_client.get(f"/api/v1/documents/{document['id']}").status_code == 404
    assert db.scalar(select(func.count()).select_from(DocumentChunk)) == 0
    assert not list(isolated_upload_dir.rglob("*.pdf"))


def test_user_cannot_read_or_delete_another_users_document(client_factory) -> None:
    alice, bob = client_factory(), client_factory()
    register(alice, "alice@example.com")
    register(bob, "bob@example.com")
    document = upload(alice, [RECURSION]).json()

    assert bob.get(f"/api/v1/documents/{document['id']}").status_code == 404
    assert bob.delete(f"/api/v1/documents/{document['id']}").status_code == 404
    assert bob.get("/api/v1/documents").json()["total"] == 0
    assert alice.get(f"/api/v1/documents/{document['id']}").status_code == 200


def test_make_pdf_helper_produces_extractable_text() -> None:
    assert make_pdf([RECURSION]).startswith(b"%PDF-")
