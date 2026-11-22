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

    # Index uploads inside the request instead of in the ARQ worker. Off in production, so a large
    # PDF never holds a request open; on in tests and in a small setup with no Redis or worker.
    process_documents_inline: bool = False

    # Uploads
    upload_dir: Path = Path("uploads")
    max_upload_mb: int = 20

    # Chunking. Chunks are cut at headings and stay well below bge-small's 512-token limit; on a
    # labelled set, 180-word chunks found the right page more often than whole pages
    # (27 of 30 questions, against 23)
    chunk_size_words: int = 180
    chunk_overlap_words: int = 30

    # Embeddings (separate from the LLM)
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_dimension: int = 384

    # Retrieval
    retrieval_top_k: int = 6
    # Passages sampled across the documents for broad requests such as "quiz me on everything"
    retrieval_coverage_chunks: int = 10
    retrieval_min_similarity: float = 0.6
    # A passage that shares a real word with the question is kept from this lower similarity. On
    # three labelled sets this found 76 of 78 answers (69 at 0.6 alone), and the model still
    # refused every off-topic question it let through.
    retrieval_keyword_min_similarity: float = 0.5
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

    # Topic extraction (runs when a document becomes ready): the PDF outline, else headings, else
    # the LLM names topics. A source is used only when it gives a count between these two.
    topics_min_per_document: int = 2
    topics_max_per_document: int = 12
    # Passages sampled from a document when the LLM has to name its topics
    topics_llm_sample_chunks: int = 12
    # Turn off to skip the LLM step (outline and headings are still used)
    topics_llm_fallback: bool = True

    # Automatic difficulty (percent of a quiz answered correctly); see recommendation_service
    difficulty_up_from: int = 80  # at or above: the next quiz on the topic is one level harder
    difficulty_down_below: int = 50  # below: one level easier
    # Failed quizzes in a row at beginner level before the topic is marked as needing support
    support_after_failed_attempts: int = 2

    # Exam predictor: topics ranked by how often the student's past papers asked about them
    exam_min_papers: int = 2  # papers needed before anything is predicted
    # A question joins the topic whose passages it is closest to, only above this cosine
    # similarity; below it the question stays "unmatched" instead of being forced into a topic
    exam_match_min_similarity: float = 0.5
    # Weights of the likelihood score (frequency, recency, marks); they are normalised, and the
    # marks weight is dropped when no past paper gives marks
    exam_weight_frequency: float = 0.5
    exam_weight_recency: float = 0.3
    exam_weight_marks: float = 0.2
    exam_high_from: int = 70  # likelihood score for the High label
    exam_medium_from: int = 40  # likelihood score for the Medium label
    exam_evidence_per_topic: int = 8  # past questions shown as evidence under each topic
    exam_paper_batch_chars: int = 14000  # paper text sent to the model per call
    exam_paper_max_batches: int = 6

    # Teacher-Clone Mode: passages of the teacher's material read to learn their style
    teacher_style_sample_chunks: int = 16

    # Mood-aware pacing ("light mode"): any one of these starts a lighter step on the topic
    mood_wrong_streak: int = 3  # wrong answers in a row across the most recent answers
    mood_low_score_percent: int = 40  # a quiz below this percent counts as a low score
    mood_low_score_attempts: int = 2  # low scores in a row
    confidence_quiz_questions: int = 3
    confidence_pass_correct: int = 2  # correct answers that pass the confidence quiz

    # Diagnostic test: at most this many questions in total, 1 or 2 per topic
    diagnostic_max_questions: int = 15

    # Teacher dashboard: a topic's class-wide accuracy is shown only when at least this many
    # students have practised it, so a "class" figure is never just one or two students' scores
    class_min_students_for_aggregates: int = 3

    # Adaptive learning thresholds (percent); see recommendation_service
    mastery_min_attempts: int = 3
    mastery_needs_revision_below: int = 60
    mastery_doing_well_from: int = 80

    # Peer-Match Learning
    peer_challenge_expiry_minutes: int = 15
    peer_challenge_time_limit_seconds: int = 600
    peer_challenge_max_pending: int = 5
    peer_challenge_questions: int = 5

    # Cheating-Proof Viva Bot (oral exam)
    viva_questions_per_session: int = 5
    viva_time_limit_seconds: int = 90
    viva_whisper_model: str = "whisper-large-v3"
    viva_progress_weight: float = 0.5  # Weight of viva score contribution to topic progress

    # Spaced repetition reminders and slip tests
    spaced_interval_needs_revision_days: int = 1
    spaced_interval_practicing_days: int = 3
    spaced_interval_doing_well_days: int = 7
    spaced_interval_max_days: int = 30
    slip_test_questions: int = 3
    slip_test_pass_correct: int = 2

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
