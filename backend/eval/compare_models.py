"""Compare Groq models on this project's real prompts (needs GROQ_API_KEY).

Runs the tutor on answerable and unanswerable questions and quiz generation, with the real
retrieval pipeline and embedding model. Usage (from backend/, after run_retrieval_eval setup):

    DATABASE_URL=postgresql+psycopg://$USER@localhost:5432/edurag_eval \
        .venv/bin/python -m eval.compare_models openai/gpt-oss-120b openai/gpt-oss-20b
"""

import sys
import tempfile
import time
from pathlib import Path

import groq
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import hash_password
from app.db.session import get_engine
from app.models.user import User
from app.schemas.quizzes import GenerateQuizRequest
from app.services import quiz_service, rag_service
from app.services.embedding_service import get_embedder
from app.services.groq_service import GroqService
from eval.corpus import ANSWERABLE, UNANSWERABLE
from eval.run_retrieval_eval import build_corpus

OUT = Path(__file__).parent / "results" / "model_comparison.md"
ANSWERABLE_SAMPLE = ANSWERABLE[::2]  # 15 questions spread across all three documents
EFFORT = {"openai/gpt-oss-120b": "low", "openai/gpt-oss-20b": "low"}


class Counting(GroqService):
    def __init__(self, inner: GroqService) -> None:
        self.inner, self.calls, self.seconds = inner, 0, 0.0

    def complete_json(self, system, user, *, temperature, max_tokens):  # type: ignore[no-untyped-def]
        self.calls += 1
        started = time.perf_counter()
        try:
            return self.inner.complete_json(
                system, user, temperature=temperature, max_tokens=max_tokens
            )
        finally:
            self.seconds += time.perf_counter() - started
            time.sleep(1.0)  # stay well inside rate limits


def evaluate(db: Session, user: User, model: str, lines: list[str], review: list[str]) -> list[str]:
    settings = get_settings()
    client = groq.Groq(api_key=settings.groq_api_key, timeout=60, max_retries=2)
    llm = Counting(GroqService(client, model, EFFORT.get(model, "")))
    embedder = get_embedder()
    settings.retrieval_min_similarity = (
        0.5  # let near-misses reach the model to test its own abstention
    )

    ok = errors = 0
    for question, doc, page in ANSWERABLE_SAMPLE:
        try:
            r = rag_service.ask(db, embedder, llm, user.id, question, None)
        except AppError as exc:
            errors += 1
            review.append(f'- [{model}] ERROR on "{question}": {exc.message}')
            continue
        cited = any(c.document_title == doc and c.page_number == page for c in r.citations)
        ok += (not r.insufficient_evidence) and cited
        review.append(
            f"- [{model}] Q: {question} -> {'ABSTAINED' if r.insufficient_evidence else r.answer[:260]} "
            f"| cited: {sorted({(c.document_title, c.page_number) for c in r.citations})} (want {doc} p{page})"
        )
    answer_calls, answer_seconds = llm.calls, llm.seconds

    refused = 0
    for question in UNANSWERABLE:
        try:
            r = rag_service.ask(db, embedder, llm, user.id, question, None)
        except AppError:
            errors += 1
            continue
        refused += r.insufficient_evidence
        review.append(
            f"- [{model}] UNANSWERABLE: {question} -> "
            f"{'refused' if r.insufficient_evidence else 'ANSWERED: ' + r.answer[:200]}"
        )
    settings.retrieval_min_similarity = 0.6

    quiz_stats = []
    for difficulty in ("beginner", "intermediate", "advanced"):
        before = llm.calls
        try:
            quiz = quiz_service.generate_quiz(
                db,
                embedder,
                llm,
                user.id,
                GenerateQuizRequest(difficulty=difficulty, num_questions=5),
            )
            quiz_stats.append(f"{len(quiz.questions)}/5 questions in {llm.calls - before} call(s)")
            q = quiz.questions[0]
            review.append(
                f"- [{model}] QUIZ ({difficulty}) sample: {q.question_text} | options: {q.options}"
            )
        except AppError as exc:
            quiz_stats.append(f"failed: {exc.code}")
            errors += 1

    lines.append(
        f"| `{model}` | {ok}/{len(ANSWERABLE_SAMPLE)} | {refused}/{len(UNANSWERABLE)} "
        f"| {answer_seconds / max(answer_calls, 1):.1f}s | {'; '.join(quiz_stats)} | {errors} |"
    )
    return lines


def main() -> None:
    models = sys.argv[1:]
    lines = [
        "# Groq model comparison",
        "",
        f"Tutor: {len(ANSWERABLE_SAMPLE)} answerable questions (answered with the right document and page cited) "
        f"and {len(UNANSWERABLE)} unanswerable ones (similarity threshold lowered to 0.5 so near-misses reach the model). "
        "Quiz: three 5-question quizzes from sampled passages.",
        "",
        "| Model | Answerable answered and cited | Unanswerable refused | Avg tutor latency | Quiz generation | API errors |",
        "|---|---|---|---|---|---|",
    ]
    review: list[str] = []
    with Session(get_engine()) as db:
        db.execute(delete(User).where(User.email == "eval@example.com"))
        user = User(email="eval@example.com", password_hash=hash_password("password123"))
        db.add(user)
        db.commit()
        with tempfile.TemporaryDirectory() as tmp:
            build_corpus(db, user, Path(tmp))
        for model in models:
            evaluate(db, user, model, lines, review)
        db.execute(delete(User).where(User.email == "eval@example.com"))
        db.commit()
    report = "\n".join(lines + ["", "## Answers for manual review", ""] + review) + "\n"
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(report)
    print(report)


if __name__ == "__main__":
    main()
