# EduRAG

A RAG-based adaptive learning and exam-preparation system (final year project). Students upload their own material; every answer, quiz and explanation comes from it, cites it (chapter and page, or video time), and says "not found" when the material does not cover the question.

## Features

- **Knowledge base:** PDF, link (page or online PDF), pasted text and YouTube lectures, one private library per student, labelled as notes, textbook, past paper, teacher material or lecture.
- **Tutor:** streamed, cited answers, saved chats, follow-ups, feedback, "Quiz me" inside the chat, Teacher-Clone style answers.
- **Adaptive engine:** diagnostic test (Student Profile Builder), topic extraction, automatic difficulty, weak-topic detector, Course Map with re-routing, mood-aware lighter steps.
- **Exam preparation:** Exam Predictor from past papers, Viva Bot (spoken or typed oral exam with a cited rubric report), study reminders and slip tests.
- **Social:** Student and Teacher accounts, classes with join codes and shared material, teacher dashboard, Peer Match duels (opt-in, display names only).
- **Security:** AES-256-GCM encrypted uploads, Argon2, httpOnly JWT cookie, rate limits, security headers (`docs/security.md`).
- **Evaluation Lab** (admin): hit rate, MRR, nDCG and abstention for dense and hybrid retrieval.

Documentation is in `docs/`: `SRS.md`, `ERD.md`, `architecture.md`, `design-decisions.md`, `security.md`, `deployment.md`, `evaluation-plan.md`, `test-report.md`, `user-guide.md`.

## Requirements

- Node 22+ and npm, Python 3.11+
- PostgreSQL 16+ with pgvector (`brew install pgvector` on macOS)
- Redis (`brew install redis && brew services start redis`): the indexing worker, reminders and rate limits
- A Groq API key
- Or just Docker: `docker compose up --build` (see `docs/deployment.md`)

## Quick start

```bash
./start.sh        # macOS or Linux
start.bat         # Windows
```

The first run creates the Python environment, installs dependencies, creates `backend/.env` (with a random `SECRET_KEY`), applies migrations and starts the API (http://localhost:8000, docs at `/docs`), the worker (when Redis is running) and the frontend (http://localhost:3000). Then edit `backend/.env`: `DATABASE_URL`, `GROQ_API_KEY`, `GROQ_MODEL`. List usable models with `.venv/bin/python -m app.scripts.list_groq_models`. The first upload downloads the embedding model (about 130 MB).

## Manual setup

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.example .env              # then edit it
createdb edurag
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload
.venv/bin/arq app.workers.settings.WorkerSettings   # second terminal; needs Redis

cd ../frontend
npm install && npm run dev
```

The browser calls `/api/v1` on the frontend's own address; Next.js forwards it to the API (`BACKEND_URL`, default `http://localhost:8000`).

## Scripts (`backend/`, run as `.venv/bin/python -m app.scripts.<name>`)

| Script | Purpose |
| --- | --- |
| `make_admin you@example.com` | Make an account an administrator |
| `encrypt_existing_files [--dry-run]` | Encrypt uploads stored before encryption was switched on |
| `reindex_documents [--email ...]` | Rebuild passages after a change to reading or chunking |
| `backfill_topics` | Extract topics for documents uploaded before topics existed |
| `generate_erd` | Print the Mermaid ER diagram from the models |
| `list_groq_models` | List the models your Groq key can use |

## Checks

```bash
cd backend  && .venv/bin/ruff check app && .venv/bin/pytest
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
cd frontend && npm run e2e        # Playwright; starts its own servers (E2E_API_PORT / E2E_WEB_PORT)
```

End-to-end tests need a Postgres database `edurag_e2e` (`createdb edurag_e2e`; run `alembic upgrade head` there after every schema change) and a scripted LLM, so no Groq key. One-time: `npx playwright install chromium`. CI (`.github/workflows/ci.yml`) runs the backend and frontend checks on every push.

## Study tutor chat

The tutor keeps conversations. Each student has chat threads with saved messages and citations; a follow-up such as "What about its base case?" is rewritten into a standalone question before searching, and the answer is streamed with its sources shown first. A Stop button (or Esc) ends an answer early and keeps the partial text, and answers can be rated with a thumbs up or down. Admins see recent ratings under **Live feedback** in the Evaluation Lab.

All endpoints are under `/api/v1/tutor` and every query is limited to the signed-in student. Another student's thread or message returns 404.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET, POST | `/threads` | List threads (newest first, `limit` and `offset`), create an empty thread |
| GET, PATCH, DELETE | `/threads/{id}` | Read with messages and citations, rename, delete with its messages and feedback |
| POST | `/threads/{id}/messages` | Send a question, answer arrives as server-sent events |
| POST | `/messages/{id}/feedback` | `up` or `down`, with an optional reason (`wrong`, `missing_source`, `unclear`) on a thumbs down |
| GET | `/feedback` | Admin only: recent feedback with the question and answer, no student identity |
| POST | `/ask` | The original single-question endpoint, unchanged |

The message stream sends these events in order: `status` (`rewriting` for follow-ups only, then `searching`), `sources` (marker, chunk, document, title, page, snippet), `status` (`writing`), `token` (text pieces), then `done` (message id, `abstained`, `standalone_query`, `rewrite_used`, `unknown_markers`, per-stage `latency_ms`) or `error` (a safe code and message). When nothing in the student's material passes the similarity gate, no answer is generated: the stream sends `sources` (empty) and `done` with `abstained: true`.

Grounding rules: the conversation is used only to rewrite a follow-up; the answer prompt receives only the retrieved passages and the standalone question, and earlier answers are never evidence. The first message of a thread is searched as typed, and a failed rewrite falls back to the original question. Citations come from retrieval results only, and a `[n]` in the text that is not among the sources is dropped from the display and reported in `unknown_markers`. If the client disconnects, the server stops reading from the model and saves the partial answer with status `stopped`. A citation to a deleted document keeps its title and passage and shows "Source deleted".

Not built (optional extras in the brief): the Redis message limit, and follow-up question pairs in the evaluation set.

## Evaluation Lab

Administrator only. From `backend/`, with a registered account:

```bash
.venv/bin/python -m app.scripts.make_admin you@example.com
.venv/bin/python -m eval.seed_lab --email you@example.com                  # sample documents and 38 labelled questions
.venv/bin/python -m eval.seed_lab --email you@example.com --run dense,hybrid   # or run from the terminal
```

Then open **Evaluation** in the sidebar, start a run (Dense or Hybrid) and open it for the chart, the abstention confusion matrix and every question's retrieved passages. Runs execute in the background worker; if Redis or the worker is not running, starting a run fails with a clear message (Redis down) or the run stays "Queued" (worker not running). Re-running `seed_lab` keeps existing runs unless the question file changed. Metric definitions are in `docs/evaluation-plan.md`.

## Configuration and data

Backend settings live in `backend/.env` (see `.env.example`; every key is documented in `app/core/config.py`). Important ones: `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`, `FILE_ENCRYPTION_KEY` (required in production), `GROQ_API_KEY`, `CORS_ORIGINS`, `COOKIE_SECURE`, `RATE_LIMIT_*`. The frontend only receives public values prefixed `NEXT_PUBLIC_`. `GROQ_API_KEY` stays in the backend.

Uploaded files are stored under `backend/uploads/<user id>/` with server-generated names, AES-256-GCM encrypted when `FILE_ENCRYPTION_KEY` is set, and removed when the document is deleted. Back up the database, the uploads and the encryption key (see `docs/deployment.md`).
