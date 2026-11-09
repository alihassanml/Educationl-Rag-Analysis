# EduRAG

A RAG-based adaptive learning and exam preparation system (final year project). Students upload their own PDF notes, ask questions answered with page citations, take quizzes, and see which topics need revision.

Scope, architecture and milestones: `docs/IMPLEMENTATION_GUIDE.md` (Guide v2; the owner decisions at the top of `CLAUDE.md` take precedence). `Implementation Guide.md` is the earlier v1 guide. Design decisions: `docs/architecture.md`. API: `docs/api-contract.md`. Evaluation and results: `docs/evaluation-plan.md`.

## What works

Sign up and sign in, PDF library (upload, status, delete), cited answers from your own material with a clear "not found" response, topic quizzes, scoring, per-topic progress with transparent rules, recommendations, and a dashboard. An administrator can also open the Evaluation Lab, which measures retrieval (hit rate at K, MRR, nDCG, abstention) on a labelled question set and compares dense with hybrid retrieval. It measures retrieval only: answer faithfulness and quiz quality are not measured by the Lab. Not built: diagnostic quiz, past-paper analysis, viva mode, reminders, mood adaptation, peer matching, OCR, accounts beyond sign up and sign in.

## Requirements

- Node 22+ and npm
- Python 3.11+
- PostgreSQL 16+ with the pgvector extension (`brew install pgvector` on macOS)
- Redis (`brew install redis && brew services start redis`), used by the background worker for Evaluation Lab runs
- A Groq API key

## Quick start

```bash
./start.sh        # macOS or Linux
start.bat         # Windows
```

The first run creates the Python environment, installs dependencies, creates `backend/.env` (with a random `SECRET_KEY`), applies database migrations and starts both servers and, when Redis is running, the background worker: frontend on http://localhost:3000, API on http://localhost:8000 (docs at `/docs`). Then edit `backend/.env`:

```
DATABASE_URL=postgresql+psycopg://YOU@localhost:5432/edurag   # your Postgres user
GROQ_API_KEY=...                                               # from console.groq.com
GROQ_MODEL=openai/gpt-oss-120b                                 # see below
GROQ_REASONING_EFFORT=low
```

List the models your key can use with `cd backend && .venv/bin/python -m app.scripts.list_groq_models`. The first document upload downloads the embedding model (about 130 MB) once.

## Manual setup

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.example .env              # then edit it
createdb edurag
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload

.venv/bin/arq app.workers.settings.WorkerSettings   # second terminal; needs Redis, only for the Evaluation Lab

cd ../frontend
npm install && cp .env.example .env.local && npm run dev
```

## Checks

```bash
cd backend  && .venv/bin/pytest && .venv/bin/ruff check .
cd frontend && npm test && npm run typecheck && npm run lint
cd frontend && npm run e2e        # Playwright; builds the app and starts its own test servers on ports 3001 and 8001
```

End-to-end tests use a separate database (`createdb edurag_e2e` and run migrations with `DATABASE_URL` pointing at it; run `alembic upgrade head` there again after any schema change, otherwise sign up fails with a missing-column error) and a scripted LLM, so they need no Groq key. One-time: `npx playwright install chromium`.

## Evaluation Lab

Administrator only. From `backend/`, with a registered account:

```bash
.venv/bin/python -m app.scripts.make_admin you@example.com
.venv/bin/python -m eval.seed_lab --email you@example.com                  # sample documents and 38 labelled questions
.venv/bin/python -m eval.seed_lab --email you@example.com --run dense,hybrid   # or run from the terminal
```

Then open **Evaluation** in the sidebar, start a run (Dense or Hybrid) and open it for the chart, the abstention confusion matrix and every question's retrieved passages. Runs execute in the background worker; if Redis or the worker is not running, starting a run fails with a clear message (Redis down) or the run stays "Queued" (worker not running). Re-running `seed_lab` keeps existing runs unless the question file changed. Metric definitions and the recorded dense-versus-hybrid result are in `docs/evaluation-plan.md`.

## Configuration and data

Backend settings live in `backend/.env` (see `.env.example`, all keys documented in `app/core/config.py`, including `REDIS_URL` and `RETRIEVAL_MODE`). The frontend only receives public values prefixed `NEXT_PUBLIC_`. `GROQ_API_KEY` stays in the backend and is never committed. Uploaded PDFs are stored under `backend/uploads/<user id>/` with server-generated names and are removed when the document is deleted; back up the database before a demo if the data matters.
