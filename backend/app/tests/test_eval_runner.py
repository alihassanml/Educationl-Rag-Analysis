import json
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.evaluation.datasets import EvalItemIn, import_dataset
from app.evaluation.runner import execute_run
from app.evaluation.service import create_run
from app.models.document import DocumentChunk
from app.models.evaluation import EvalResult, EvalRun
from app.models.user import User
from app.tests.helpers import FakeEmbedder, add_document, make_user

VARIABLES = "A variable stores a value in memory. Every variable has a name and a data type."
RECURSION = (
    "Recursion is a method where a recursive function calls itself. Every recursive function "
    "needs a base case that stops the calls."
)
PHOTOSYNTHESIS = (
    "Photosynthesis converts sunlight, water and carbon dioxide into glucose and oxygen inside "
    "chloroplasts of plant cells."
)

PROGRAMMING = "Programming Notes"
BIOLOGY = "Biology Notes"


def answerable(question: str, title: str, page: int) -> EvalItemIn:
    return EvalItemIn(question=question, answerable=True, gold_document_title=title, gold_page=page)


def unanswerable(question: str) -> EvalItemIn:
    return EvalItemIn(question=question, answerable=False)


@pytest.fixture
def library(db: Session, tmp_path: Path) -> User:
    user = make_user(db)
    add_document(db, user, PROGRAMMING, [VARIABLES, RECURSION], tmp_path)
    add_document(db, user, BIOLOGY, [PHOTOSYNTHESIS], tmp_path)
    return user


def run_items(
    db: Session,
    user: User,
    items: list[EvalItemIn],
    embedder=None,
    **overrides,  # type: ignore[no-untyped-def]
) -> EvalRun:
    dataset = import_dataset(db, user.id, f"set-{uuid.uuid4().hex[:6]}", items)
    run = create_run(db, user.id, dataset.id, overrides)
    execute_run(db, embedder or FakeEmbedder(), run.id)
    db.refresh(run)
    return run


GOOD_ITEMS = [
    answerable("What does a variable name and data type describe?", PROGRAMMING, 1),
    answerable("What is a recursive function and its base case?", PROGRAMMING, 2),
    answerable("How does photosynthesis convert sunlight water carbon dioxide?", BIOLOGY, 1),
    unanswerable("What is the capital city of Australia?"),
]


def test_perfect_retrieval_metrics(db: Session, library: User) -> None:
    run = run_items(db, library, GOOD_ITEMS)

    assert run.status == "completed"
    assert run.items_total == 4
    assert run.items_done == 4
    assert run.started_at is not None and run.finished_at is not None
    metrics = run.metrics
    assert metrics["n_answerable"] == 3
    assert metrics["n_unanswerable"] == 1
    assert metrics["n_errors"] == 0
    assert metrics["hit_rate"]["1"] == 1.0
    assert metrics["hit_rate"]["10"] == 1.0
    assert metrics["mrr"] == 1.0
    assert metrics["abstention"]["tp"] == 3
    assert metrics["abstention"]["tn"] == 1
    assert metrics["abstention"]["f1"] == 1.0
    assert metrics["pass_rate"] == 1.0
    assert metrics["latency_ms"]["p95"] >= metrics["latency_ms"]["p50"] >= 0.0
    low, high = metrics["ci"]["mrr"]
    assert low <= metrics["mrr"] <= high


def test_result_rows_store_rank_and_pass_without_chunk_text(db: Session, library: User) -> None:
    run = run_items(db, library, GOOD_ITEMS[:1])
    result = db.scalars(select(EvalResult).where(EvalResult.run_id == run.id)).one()

    assert result.first_relevant_rank == 1
    assert result.passed is True
    assert result.answered is True
    assert result.retrieved[0]["relevant"] is True
    assert result.retrieved[0]["document_title"] == PROGRAMMING
    assert result.retrieved[0]["page_number"] == 1
    assert "content" not in result.retrieved[0]


def test_unresolvable_gold_is_an_error_and_excluded(db: Session, library: User) -> None:
    items = [*GOOD_ITEMS, answerable("What is a sorting algorithm?", "Deleted Notes", 3)]
    run = run_items(db, library, items)

    assert run.status == "completed"
    assert run.metrics["n_errors"] == 1
    assert run.metrics["n_answerable"] == 3  # the unresolvable item is not counted
    assert run.metrics["hit_rate"]["1"] == 1.0
    errored = db.scalars(
        select(EvalResult).where(EvalResult.run_id == run.id, EvalResult.error.is_not(None))
    ).one()
    assert errored.error == "Gold passage not found in your library"
    assert errored.passed is None


