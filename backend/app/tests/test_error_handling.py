from fastapi.testclient import TestClient

from app.main import app
from app.services import auth_service


def test_unexpected_errors_return_a_generic_message_without_internals(client, monkeypatch) -> None:
    def boom(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("password=hunter2 host=db.internal Traceback")

    monkeypatch.setattr(auth_service, "register", boom)
    safe_client = TestClient(app, raise_server_exceptions=False)
    response = safe_client.post(
        "/api/v1/auth/register", json={"email": "a@example.com", "password": "password123"}
    )
    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "internal_error", "message": "Something went wrong. Please try again."}
    }
    assert "hunter2" not in response.text and "Traceback" not in response.text


def test_unknown_route_uses_the_standard_error_shape(client) -> None:
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "http_error"


def test_malformed_uuid_is_a_validation_error_not_a_crash(auth_client) -> None:
    response = auth_client.get("/api/v1/documents/not-a-uuid")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
