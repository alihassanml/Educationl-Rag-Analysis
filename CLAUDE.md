# EduRAG FYP project guidance

Full plan: `Implementation Guide.md`. The rules below are binding.

Stack: Next.js (App Router, TypeScript, Tailwind) in `frontend/`, FastAPI + SQLAlchemy + Alembic in `backend/`, PostgreSQL with pgvector, Groq via the backend only.

Commands:
- Backend (from `backend/`, venv at `.venv`): `.venv/bin/pytest`, `.venv/bin/ruff check .`, `.venv/bin/uvicorn app.main:app --reload`, `.venv/bin/alembic upgrade head`
- Frontend (from `frontend/`): `npm test`, `npm run typecheck`, `npm run lint`, `npm run dev`, `npm run e2e` (Playwright, own servers on 3001 and 8001)
- Evaluation (from `backend/`): `python -m eval.run_retrieval_eval`, `python -m eval.compare_models <ids>`; see `docs/evaluation-plan.md`
- Groq model and key are set in `backend/.env` (`GROQ_API_KEY`, `GROQ_MODEL`); never print or commit the key
- Next.js here is v16 with breaking changes: read `frontend/node_modules/next/dist/docs/` before writing Next code.

UI note from the owner: use one consistent left/right page margin on every screen (`PageContainer`), and never put a trailing full stop in headings or buttons.

### Product rules

1.  This is an FYP project, not a real-time commercial platform.
2.  Follow the approved proposal's main workflow: upload personal study
    materials, create a private searchable knowledge base, answer with
    citations, run quizzes, detect weak topics, and recommend the next
    study action.
3.  Do not silently add advanced features or change the stack.
4.  Keep frontend and backend separate.
5.  Use Groq only through the backend service layer.
6.  Keep embeddings separate from LLM text generation.
7.  Use PostgreSQL with pgvector for records and vectors.
8.  Use transparent rule-based adaptation before considering machine
    learning.
9.  Do not claim guaranteed zero hallucinations, perfect citations, or
    reliable exam prediction.
10. Do not add Redis, Celery, Kafka, microservices, Kubernetes, agents,
    or other infrastructure without a specific approved need.

### Coding rules

1.  Inspect the existing repository before changing it.
2.  Read the relevant files and current dependency versions before
    selecting APIs or editing configuration.
3.  Make small, focused changes that fit the existing architecture.
4.  Use TypeScript in the frontend and type hints in Python.
5.  Validate external inputs with schemas.
6.  Keep business logic out of route handlers and React presentation
    components.
7.  Do not duplicate business rules between frontend and backend.
8.  Add or update tests for each meaningful behavior change.
9.  Do not delete existing work or replace working code wholesale
    without a clear reason.
10. Do not invent environment variables, API routes, model IDs, or
    library methods. Verify them in the project's code or official
    documentation.
11. Never expose secrets to frontend code or commit real `.env` files.
12. Ensure every document/chunk operation checks the authenticated
    user's ownership.
13. Keep error messages useful and safe.
14. Do not leave fake data in a feature once it is connected to the
    backend.
15. Update README or API documentation when behavior or setup changes.

### UI rules

1.  Use the approved neutral light palette and green primary action.
2.  Avoid gradients, glowing effects, glassmorphism, excessive pills,
    oversized cards, and decorative AI visuals.
3.  Prioritize hierarchy, whitespace, readability, and familiar
    patterns.
4.  Use one main action per page.
5.  Implement loading, empty, error, and success states.
6.  Make forms and navigation accessible by keyboard.
7.  Use real API data in completed workflows.
8.  Do not add a chart unless it helps explain progress or guide the
    next action.
9.  Use responsive layouts, but do not overcomplicate the design system.
10. Keep styling consistent with shared tokens and components.

### Required workflow for each task

1.  Inspect relevant files and explain briefly what will change.
2.  Identify the smallest implementation plan.
3.  Implement the feature in the correct frontend or backend layer.
4.  Add or update tests.
5.  Run the relevant tests, type checks, and lint checks available in
    the repository.
6.  Report what changed, which checks passed, and any remaining issue.
7.  If a test cannot run, state why. Never claim it passed without
    running it.

### Definition of done

A task is complete only when the code is integrated with the existing
project, the main states are handled, authorization is enforced where
relevant, tests are updated, and the actual verification result is
reported.
