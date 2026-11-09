from app.core.config import Settings


def test_cors_origins_parsed_from_comma_separated_string() -> None:
    settings = Settings(
        database_url="postgresql+psycopg://x",
        cors_origins="http://a.com, http://b.com",  # type: ignore[arg-type]
    )
    assert settings.cors_origins == ["http://a.com", "http://b.com"]


def test_default_secret_key_is_refused_in_production() -> None:
    import pytest

    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings(
            database_url="postgresql+psycopg://x",
            app_env="production",
            secret_key="dev-only-change-me",
        )
    Settings(
        database_url="postgresql+psycopg://x", app_env="production", secret_key="a-private-value"
    )
