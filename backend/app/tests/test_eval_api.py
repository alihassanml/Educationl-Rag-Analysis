import asyncio
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.evaluation.datasets import EvalItemIn, import_dataset
from app.evaluation.service import create_run
from app.main import app
from app.models.evaluation import EvalItem, EvalResult, EvalRun
from app.models.user import User
from app.tests.helpers import FakeEmbedder, register
from app.workers.queue import get_job_queue
from app.workers.tasks import run_eval_job

ITEMS = [
    EvalItemIn(
        question="What is a variable?",
        answerable=True,
        gold_document_title="Notes",
        gold_page=1,
    ),
    EvalItemIn(question="Who painted the Mona Lisa?", answerable=False),
]


class FakeQueue:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.calls: list[tuple[str, tuple[str, ...]]] = []

    def enqueue(self, function: str, *args: str) -> None:
        if self.fail:
            raise AppError(503, "queue_unavailable", "The background service is not running")
        self.calls.append((function, args))


@pytest.fixture
def queue(client) -> FakeQueue:  # type: ignore[no-untyped-def]
    fake = FakeQueue()
    app.dependency_overrides[get_job_queue] = lambda: fake
    return fake


@pytest.fixture
def make_admin_client(client_factory: Callable[[], Any], db: Session):  # type: ignore[no-untyped-def]
    def make(email: str, is_admin: bool = True):  # type: ignore[no-untyped-def]
        client = client_factory()
        registered = register(client, email)
        user = db.get(User, uuid.UUID(registered["id"]))
        user.is_admin = is_admin  # type: ignore[union-attr]
        db.commit()
        return client, user

    return make


def completed_run(db: Session, user: User, dataset_id: uuid.UUID, **config: Any) -> EvalRun:
    run = create_run(db, user.id, dataset_id, config)
    run.status = "completed"
    run.metrics = {"mrr": 0.5}
    db.commit()
    return run


def add_result(
    db: Session, run: EvalRun, item: EvalItem, passed: bool | None, error: str | None = None
) -> None:
    db.add(
        EvalResult(
            run_id=run.id,
            item_id=item.id,
            answered=passed,
            passed=passed,
            retrieved=[],
            error=error,
        )
    )
    db.commit()


def all_endpoints() -> list[tuple[str, str]]:
    some = uuid.uuid4()
    return [
        ("get", "/api/v1/eval/datasets"),
        ("post", "/api/v1/eval/runs"),
        ("get", "/api/v1/eval/runs"),
        ("get", f"/api/v1/eval/runs/{some}"),
        ("get", f"/api/v1/eval/runs/{some}/results"),
        ("get", f"/api/v1/eval/compare?runs={some}&runs={uuid.uuid4()}"),
    ]


@pytest.mark.parametrize(("method", "path"), all_endpoints())
def test_regular_user_is_forbidden_everywhere(  # type: ignore[no-untyped-def]
    make_admin_client, queue, method: str, path: str
) -> None:
    client, _ = make_admin_client("student@example.com", is_admin=False)
    response = getattr(client, method)(path, **({"json": {}} if method == "post" else {}))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


@pytest.mark.parametrize(("method", "path"), all_endpoints())
def test_signed_out_user_gets_401(client, queue, method: str, path: str) -> None:  # type: ignore[no-untyped-def]
    response = getattr(client, method)(path, **({"json": {}} if method == "post" else {}))
    assert response.status_code == 401


def test_list_datasets(make_admin_client, db: Session, queue) -> None:  # type: ignore[no-untyped-def]
    client, admin = make_admin_client("admin@example.com")
    import_dataset(db, admin.id, "Sample course", ITEMS)
    body = client.get("/api/v1/eval/datasets").json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == "Sample course"
    assert body["items"][0]["item_count"] == 2
    assert body["items"][0]["answerable_count"] == 1


