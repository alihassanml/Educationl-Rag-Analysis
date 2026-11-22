from app.tests.helpers import register


def test_register_sets_httponly_cookie_and_returns_user(client) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "A@Example.com", "password": "password123", "display_name": "Sam"},
    )
    assert response.status_code == 201
    assert response.json()["email"] == "a@example.com"
    assert "password" not in response.text
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie


def test_duplicate_email_rejected(client) -> None:
    register(client)
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "student@example.com", "password": "password123", "display_name": "Sam"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "email_taken"


def test_short_password_rejected_with_field_details(client) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "a@b.com", "password": "short", "display_name": "Sam"},
    )
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


def test_register_defaults_to_student_and_returns_display_name(client) -> None:
    body = register(client, display_name="  Sam   Lee ")
    assert body["role"] == "student"
    assert body["display_name"] == "Sam Lee"


def test_teacher_can_register_and_token_carries_the_role(client) -> None:
    import jwt

    from app.core.config import get_settings

    body = register(client, "t@example.com", role="teacher", display_name="Ms Khan")
    assert body["role"] == "teacher"
    token = client.cookies.get(get_settings().cookie_name)
    claims = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
    assert claims["role"] == "teacher"


def test_display_name_is_required_and_cannot_be_an_email(client) -> None:
    missing = client.post(
        "/api/v1/auth/register", json={"email": "a@b.com", "password": "password123"}
    )
    assert missing.status_code == 422
    email_like = client.post(
        "/api/v1/auth/register",
        json={"email": "a@b.com", "password": "password123", "display_name": "a@b.com"},
    )
    assert email_like.status_code == 422


def test_unknown_role_rejected_so_nobody_registers_as_admin(client) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "a@b.com",
            "password": "password123",
            "display_name": "Sam",
            "role": "admin",
        },
    )
    assert response.status_code == 422


def test_require_teacher_blocks_students(client) -> None:
    from app.api.deps import require_teacher
    from app.core.errors import AppError
    from app.models.user import User

    student = User(email="s@x.com", password_hash="x", role="student")
    teacher = User(email="t@x.com", password_hash="x", role="teacher")
    assert require_teacher(teacher) is teacher
    try:
        require_teacher(student)
    except AppError as error:
        assert error.status_code == 403
    else:
        raise AssertionError("a student passed require_teacher")
