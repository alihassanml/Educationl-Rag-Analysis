from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import get_db
from app.main import app
from app.workers.queue import ArqJobQueue


class _OkSession:
    def execute(self, *_args: object, **_kwargs: object) -> None:
        return None


@pytest.fixture
def client() -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: _OkSession()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_ready_ok(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.routes.health.redis_available", lambda: True)
    response = client.get("/api/v1/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok", "redis": "ok"}


def test_ready_degraded_when_redis_down(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.api.routes.health.redis_available", lambda: False)
    response = client.get("/api/v1/ready")
    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": "ok", "redis": "unavailable"}


def test_real_queue_raises_queue_unavailable_for_dead_redis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(get_settings(), "redis_url", "redis://localhost:1/0")
    with pytest.raises(AppError) as caught:
        ArqJobQueue().enqueue("run_eval_job", "some-run-id")
    assert caught.value.status_code == 503
    assert caught.value.code == "queue_unavailable"
