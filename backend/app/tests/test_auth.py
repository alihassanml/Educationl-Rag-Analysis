from app.tests.helpers import register


def test_register_sets_httponly_cookie_and_returns_user(client) -> None:
    response = client.post(
        "/api/v1/auth/register", json={"email": "A@Example.com", "password": "password123"}
    )
    assert response.status_code == 201
    assert response.json()["email"] == "a@example.com"
    assert "password" not in response.text
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie


def test_duplicate_email_rejected(client) -> None:
    register(client)
    response = client.post(
        "/api/v1/auth/register", json={"email": "student@example.com", "password": "password123"}
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "email_taken"


def test_short_password_rejected_with_field_details(client) -> None:
    response = client.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "short"})
    assert response.status_code == 422
    body = response.json()["error"]
    assert body["code"] == "validation_error"
    assert body["details"][0]["field"] == "password"


def test_login_and_me_flow(client_factory) -> None:
    register(client_factory())
    fresh = client_factory()
    assert fresh.get("/api/v1/auth/me").status_code == 401
    ok = fresh.post(
        "/api/v1/auth/login", json={"email": "student@example.com", "password": "password123"}
    )
    assert ok.status_code == 200
    assert fresh.get("/api/v1/auth/me").json()["email"] == "student@example.com"


def test_wrong_password_and_unknown_email_look_identical(client) -> None:
    register(client)
    wrong = client.post(
        "/api/v1/auth/login", json={"email": "student@example.com", "password": "wrongpassword"}
    )
    unknown = client.post(
        "/api/v1/auth/login", json={"email": "nobody@example.com", "password": "wrongpassword"}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_logout_clears_session(auth_client) -> None:
    assert auth_client.post("/api/v1/auth/logout").status_code == 204
    assert auth_client.get("/api/v1/auth/me").status_code == 401


def test_tampered_token_is_rejected(client) -> None:
    client.cookies.set("access_token", "not-a-real-token")
    assert client.get("/api/v1/auth/me").status_code == 401


def test_state_changing_request_from_foreign_origin_is_blocked(auth_client) -> None:
    response = auth_client.post("/api/v1/auth/logout", headers={"Origin": "https://evil.example"})
    assert response.status_code == 403
    assert auth_client.get("/api/v1/auth/me").status_code == 200


def test_protected_routes_require_login(client) -> None:
    assert client.get("/api/v1/documents").status_code == 401
    assert client.post("/api/v1/tutor/ask", json={"question": "What is x?"}).status_code == 401
