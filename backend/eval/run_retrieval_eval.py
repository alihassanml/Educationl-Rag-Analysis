"""Measure retrieval relevance, citation correctness and abstention on the sample corpus.

Uses the real embedding model, PostgreSQL + pgvector, and the real indexing pipeline. No LLM call
is made, so the result needs no API key. Usage (from backend/):

    createdb edurag_eval
    DATABASE_URL=postgresql+psycopg://$USER@localhost:5432/edurag_eval .venv/bin/alembic upgrade head
    DATABASE_URL=postgresql+psycopg://$USER@localhost:5432/edurag_eval \
        .venv/bin/python -m eval.run_retrieval_eval
"""

import tempfile
from pathlib import Path

import pymupdf
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import get_engine
from app.models.document import Document
from app.models.user import User
from app.services import document_service, retrieval_service
from app.services.embedding_service import get_embedder
from eval.corpus import ANSWERABLE, CORPUS, UNANSWERABLE

THRESHOLDS = [0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70]
OUT = Path(__file__).parent / "results" / "retrieval_results.md"


def build_corpus(db: Session, user: User, workdir: Path) -> dict[str, Document]:
    docs: dict[str, Document] = {}
    for title, pages in CORPUS.items():
        pdf = pymupdf.open()
        for text in pages:
            pdf.new_page().insert_textbox(pymupdf.Rect(50, 50, 550, 800), text, fontsize=11)
        path = workdir / f"{title}.pdf"
        pdf.save(path)
        docs[title] = document_service.create_and_process(
            db,
            get_embedder(),
            user.id,
            filename=f"{title}.pdf",
            title=title,
            path=path,
            size=path.stat().st_size,
        )
        assert docs[title].status == "ready", docs[title].error_message
    return docs


def main() -> None:
    settings = get_settings()
    with Session(get_engine()) as db:
        db.execute(delete(User).where(User.email == "eval@example.com"))
        user = User(email="eval@example.com", password_hash=hash_password("password123"))
        db.add(user)
        db.commit()
        with tempfile.TemporaryDirectory() as tmp:
            build_corpus(db, user, Path(tmp))
        embedder = get_embedder()

        def top(question: str) -> list[retrieval_service.RetrievedChunk]:
            return retrieval_service.retrieve(
                db, embedder, user.id, question, top_k=settings.retrieval_top_k, min_similarity=-1.0
            )

        answerable = [(q, d, p, top(q)) for q, d, p in ANSWERABLE]
        unanswerable = [(q, top(q)) for q in UNANSWERABLE]

        def is_hit(chunks, doc, page, k):  # type: ignore[no-untyped-def]
            return any(c.document_title == doc and c.page_number == page for c in chunks[:k])

        lines = [
            "# Retrieval evaluation",
            "",
            f"Embedding model: `{settings.embedding_model}`. Corpus: {len(CORPUS)} documents, "
            f"{sum(len(p) for p in CORPUS.values())} pages. {len(ANSWERABLE)} answerable and "
            f"{len(UNANSWERABLE)} unanswerable questions.",
            "",
            "## Retrieval relevance (answerable questions, no similarity threshold)",
            "",
            "| Metric | Result |",
            "|---|---|",
        ]
        for k in (1, 3, settings.retrieval_top_k):
            hits = sum(is_hit(c, d, p, k) for _, d, p, c in answerable)
            lines.append(
                f"| Expected page in top {k} | {hits}/{len(answerable)} ({hits / len(answerable):.0%}) |"
            )

        lines += [
            "",
            "## Threshold sweep",
            "",
            "A question is answered when at least one chunk meets the threshold. "
            "Citation correct = the expected page is among the chunks that meet it.",
            "",
            "| Threshold | Answerable answered | Citation correct | Unanswerable refused |",
            "|---|---|---|---|",
        ]
        for t in THRESHOLDS:
            answered = [
                (d, p, [c for c in chunks if c.similarity >= t]) for _, d, p, chunks in answerable
            ]
            n_answered = sum(1 for _, _, kept in answered if kept)
            n_correct = sum(1 for d, p, kept in answered if is_hit(kept, d, p, len(kept)))
            refused = sum(
                1 for _, chunks in unanswerable if not any(c.similarity >= t for c in chunks)
            )
            marker = " (current)" if abs(t - settings.retrieval_min_similarity) < 1e-9 else ""
            lines.append(
                f"| {t:.2f}{marker} | {n_answered}/{len(answerable)} | {n_correct}/{len(answerable)} "
                f"| {refused}/{len(unanswerable)} |"
            )

        lines += ["", "## Failure cases at the current threshold", ""]
        t = settings.retrieval_min_similarity
        failures = []
        for q, d, p, chunks in answerable:
            kept = [c for c in chunks if c.similarity >= t]
            if not is_hit(kept, d, p, len(kept)):
                best = chunks[0]
                failures.append(
                    f'- Answerable, expected {d} p{p}: "{q}" -> best {best.document_title} '
                    f"p{best.page_number} at {best.similarity:.2f}"
                )
        for q, chunks in unanswerable:
            if any(c.similarity >= t for c in chunks):
                best = chunks[0]
                failures.append(
                    f'- Unanswerable but not refused: "{q}" -> {best.document_title} '
                    f"p{best.page_number} at {best.similarity:.2f}"
                )
        lines += failures or ["None."]

        lines += [
            "",
            "## Similarity scores",
            "",
            "| Group | Lowest | Median | Highest |",
            "|---|---|---|---|",
        ]

        def stats(values):  # type: ignore[no-untyped-def]
            values = sorted(values)
            return f"{values[0]:.2f} | {values[len(values) // 2]:.2f} | {values[-1]:.2f}"

        lines.append(
            f"| Answerable, best chunk | {stats([c[0].similarity for *_, c in answerable])} |"
        )
        lines.append(
            f"| Unanswerable, best chunk | {stats([c[0].similarity for _, c in unanswerable])} |"
        )

        OUT.parent.mkdir(exist_ok=True)
        OUT.write_text("\n".join(lines) + "\n")
        print("\n".join(lines))

        db.execute(delete(User).where(User.email == "eval@example.com"))
        db.commit()
    _ = select  # keep import used for type checkers


if __name__ == "__main__":
    main()
