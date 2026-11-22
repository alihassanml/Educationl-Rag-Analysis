import pytest

from app.core import rate_limit
from app.core.config import get_settings
from app.tests.helpers import register


class MemoryCounter:
    def __init__(self) -> None:
        self.counts: dict[str, int] = {}

    def hit(self, key: str, window_seconds: int) -> int:
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]


class BrokenCounter:
    def hit(self, key: str, window_seconds: int) -> int:
        raise ConnectionError("redis is down")


@pytest.fixture(autouse=True)
def limits_on(monkeypatch):  # type: ignore[no-untyped-def]
    settings = get_settings()
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    previous = rate_limit._counter
    rate_limit.set_counter(MemoryCounter())
    yield
    rate_limit.set_counter(previous)


def _login(client, password: str = "wrong-password"):  # type: ignore[no-untyped-def]
    return client.post(
        "/api/v1/auth/login", json={"email": "nobody@example.com", "password": password}
    )


def test_login_is_limited_per_ip_then_answers_429(client, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_login", 3)
    assert [_login(client).status_code for _ in range(3)] == [401, 401, 401]
    blocked = _login(client)
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rate_limited"


def test_a_limit_of_zero_turns_it_off(client, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_login", 0)
    assert {_login(client).status_code for _ in range(5)} == {401}


def test_registration_is_limited(client, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_register", 1)
    body = {"password": "password123", "display_name": "Sam"}
    assert (
        client.post("/api/v1/auth/register", json={**body, "email": "a@x.com"}).status_code == 201
    )
    assert (
        client.post("/api/v1/auth/register", json={**body, "email": "b@x.com"}).status_code == 429
    )


def test_model_backed_requests_are_limited_per_user_and_reads_are_free(client, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_llm", 2)
    register(client)
    for _ in range(5):  # GET requests are never counted
        assert client.get("/api/v1/tutor/threads").status_code == 200
    statuses = [client.post("/api/v1/diagnostic", json={}).status_code for _ in range(3)]
    assert statuses[2] == 429 and 429 not in statuses[:2]


def test_unreachable_redis_lets_requests_through(client, monkeypatch) -> None:
    rate_limit.set_counter(BrokenCounter())
    monkeypatch.setattr(get_settings(), "rate_limit_login", 1)
    assert [_login(client).status_code for _ in range(3)] == [401, 401, 401]
