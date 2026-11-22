from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    # Background jobs (ARQ worker)
    redis_url: str = "redis://localhost:6379/0"

    # Authentication: JWT in an httpOnly cookie
    secret_key: str = "dev-only-change-me"
    access_token_expire_minutes: int = 60 * 24
    cookie_secure: bool = False
    cookie_name: str = "access_token"

    # Uploads
    upload_dir: Path = Path("uploads")
    max_upload_mb: int = 20

    # Chunking. bge-small accepts at most 512 tokens, so chunks stay below that.
    chunk_size_words: int = 350
    chunk_overlap_words: int = 60

    # Embeddings (separate from the LLM)
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_dimension: int = 384

    # Retrieval
    retrieval_top_k: int = 6
    # Passages sampled across the documents for broad requests such as "quiz me on everything"
    retrieval_coverage_chunks: int = 10
    retrieval_min_similarity: float = 0.6
    retrieval_duplicate_overlap: float = 0.9
    # "hybrid" fuses vector and full-text rankings. Stays "dense" unless the Evaluation Lab shows
    # hybrid is better (docs/evaluation-plan.md).
    retrieval_mode: Literal["dense", "hybrid"] = "dense"

    # Groq (LLM provider, backend only)
    groq_api_key: str = ""
    groq_model: str = ""
    # Optional. Reasoning models (such as the gpt-oss family) accept "low", "medium" or "high".
    groq_reasoning_effort: str = ""
    groq_timeout_seconds: float = 30.0
    groq_max_retries: int = 2

    # Quizzes
    quiz_max_generation_attempts: int = 3

    # Adaptive learning thresholds (percent); see recommendation_service
    mastery_min_attempts: int = 3
    mastery_needs_revision_below: int = 60
    mastery_doing_well_from: int = 80

    @model_validator(mode="after")
    def reject_default_secret_in_production(self) -> "Settings":
        if self.app_env == "production" and self.secret_key == "dev-only-change-me":
            raise ValueError("SECRET_KEY must be set to a private random value in production")
        return self

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str) and not value.startswith("["):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
