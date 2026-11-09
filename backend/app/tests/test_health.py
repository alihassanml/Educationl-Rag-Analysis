from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.db.session import get_db
from app.main import app


class _FakeSession:
    def __init__(self, fail: bool) -> None:
        self.fail = fail

    def execute(self, *_args: object, **_kwargs: object) -> None:
        if self.fail:
            raise OperationalError("SELECT 1", {}, Exception("connection refused"))


def _client(fail: bool) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: _FakeSession(fail)
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def healthy_client() -> Iterator[TestClient]:
    yield from _client(fail=False)


@pytest.fixture
def broken_db_client() -> Iterator[TestClient]:
    yield from _client(fail=True)


def test_health_ok(healthy_client: TestClient) -> None:
    response = healthy_client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_reports_database_outage_without_leaking_details(
    broken_db_client: TestClient,
) -> None:
    response = broken_db_client.get("/api/v1/health")
    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": "unavailable"}
