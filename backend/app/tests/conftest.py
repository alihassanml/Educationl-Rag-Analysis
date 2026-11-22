import getpass
import hashlib
import math
import os
import re
import tempfile
from collections.abc import Callable, Iterator
from typing import Any

import psycopg
import pymupdf
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

_TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL", f"postgresql+psycopg://{getpass.getuser()}@localhost:5432/edurag_test"
)
os.environ["DATABASE_URL"] = _TEST_DB_URL
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp(prefix="edurag-test-uploads-")
os.environ["EXAM_MATCH_MIN_SIMILARITY"] = "0.2"  # same reason as the line below
os.environ["RETRIEVAL_MIN_SIMILARITY"] = "0.2"  # fake bag-of-words vectors score lower than bge
os.environ["MAX_UPLOAD_MB"] = "1"
os.environ["PROCESS_DOCUMENTS_INLINE"] = "true"  # tests index inside the request
# Topic naming by the LLM is opt-in per test, so an upload never uses up queued FakeGroq replies
os.environ["TOPICS_LLM_FALLBACK"] = "false"

import app.models  # noqa: E402,F401
from app.api.deps import get_db  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.main import app  # noqa: E402
from app.services.embedding_service import get_embedder  # noqa: E402
from app.services.groq_service import GroqService, LLMUnavailableError, get_groq_service  # noqa: E402

DIM = 384


class FakeEmbedder:
    """Deterministic bag-of-words vectors: texts that share words are close together."""

    def _embed(self, text_: str) -> list[float]:
        vec = [0.0] * DIM
        for word in re.findall(r"[a-z0-9]+", text_.lower()):
            if len(word) > 3:
                vec[int(hashlib.md5(word.encode()).hexdigest(), 16) % DIM] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(t) for t in texts]

    def embed_query(self, text_: str) -> list[float]:
        return self._embed(text_)


class FakeGroq(GroqService):
    """Returns queued replies; records the prompts it was given."""

    def __init__(self) -> None:
        super().__init__(None, "fake-model")
        self.replies: list[Any] = []
        self.calls: list[dict[str, str]] = []
        # Streaming: each queued item is a list of text pieces. An Exception inside the list is
        # raised at that point; an Exception as the whole item is raised before the first piece.
        self.stream_replies: list[Any] = []
        self.stream_calls: list[dict[str, str]] = []
        self.stream_closed = False
        self.transcribe_replies: list[Any] = []
        self.transcribe_calls: list[dict[str, Any]] = []

    def transcribe_audio(  # type: ignore[override]
        self,
        file_bytes: bytes,
        filename: str = "audio.webm",
        model: str = "whisper-large-v3",
    ) -> str:
        self.transcribe_calls.append(
            {"filename": filename, "size": len(file_bytes), "model": model}
        )
        if not self.transcribe_replies:
            return "Recursion is where a solution depends on smaller instances."
        reply = self.transcribe_replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return str(reply)

    def complete_json(self, system: str, user: str, *, temperature: float, max_tokens: int):  # type: ignore[override]
        self.calls.append({"system": system, "user": user})
        if not self.replies:
            raise AssertionError("FakeGroq has no queued reply")
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply

    def stream_text(self, system: str, user: str, *, temperature: float, max_tokens: int):  # type: ignore[override]
        self.stream_calls.append({"system": system, "user": user})
        if not self.stream_replies:
            raise AssertionError("FakeGroq has no queued stream reply")
        reply = self.stream_replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        self.stream_closed = False
        try:
            for piece in reply:
                if isinstance(piece, Exception):
                    raise piece
                yield piece
        finally:
            self.stream_closed = True


def _ensure_test_database() -> None:
    url = make_url(_TEST_DB_URL)
    admin = url.set(drivername="postgresql", database="postgres").render_as_string(False)
    with psycopg.connect(admin, autocommit=True) as conn:
        exists = conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (url.database,))
        if not exists.fetchone():
            conn.execute(f'CREATE DATABASE "{url.database}"')


@pytest.fixture(scope="session")
def engine():  # type: ignore[no-untyped-def]
    _ensure_test_database()
    engine = create_engine(_TEST_DB_URL)
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(
            text("CREATE UNIQUE INDEX uq_topics_user_lower_name ON topics (user_id, lower(name))")
        )
    yield engine
    engine.dispose()


@pytest.fixture
def db(engine) -> Iterator[Session]:  # type: ignore[no-untyped-def]
    """Each test runs in a transaction that is rolled back, even when code under test commits."""
    connection = engine.connect()
    outer = connection.begin()
    session = Session(connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
    yield session
    session.close()
    outer.rollback()
    connection.close()


@pytest.fixture(autouse=True)
def isolated_upload_dir(tmp_path, monkeypatch):  # type: ignore[no-untyped-def]
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "upload_dir", tmp_path / "uploads")
    return tmp_path / "uploads"


@pytest.fixture
def fake_groq() -> FakeGroq:
    return FakeGroq()


@pytest.fixture
def client_factory(db: Session, fake_groq: FakeGroq) -> Iterator[Callable[[], Any]]:
    from fastapi.testclient import TestClient

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_embedder] = lambda: FakeEmbedder()
    app.dependency_overrides[get_groq_service] = lambda: fake_groq
    yield lambda: TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def client(client_factory: Callable[[], Any]):  # type: ignore[no-untyped-def]
    return client_factory()


def register(
    client: Any,
    email: str = "student@example.com",
    password: str = "password123",
    role: str = "student",
    display_name: str | None = None,
) -> dict:
    body = {
        "email": email,
        "password": password,
        "role": role,
        "display_name": display_name or f"{email.split('@')[0]} user",
    }
    response = client.post("/api/v1/auth/register", json=body)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def auth_client(client):  # type: ignore[no-untyped-def]
    register(client)
    return client


def make_pdf(pages: list[str]) -> bytes:
    doc = pymupdf.open()
    for text_ in pages:
        page = doc.new_page()
        if text_:
            page.insert_textbox(pymupdf.Rect(50, 50, 550, 800), text_, fontsize=11)
    data = doc.tobytes()
    doc.close()
    return data


def upload(client: Any, pages: list[str], name: str = "notes.pdf", title: str | None = None):  # type: ignore[no-untyped-def]
    return client.post(
        "/api/v1/documents",
        files={"file": (name, make_pdf(pages), "application/pdf")},
        data={"title": title} if title else None,
    )


# Re-exported so test modules can import from conftest-free helpers
__all__ = ["FakeEmbedder", "FakeGroq", "LLMUnavailableError", "make_pdf", "register", "upload"]