def test_start_run_enqueues_and_returns_queued(make_admin_client, db: Session, queue) -> None:  # type: ignore[no-untyped-def]
    client, admin = make_admin_client("admin@example.com")
    dataset = import_dataset(db, admin.id, "Sample course", ITEMS)
    response = client.post(
        "/api/v1/eval/runs",
        json={"dataset_id": str(dataset.id), "retrieval_mode": "hybrid"},
    )
    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "queued"
    assert body["dataset_name"] == "Sample course"
    assert body["config"]["retrieval_mode"] == "hybrid"
    assert body["items_total"] == 2
    assert queue.calls == [("run_eval_job", (body["id"],))]


def test_start_run_rejects_invalid_mode(make_admin_client, db: Session, queue) -> None:  # type: ignore[no-untyped-def]
    client, admin = make_admin_client("admin@example.com")
    dataset = import_dataset(db, admin.id, "Sample course", ITEMS)
    response = client.post(
        "/api/v1/eval/runs", json={"dataset_id": str(dataset.id), "retrieval_mode": "magic"}
    )
    assert response.status_code == 422


def test_start_run_with_queue_down_returns_503_and_marks_run_failed(  # type: ignore[no-untyped-def]
    make_admin_client, db: Session, queue
) -> None:
    queue.fail = True
    client, admin = make_admin_client("admin@example.com")
    dataset = import_dataset(db, admin.id, "Sample course", ITEMS)
    response = client.post("/api/v1/eval/runs", json={"dataset_id": str(dataset.id)})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "queue_unavailable"
    runs = client.get("/api/v1/eval/runs").json()["items"]
    assert [r["status"] for r in runs] == ["failed"]
    assert runs[0]["error_message"] == "The background service is not running"


def test_other_admins_dataset_is_not_found(make_admin_client, db: Session, queue) -> None:  # type: ignore[no-untyped-def]
    _, owner = make_admin_client("owner@example.com")
    other_client, _ = make_admin_client("other@example.com")
    dataset = import_dataset(db, owner.id, "Theirs", ITEMS)
    response = other_client.post("/api/v1/eval/runs", json={"dataset_id": str(dataset.id)})
    assert response.status_code == 404


def test_runs_are_visible_only_to_their_creator(make_admin_client, db: Session, queue) -> None:  # type: ignore[no-untyped-def]
    client, admin = make_admin_client("owner@example.com")
    other_client, _ = make_admin_client("other@example.com")
    dataset = import_dataset(db, admin.id, "Sample course", ITEMS)
    first = completed_run(db, admin, dataset.id)
    second = completed_run(db, admin, dataset.id)

    assert client.get(f"/api/v1/eval/runs/{first.id}").status_code == 200
    assert other_client.get("/api/v1/eval/runs").json() == {"items": [], "total": 0}
    assert other_client.get(f"/api/v1/eval/runs/{first.id}").status_code == 404
    assert other_client.get(f"/api/v1/eval/runs/{first.id}/results").status_code == 404
    compare = other_client.get(f"/api/v1/eval/compare?runs={first.id}&runs={second.id}")
    assert compare.status_code == 404


def test_runs_list_is_newest_first_and_paginated(make_admin_client, db: Session, queue) -> None:  # type: ignore[no-untyped-def]
    client, admin = make_admin_client("admin@example.com")
    dataset = import_dataset(db, admin.id, "Sample course", ITEMS)
    older = completed_run(db, admin, dataset.id)
    newer = completed_run(db, admin, dataset.id)
    # Both rows share one test transaction, so now() is identical; make the order explicit.
    older.created_at = datetime(2026, 1, 1, tzinfo=UTC)
    db.commit()
    body = client.get("/api/v1/eval/runs?limit=1").json()
    assert body["total"] == 2
    assert [r["id"] for r in body["items"]] == [str(newer.id)]
    assert older.id != newer.id


