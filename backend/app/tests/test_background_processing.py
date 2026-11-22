import asyncio
import uuid
from contextlib import contextmanager

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.errors import AppError
from app.models.document import STATUS_PROCESSING, Document, DocumentChunk
from app.services import document_service, youtube_service
from app.services.youtube_service import Snippet
from app.tests.conftest import FakeEmbedder, FakeGroq, make_pdf
from app.tests.test_topics import _BODY, _book
from app.workers import tasks


class FakeQueue:
    def __init__(self) -> None:
        self.jobs: list[tuple[str, tuple[str, ...]]] = []

    def enqueue(self, function: str, *args: str) -> None:
        self.jobs.append((function, args))


class DeadQueue:
    def enqueue(self, function: str, *args: str) -> None:
        raise AppError(503, "queue_unavailable", "The background service is not running.")


@pytest.fixture
def queued(monkeypatch):  # type: ignore[no-untyped-def]
    """Uploads are indexed by the worker, not inside the request."""
    monkeypatch.setattr(get_settings(), "process_documents_inline", False)
    queue = FakeQueue()
    monkeypatch.setattr(document_service, "get_job_queue", lambda: queue)
    return queue


def _pdf(client, pages=None):  # type: ignore[no-untyped-def]
    return client.post(
        "/api/v1/documents",
        files={"file": ("n.pdf", make_pdf(pages or [_BODY * 3]), "application/pdf")},
    )


@contextmanager
def _session(db):  # type: ignore[no-untyped-def]
    yield db


def _run_job(db, monkeypatch, document_id: str):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(tasks, "sessionmaker", lambda **kw: lambda: _session(db))
    monkeypatch.setattr(tasks, "get_embedder", lambda: FakeEmbedder())
    monkeypatch.setattr(tasks, "get_groq_service", lambda: FakeGroq())
    asyncio.run(tasks.process_document_job({}, document_id))


def test_an_upload_returns_at_once_as_processing_and_queues_a_job(auth_client, db, queued) -> None:  # type: ignore[no-untyped-def]
    response = _pdf(auth_client)
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "processing"
    assert queued.jobs == [("process_document_job", (body["id"],))]
    assert db.query(DocumentChunk).count() == 0  # nothing indexed inside the request


def test_the_worker_job_indexes_the_document(auth_client, db, queued, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    document_id = _pdf(auth_client).json()["id"]
    _run_job(db, monkeypatch, document_id)
    document = db.get(Document, uuid.UUID(document_id))
    db.refresh(document)
    assert document.status == "ready" and document.page_count == 1
    assert db.query(DocumentChunk).count() > 0
    assert auth_client.get(f"/api/v1/documents/{document_id}").json()["status"] == "ready"


def test_the_job_also_finds_topics(auth_client, db, queued, monkeypatch, tmp_path) -> None:  # type: ignore[no-untyped-def]
    path = _book(tmp_path / "b.pdf", [[1, "Arrays", 1], [1, "Sorting", 4]])
    document_id = auth_client.post(
        "/api/v1/documents", files={"file": ("b.pdf", path.read_bytes(), "application/pdf")}
    ).json()["id"]
    _run_job(db, monkeypatch, document_id)
    from app.models.quiz import Topic

    assert sorted(t.name for t in db.scalars(select(Topic))) == ["Arrays", "Sorting"]


def test_pasted_text_and_lectures_go_through_the_queue_too(
    auth_client, db, queued, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    text = auth_client.post("/api/v1/documents/text", json={"title": "T", "text": _BODY * 3}).json()
    monkeypatch.setattr(
        youtube_service,
        "fetch_transcript",
        lambda vid: [Snippet(i * 5, _BODY[:60]) for i in range(40)],
    )
    monkeypatch.setattr(youtube_service, "video_title", lambda vid: "Lecture")
    lecture = auth_client.post(
        "/api/v1/documents/youtube", json={"url": "https://youtu.be/dQw4w9WgXcQ"}
    ).json()
    assert [text["status"], lecture["status"]] == ["processing", "processing"]
    assert [job[1][0] for job in queued.jobs] == [text["id"], lecture["id"]]
    _run_job(db, monkeypatch, lecture["id"])
    starts = [c.start_seconds for c in db.scalars(select(DocumentChunk))]
    assert starts and all(s is not None for s in starts)  # timestamps survive the worker


def test_a_dead_queue_leaves_nothing_behind(
    auth_client, db, monkeypatch, isolated_upload_dir
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(get_settings(), "process_documents_inline", False)
    monkeypatch.setattr(document_service, "get_job_queue", lambda: DeadQueue())
    response = _pdf(auth_client)
    assert response.status_code == 503 and response.json()["error"]["code"] == "queue_unavailable"
    assert auth_client.get("/api/v1/documents").json()["total"] == 0
    assert not list(isolated_upload_dir.rglob("*.pdf"))


def test_a_file_that_cannot_be_read_fails_with_a_reason(
    auth_client, db, queued, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    document_id = _pdf(auth_client, ["  "]).json()["id"]  # a page with no text
    _run_job(db, monkeypatch, document_id)
    body = auth_client.get(f"/api/v1/documents/{document_id}").json()
    assert body["status"] == "failed" and "No readable text" in body["error_message"]


def test_the_job_ignores_documents_that_are_gone_or_already_handled(
    auth_client, db, queued, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    document_id = _pdf(auth_client).json()["id"]
    auth_client.delete(f"/api/v1/documents/{document_id}")
    _run_job(db, monkeypatch, document_id)  # deleted while it waited: nothing happens
    asyncio.run(tasks.process_document_job({}, "not-a-uuid"))  # malformed id: nothing happens

    other = _pdf(auth_client).json()["id"]
    _run_job(db, monkeypatch, other)
    chunks = db.query(DocumentChunk).count()
    _run_job(db, monkeypatch, other)  # already ready: not indexed twice
    assert db.query(DocumentChunk).count() == chunks


def test_a_crashing_job_marks_the_document_failed(auth_client, db, queued, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    document_id = _pdf(auth_client).json()["id"]

    def boom(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise RuntimeError("worker fell over")

    monkeypatch.setattr(document_service, "process_stored", boom)
    _run_job(db, monkeypatch, document_id)
    body = auth_client.get(f"/api/v1/documents/{document_id}").json()
    assert body["status"] == "failed" and "try uploading" in body["error_message"]
    assert STATUS_PROCESSING != body["status"]


def test_the_worker_registers_the_job() -> None:
    from app.workers.settings import WorkerSettings

    assert tasks.process_document_job in WorkerSettings.functions


def test_inline_mode_still_indexes_inside_the_request(auth_client) -> None:  # type: ignore[no-untyped-def]
    assert get_settings().process_documents_inline is True
    assert _pdf(auth_client).json()["status"] == "ready"