def test_other_users_documents_are_never_used(db: Session, tmp_path: Path) -> None:
    owner = make_user(db, "owner@example.com")
    other = make_user(db, "other@example.com")
    add_document(db, owner, BIOLOGY, [PHOTOSYNTHESIS], tmp_path)
    add_document(db, other, PROGRAMMING, [VARIABLES, RECURSION], tmp_path)

    # The gold document only exists in the other user's library, so it is unresolvable.
    run = run_items(db, owner, [answerable("What is a recursive function?", PROGRAMMING, 2)])
    assert run.status == "failed"  # nothing could be scored
    only = db.scalars(select(EvalResult).where(EvalResult.run_id == run.id)).one()
    assert only.error == "Gold passage not found in your library"

    # Same title in both libraries: every retrieved chunk must belong to the run owner.
    add_document(db, owner, PROGRAMMING, [VARIABLES, RECURSION], tmp_path)
    run = run_items(db, owner, [answerable("What is a recursive function?", PROGRAMMING, 2)])
    owner_chunks = {
        str(c)
        for c in db.scalars(select(DocumentChunk.id).where(DocumentChunk.user_id == owner.id))
    }
    result = db.scalars(select(EvalResult).where(EvalResult.run_id == run.id)).one()
    assert result.retrieved
    assert {r["chunk_id"] for r in result.retrieved} <= owner_chunks


class _FlakyEmbedder(FakeEmbedder):
    def embed_query(self, text_: str) -> list[float]:
        if "boom" in text_:
            raise ValueError("embedding service exploded")
        return super().embed_query(text_)


def test_one_failing_item_does_not_stop_the_run(db: Session, library: User) -> None:
    items = [unanswerable("This question will boom"), *GOOD_ITEMS[:1]]
    run = run_items(db, library, items, embedder=_FlakyEmbedder())

    assert run.status == "completed"
    assert run.items_done == 2
    assert run.metrics["n_errors"] == 1
    failed = db.scalars(
        select(EvalResult).where(EvalResult.run_id == run.id, EvalResult.error.is_not(None))
    ).one()
    assert failed.error == "Retrieval failed for this item"
    assert "exploded" not in failed.error


def test_failure_outside_the_item_loop_marks_run_failed_safely(
    db: Session, library: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(*_args: object, **_kwargs: object) -> dict:
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr("app.evaluation.runner.compute_metrics", boom)
    run = run_items(db, library, GOOD_ITEMS)

    assert run.status == "failed"
    assert run.error_message == "The evaluation could not be completed"
    assert run.finished_at is not None


def test_empty_dataset_completes_with_zero_metrics(db: Session, library: User) -> None:
    run = run_items(db, library, [])

    assert run.status == "completed"
    assert run.items_total == 0
    metrics = run.metrics
    assert metrics["hit_rate"]["5"] == 0.0
    assert metrics["mrr"] == 0.0
    assert metrics["abstention"]["f1"] == 0.0
    json.dumps(metrics, allow_nan=False)


def test_only_unanswerable_items_do_not_divide_by_zero(db: Session, library: User) -> None:
    run = run_items(db, library, [unanswerable("What is the capital city of Australia?")])

    assert run.status == "completed"
    assert run.metrics["hit_rate"]["1"] == 0.0
    assert run.metrics["abstention"]["tn"] == 1
    json.dumps(run.metrics, allow_nan=False)


def test_create_run_rejects_other_users_dataset(db: Session, library: User) -> None:
    other = make_user(db, "other@example.com")
    dataset = import_dataset(db, other.id, "Theirs", GOOD_ITEMS)
    with pytest.raises(NotFoundError):
        create_run(db, library.id, dataset.id, {})


def test_config_snapshot_is_stored(db: Session, library: User) -> None:
    dataset = import_dataset(db, library.id, "Snapshot", GOOD_ITEMS)
    run = create_run(db, library.id, dataset.id, {"retrieval_mode": "hybrid"})

    assert run.status == "queued"
    assert run.items_total == 4
    assert run.config["retrieval_mode"] == "hybrid"
    assert run.config["depth"] == 10
    assert "min_similarity" in run.config
    assert "embedding_model" in run.config


def test_answerable_question_does_not_pass_when_the_gold_passage_is_below_the_gate(
    db: Session, tmp_path: Path
) -> None:
    user = make_user(db)
    add_document(db, user, "Strong", ["alpha beta gamma delta epsilon"], tmp_path)
    add_document(db, user, "Weak", ["alpha zeta theta iota kappa lambda"], tmp_path)
    # The wrong page passes the gate and is ranked first. The gold page is ranked second, but its
    # similarity (about 0.16) is under the 0.2 gate, so the tutor would never have shown it.
    run = run_items(
        db, user, [answerable("alpha beta gamma delta epsilon", "Weak", 1)], min_similarity=0.2
    )
    result = db.scalars(select(EvalResult).where(EvalResult.run_id == run.id)).one()

    assert result.first_relevant_rank == 2  # ranking is still measured before the gate
    assert result.answered is True
    assert result.passed is False
    assert run.metrics["hit_rate"]["5"] == 1.0
    assert run.metrics["pass_rate"] == 0.0


def test_run_where_nothing_could_be_scored_is_failed_not_completed(
    db: Session, library: User
) -> None:
    items = [answerable("What is a sorting algorithm?", "Deleted Notes", 3)]
    run = run_items(db, library, items)

    assert run.status == "failed"
    assert (
        run.error_message
        == "No question could be scored. Check that the documents are in your library"
    )
    assert run.items_done == 1  # the per-question reasons stay available
    assert db.scalars(select(EvalResult).where(EvalResult.run_id == run.id)).one().error is not None
