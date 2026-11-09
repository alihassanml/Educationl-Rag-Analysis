import uuid
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.user import User
from app.services.retrieval_service import reciprocal_rank_fusion, retrieve
from app.tests.helpers import FakeEmbedder, add_document, make_user

A, B, C = (uuid.uuid4() for _ in range(3))

# Stop words only: strong overlap for the fake bag-of-words embedder, invisible to full-text search.
DENSE_WINNER = "with that this have with that this have"  # chunks need at least 5 words
# Shares one rare keyword with the query: weak for dense, the only full-text match.
KEYWORD_MATCH = "zyxophore quartz mineral sample zyxophore"
QUERY = "with that this have zyxophore"


def search(db: Session, user: User, query: str, mode: str, **kwargs):  # type: ignore[no-untyped-def]
    return retrieve(db, FakeEmbedder(), user.id, query, mode=mode, **kwargs)


def titles(chunks) -> list[str]:  # type: ignore[no-untyped-def]
    return [c.document_title for c in chunks]


@pytest.fixture
def library(db: Session, tmp_path: Path) -> User:
    user = make_user(db, "student@example.com", is_admin=False)
    add_document(db, user, "Dense", [DENSE_WINNER], tmp_path)
    add_document(db, user, "Keyword", [KEYWORD_MATCH], tmp_path)
    return user


def test_rrf_scores_and_tie_order() -> None:
    fused = reciprocal_rank_fusion([[A, B], [B, A]])
    assert [item for item, _ in fused] == [A, B]  # tie: first appearance wins
    assert fused[0][1] == pytest.approx(1 / 61 + 1 / 62)
    assert fused[1][1] == pytest.approx(1 / 61 + 1 / 62)


def test_rrf_rewards_items_found_by_both_lists() -> None:
    fused = reciprocal_rank_fusion([[A, B, C], [C]])
    assert [item for item, _ in fused] == [C, A, B]
    assert dict(fused)[C] == pytest.approx(1 / 63 + 1 / 61)


def test_rrf_empty_inputs() -> None:
    assert reciprocal_rank_fusion([]) == []
    assert reciprocal_rank_fusion([[]]) == []


def test_default_mode_is_dense() -> None:
    assert get_settings().retrieval_mode == "dense"


def test_dense_mode_orders_by_similarity_only(db: Session, library: User) -> None:
    chunks = search(db, library, QUERY, "dense")
    assert titles(chunks) == ["Dense", "Keyword"]
    assert all(c.rrf_score is None for c in chunks)


def test_hybrid_lets_a_keyword_match_outrank_a_stop_word_overlap(
    db: Session, library: User
) -> None:
    chunks = search(db, library, QUERY, "hybrid")
    assert titles(chunks) == ["Keyword", "Dense"]
    assert all(c.rrf_score is not None for c in chunks)
    assert chunks[0].rrf_score > chunks[1].rrf_score  # type: ignore[operator]


def test_mode_none_uses_the_configured_default(
    db: Session, library: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "retrieval_mode", "hybrid")
    chunks = retrieve(db, FakeEmbedder(), library.id, QUERY)
    assert titles(chunks) == ["Keyword", "Dense"]


def test_hybrid_never_returns_other_users_chunks(
    db: Session, library: User, tmp_path: Path
) -> None:
    other = make_user(db, "other@example.com", is_admin=False)
    add_document(db, other, "Their notes", ["zyxophore quartz secret notes zyxophore"], tmp_path)
    chunks = search(db, library, QUERY, "hybrid")
    assert "Their notes" not in titles(chunks)


def test_hybrid_respects_document_scope(db: Session, library: User, tmp_path: Path) -> None:
    keyword_two = add_document(db, library, "Keyword two", [KEYWORD_MATCH], tmp_path)
    chunks = search(db, library, QUERY, "hybrid", document_ids=[keyword_two.id])
    assert titles(chunks) == ["Keyword two"]


def test_hybrid_keeps_the_similarity_gate(db: Session, library: User, tmp_path: Path) -> None:
    filler = " ".join(f"filler{i}word" for i in range(30))
    add_document(db, library, "Long", [f"zyxophore {filler}"], tmp_path)
    # "Long" matches the keyword but is far from the query in embedding space, so it stays out.
    chunks = search(db, library, "zyxophore", "hybrid")
    assert "Long" not in titles(chunks)


def test_hybrid_abstains_when_nothing_is_relevant(db: Session, library: User) -> None:
    assert search(db, library, "What is the capital city of Australia?", "hybrid") == []


@pytest.mark.parametrize(
    "query", ['"unbalanced', "a & | b", "foo:*", "'", "   ", "!!! ???", "x" * 500]
)
def test_hybrid_survives_odd_queries(db: Session, library: User, query: str) -> None:
    assert isinstance(search(db, library, query, "hybrid"), list)