def test_results_outcome_filter(make_admin_client, db: Session, queue) -> None:  # type: ignore[no-untyped-def]
    client, admin = make_admin_client("admin@example.com")
    dataset = import_dataset(db, admin.id, "Sample course", ITEMS)
    extra = EvalItem(dataset_id=dataset.id, position=2, question="Another one?", answerable=False)
    db.add(extra)
    db.commit()
    run = completed_run(db, admin, dataset.id)
    first, second = dataset.items[0], dataset.items[1]
    add_result(db, run, first, passed=True)
    add_result(db, run, second, passed=False)
    add_result(db, run, extra, passed=None, error="Gold passage not found in your library")

    def questions(outcome: str) -> list[str]:
        body = client.get(f"/api/v1/eval/runs/{run.id}/results?outcome={outcome}").json()
        return [r["question"] for r in body["items"]]

    assert questions("all") == ["What is a variable?", "Who painted the Mona Lisa?", "Another one?"]
    assert questions("passed") == ["What is a variable?"]
    assert questions("failed") == ["Who painted the Mona Lisa?", "Another one?"]
    row = client.get(f"/api/v1/eval/runs/{run.id}/results").json()["items"][0]
    assert row["gold_document_title"] == "Notes"
    assert row["gold_page"] == 1


def test_compare_needs_two_to_four_finished_runs(make_admin_client, db: Session, queue) -> None:  # type: ignore[no-untyped-def]
    client, admin = make_admin_client("admin@example.com")
    dataset = import_dataset(db, admin.id, "Sample course", ITEMS)
    done = completed_run(db, admin, dataset.id)
    pending = create_run(db, admin.id, dataset.id, {})

    assert client.get(f"/api/v1/eval/compare?runs={done.id}").status_code == 422
    unfinished = client.get(f"/api/v1/eval/compare?runs={done.id}&runs={pending.id}")
    assert unfinished.status_code == 409
    assert unfinished.json()["error"]["code"] == "run_not_finished"
    missing = client.get(f"/api/v1/eval/compare?runs={done.id}&runs={uuid.uuid4()}")
    assert missing.status_code == 404
    five = "&".join(f"runs={uuid.uuid4()}" for _ in range(5))
    assert client.get(f"/api/v1/eval/compare?{five}").status_code == 422


def test_compare_config_diff_lists_only_differences(make_admin_client, db: Session, queue) -> None:  # type: ignore[no-untyped-def]
    client, admin = make_admin_client("admin@example.com")
    dataset = import_dataset(db, admin.id, "Sample course", ITEMS)
    dense = completed_run(db, admin, dataset.id, retrieval_mode="dense")
    hybrid = completed_run(db, admin, dataset.id, retrieval_mode="hybrid")
    body = client.get(f"/api/v1/eval/compare?runs={dense.id}&runs={hybrid.id}").json()
    assert [r["id"] for r in body["runs"]] == [str(dense.id), str(hybrid.id)]
    assert body["config_diff"] == {"retrieval_mode": ["dense", "hybrid"]}


def test_run_eval_job_executes_the_run(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[uuid.UUID] = []
    monkeypatch.setattr(
        "app.workers.tasks.execute_run", lambda db, embedder, run_id: seen.append(run_id)
    )
    monkeypatch.setattr("app.workers.tasks.get_embedder", lambda: FakeEmbedder())
    run_id = uuid.uuid4()
    asyncio.run(run_eval_job({}, str(run_id)))
    assert seen == [run_id]


def test_run_eval_job_ignores_unknown_and_malformed_ids(  # type: ignore[no-untyped-def]
    monkeypatch: pytest.MonkeyPatch, db: Session
) -> None:
    monkeypatch.setattr("app.workers.tasks.get_embedder", lambda: FakeEmbedder())
    asyncio.run(run_eval_job({}, str(uuid.uuid4())))  # no such run: logged, no exception
    asyncio.run(run_eval_job({}, "not-a-uuid"))
    assert db.scalars(select(EvalRun)).all() == []


def test_worker_loads_the_embedding_model_once_at_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.workers.settings import WorkerSettings

    loaded: list[int] = []
    monkeypatch.setattr("app.workers.settings.get_embedder", lambda: loaded.append(1))
    asyncio.run(WorkerSettings.on_startup({}))
    assert loaded == [1]
