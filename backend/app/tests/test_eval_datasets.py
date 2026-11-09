import json
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.errors import AppError
from app.core.security import hash_password
from app.evaluation.datasets import EvalItemIn, ensure_dataset, import_dataset, load_jsonl
from app.evaluation.service import create_run
from app.models.evaluation import EvalDataset, EvalItem, EvalRun
from app.models.user import User
from app.tests.helpers import register
from eval.corpus import CORPUS

SAMPLE = Path(__file__).resolve().parents[2] / "eval" / "datasets" / "sample_course.jsonl"


def make_user(db: Session, email: str = "admin@example.com", is_admin: bool = False) -> User:
    user = User(email=email, password_hash=hash_password("password123"), is_admin=is_admin)
    db.add(user)
    db.commit()
    return user


def test_load_sample_dataset_matches_the_sample_corpus() -> None:
    items = load_jsonl(SAMPLE)
    answerable = [i for i in items if i.answerable]
    assert len(answerable) == 30
    assert len(items) - len(answerable) == 8
    for item in answerable:
        assert item.gold_document_title in CORPUS
        assert 1 <= item.gold_page <= len(CORPUS[item.gold_document_title])  # type: ignore[index,operator]


def test_answerable_requires_gold_passage() -> None:
    with pytest.raises(ValidationError):
        EvalItemIn(question="What is a variable?", answerable=True)


def test_unanswerable_rejects_gold_passage() -> None:
    with pytest.raises(ValidationError):
        EvalItemIn(
            question="Who painted the Mona Lisa?",
            answerable=False,
            gold_document_title="Art",
            gold_page=1,
        )


def test_load_jsonl_reports_line_number(tmp_path: Path) -> None:
    path = tmp_path / "bad.jsonl"
    good = {"question": "What is a variable?", "answerable": False}
    path.write_text(json.dumps(good) + "\n{not json}\n")
    with pytest.raises(ValueError, match="line 2"):
        load_jsonl(path)


def test_import_dataset_replaces_same_name(db: Session) -> None:
    user = make_user(db)
    first = [EvalItemIn(question="Who painted the Mona Lisa?", answerable=False)]
    second = [
        EvalItemIn(question="What is the capital city of Australia?", answerable=False),
        EvalItemIn(question="Who wrote Hamlet?", answerable=False),
    ]
    import_dataset(db, user.id, "Sample course", first)
    dataset = import_dataset(db, user.id, "Sample course", second)

    assert db.scalar(select(func.count()).select_from(EvalDataset)) == 1
    questions = set(db.scalars(select(EvalItem.question).where(EvalItem.dataset_id == dataset.id)))
    assert questions == {"What is the capital city of Australia?", "Who wrote Hamlet?"}


def test_import_dataset_is_scoped_to_the_user(db: Session) -> None:
    a = make_user(db, "a@example.com")
    b = make_user(db, "b@example.com")
    item = [EvalItemIn(question="Who painted the Mona Lisa?", answerable=False)]
    import_dataset(db, a.id, "Sample course", item)
    import_dataset(db, b.id, "Sample course", item)
    assert db.scalar(select(func.count()).select_from(EvalDataset)) == 2


def test_require_admin_forbids_regular_user(db: Session) -> None:
    with pytest.raises(AppError) as caught:
        require_admin(make_user(db, "student@example.com", is_admin=False))
    assert caught.value.status_code == 403
    assert caught.value.code == "forbidden"


def test_require_admin_allows_admin(db: Session) -> None:
    admin = make_user(db, is_admin=True)
    assert require_admin(admin) is admin


def test_me_returns_is_admin(client, db: Session) -> None:  # type: ignore[no-untyped-def]
    registered = register(client, "someone@example.com")
    assert registered["is_admin"] is False
    user = db.scalar(select(User).where(User.email == "someone@example.com"))
    user.is_admin = True  # type: ignore[union-attr]
    db.commit()
    assert client.get("/api/v1/auth/me").json()["is_admin"] is True


def test_ensure_dataset_keeps_run_history_when_questions_are_unchanged(db: Session) -> None:
    user = make_user(db)
    items = [EvalItemIn(question="Who painted the Mona Lisa?", answerable=False)]
    dataset = ensure_dataset(db, user.id, "Sample course", items)
    run = create_run(db, user.id, dataset.id, {})

    again = ensure_dataset(db, user.id, "Sample course", items)

    assert again.id == dataset.id
    assert db.get(EvalRun, run.id) is not None


def test_ensure_dataset_replaces_when_questions_changed(db: Session) -> None:
    user = make_user(db)
    old = ensure_dataset(
        db,
        user.id,
        "Sample course",
        [EvalItemIn(question="Who painted the Mona Lisa?", answerable=False)],
    )
    changed = [EvalItemIn(question="Who wrote the play Hamlet?", answerable=False)]

    new = ensure_dataset(db, user.id, "Sample course", changed)

    assert new.id != old.id
    questions = set(db.scalars(select(EvalItem.question).where(EvalItem.dataset_id == new.id)))
    assert questions == {"Who wrote the play Hamlet?"}
