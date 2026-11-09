# EduRAG architecture

EduRAG is a modular monolith: a Next.js frontend, one FastAPI backend, and one background worker, with PostgreSQL (plus pgvector) as the datastore and Redis as the job queue. Groq is called only from the backend.

```text
Browser -> Next.js (pages, forms, API client)
              |  REST + JSON, httpOnly cookie
              v
          FastAPI  routes -> services -> SQLAlchemy -> PostgreSQL + pgvector
              |                  \-> local embedding model (sentence-transformers)
              \-> Groq API (answers and quiz drafts only)
              \-> Redis -> ARQ worker -> same services and database (Evaluation Lab runs)
```

## Backend layers (`backend/app`)

| Layer | Folder | Rule |
|---|---|---|
| Routes | `api/routes` | Validate input, call one service, return a schema. No SQL, no Groq calls. |
| Schemas | `schemas` | Pydantic request and response models. |
| Services | `services` | Business logic: PDF, chunking, embedding, retrieval, RAG, quizzes, scoring, recommendations, progress. |
| Models | `models` | SQLAlchemy tables. Schema changes go through Alembic. |
| Evaluation | `evaluation` | Metrics (pure functions), dataset import, run service and runner for the Evaluation Lab. |
| Workers | `workers` | ARQ job functions and settings; the queue wrapper routes depend on. |
| Core | `core` | Settings, security (hashing, JWT), error handling, logging. |

`groq_service.py` is the only module that imports the Groq SDK. `embedding_service.py` is the only one that loads the embedding model, and it is separate from text generation.

## Decisions

- **Authentication:** passwords hashed with Argon2 (`pwdlib`). The session is a signed, expiring JWT in an `httpOnly`, `SameSite=Lax` cookie, so browser code never sees the token. State-changing requests whose `Origin` header is not in `CORS_ORIGINS` are rejected (CSRF defence). In production set `COOKIE_SECURE=true` and serve the frontend and API from the same site. The backend refuses to start in production with the default `SECRET_KEY`.
- **Ownership:** every document, chunk, quiz, attempt and progress query filters on the signed-in user's id. Someone else's resource returns 404, not 403, so ids cannot be probed. Tests in `test_documents.py`, `test_tutor.py`, `test_quizzes.py`, `test_progress.py` cover cross-user access.
- **Background worker (approved 2026-11-09):** Redis plus one ARQ worker run Evaluation Lab jobs. Progress is written to the database (`eval_runs.items_done`), not Redis, so the page can poll an ordinary endpoint and a Redis restart loses no results. The worker loads the embedding model once at startup. If Redis is unreachable, starting a run returns 503 and the run is stored as failed; if only the worker is down, the run waits as queued. Document indexing stays synchronous.
- **Administrators:** `users.is_admin`, set with `python -m app.scripts.make_admin`. Evaluation endpoints require it (403 otherwise) and every run and dataset is visible only to the user who created it.
- **Indexing is synchronous.** Upload, extraction, chunking, embedding and storage happen in the upload request. This is fine for study notes; if a request ever exceeds a few seconds, move only that step to a background task.
- **Chunks never cross pages**, so each citation names exactly one page. Defaults: 350 words with 60 overlap, which keeps chunks under the 512-token limit of `bge-small-en-v1.5` (the guide's 500 to 800 token range would be truncated by this model).
- **Retrieval:** exact cosine search in pgvector, filtered by user and (optionally) selected documents, top 6, near-duplicates removed, then a similarity threshold (`RETRIEVAL_MIN_SIMILARITY`, default 0.60, chosen from `evaluation-plan.md`). If nothing passes, the tutor refuses without calling Groq. An optional hybrid mode (`RETRIEVAL_MODE=hybrid`) fuses that ranking with a PostgreSQL full-text ranking by reciprocal rank fusion, still behind the same similarity gate. It stays off: on the sample corpus it was not better (`evaluation-plan.md`, section 6). No reranker or approximate index, because the measured baseline did not need them.
- **Citations come from retrieval metadata.** The model only returns passage numbers; numbers that were not retrieved are ignored.
- **Quizzes:** the model drafts JSON; the backend validates it (4 distinct options, a valid correct option, cited passages that were actually supplied), regenerates up to 3 times, shuffles option order, and saves only valid questions. A quiz can be submitted once (database unique constraint); to practise again, create another quiz.
- **Adaptive rules** (`recommendation_service.py`): fewer than 3 answered questions on a topic is "insufficient data"; under 60% needs revision; 60% to 79% is practicing; 80% and above is doing well. Integer arithmetic keeps the boundaries exact. Thresholds are configuration, not claims about optimal values.
- **Not implemented** (Phase 2 and 3 of the guide): diagnostic quiz, past-paper frequency, viva mode, reminders, mood adaptation, peer matching, conversation history, OCR.

## Frontend (`frontend`)

Next.js App Router with TypeScript and Tailwind. All backend calls go through `lib/api-client.ts` (cookies included, one error shape, `FormData` uploads). `proxy.ts` redirects visitors without a session cookie to `/login`; this is a convenience only, the backend enforces access. Every screen uses `PageContainer` for one shared margin and max width. Colours, shadows and glass come from CSS variables in `styles/tokens.css` ("Midnight & Ice", light and dark through the system setting); a test checks WCAG AA contrast for every text pair, and the few places where the guide's hex values failed are commented in that file.
