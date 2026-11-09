"""Prepare the Evaluation Lab for an existing user, and optionally run it from the terminal.

Builds the sample study documents in the user's library (skipping titles they already have),
imports the labelled questions as the dataset "Sample course" (kept, with its run history,
if the questions have not changed), and with --run executes the
listed retrieval modes synchronously and prints the headline metrics. Uses the real embedding
model and database, no LLM call. From backend/:

    .venv/bin/python -m eval.seed_lab --email you@example.com --run dense,hybrid
"""

import argparse
import tempfile
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_engine
from app.evaluation.datasets import ensure_dataset, load_jsonl
from app.evaluation.runner import execute_run
from app.evaluation.service import create_run
from app.models.document import Document
from app.models.evaluation import EvalRun
from app.models.user import User
from app.services.embedding_service import get_embedder
from eval.corpus import CORPUS
from eval.run_retrieval_eval import build_corpus

DATASET_NAME = "Sample course"
DATASET_FILE = Path(__file__).parent / "datasets" / "sample_course.jsonl"


def _summary(run: EvalRun) -> str:
    if run.status != "completed" or not run.metrics:
        return f"{run.config['retrieval_mode']}: {run.status} ({run.error_message})"
    m = run.metrics
    return (
        f"{run.config['retrieval_mode']}: hit@1 {m['hit_rate']['1']:.3f}, hit@5 {m['hit_rate']['5']:.3f}, "
        f"MRR {m['mrr']:.3f}, nDCG@5 {m['ndcg']['5']:.3f}, abstention F1 {m['abstention']['f1']:.3f}, "
        f"p50 {m['latency_ms']['p50']:.0f} ms, p95 {m['latency_ms']['p95']:.0f} ms "
        f"({m['n_answerable']} answerable, {m['n_unanswerable']} unanswerable, {m['n_errors']} errors)"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email", required=True, help="an existing user to prepare the lab for")
    parser.add_argument(
        "--run", default="", help="comma-separated modes to run now, e.g. dense,hybrid"
    )
    args = parser.parse_args()
    modes = [m.strip() for m in args.run.split(",") if m.strip()]
    for mode in modes:
        if mode not in ("dense", "hybrid"):
            raise SystemExit(f"Unknown mode {mode!r}; use dense or hybrid")

    with Session(get_engine()) as db:
        user = db.scalar(select(User).where(User.email == args.email.strip().lower()))
        if user is None:
            raise SystemExit(f"No user with email {args.email}. Register the account first")

        have = set(db.scalars(select(Document.title).where(Document.user_id == user.id)))
        missing = set(CORPUS) - have
        if missing:
            with tempfile.TemporaryDirectory() as tmp:
                build_corpus(db, user, Path(tmp), only_titles=missing)
            print(f"Added sample documents: {', '.join(sorted(missing))}")
        dataset = ensure_dataset(db, user.id, DATASET_NAME, load_jsonl(DATASET_FILE))
        print(f'Dataset "{DATASET_NAME}" ready: {len(dataset.items)} questions')

        embedder = get_embedder()
        for mode in modes:
            run = create_run(db, user.id, dataset.id, {"retrieval_mode": mode})
            execute_run(db, embedder, run.id)
            db.refresh(run)
            print(_summary(run))


if __name__ == "__main__":
    main()
