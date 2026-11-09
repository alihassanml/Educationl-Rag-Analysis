# EduRAG architecture

EduRAG is a modular monolith: a Next.js frontend and one FastAPI backend, with PostgreSQL (plus pgvector) as the only datastore. Groq is called only from the backend.

```text
Browser -> Next.js (pages, forms, API client)
              |  REST + JSON, httpOnly cookie
              v
          FastAPI  routes -> services -> SQLAlchemy -> PostgreSQL + pgvector
              |                  \-> local embedding model (sentence-transformers)
              \-> Groq API (answers and quiz drafts only)
```

## Backend layers (`backend/app`)

| Layer | Folder | Rule |
|---|---|---|
| Routes | `api/routes` | Validate input, call one service, return a schema. No SQL, no Groq calls. |
| Schemas | `schemas` | Pydantic request and response models. |
| Services | `services` | Business logic: PDF, chunking, embedding, retrieval, RAG, quizzes, scoring, recommendations, progress. |
| Models | `models` | SQLAlchemy tables. Schema changes go through Alembic. |
| Core | `core` | Settings, security (hashing, JWT), error handling, logging. |

`groq_service.py` is the only module that imports the Groq SDK. `embedding_service.py` is the only one that loads the embedding model, and it is separate from text generation.

## Decisions

- **Authentication:** passwords hashed with Argon2 (`pwdlib`). The session is a signed, expiring JWT in an `httpOnly`, `SameSite=Lax` cookie, so browser code never sees the token. State-changing requests whose `Origin` header is not in `CORS_ORIGINS` are rejected (CSRF defence). In production set `COOKIE_SECURE=true` and serve the frontend and API from the same site. The backend refuses to start in production with the default `SECRET_KEY`.
- **Ownership:** every document, chunk, quiz, attempt and progress query filters on the signed-in user's id. Someone else's resource returns 404, not 403, so ids cannot be probed. Tests in `test_documents.py`, `test_tutor.py`, `test_quizzes.py`, `test_progress.py` cover cross-user access.
- **Indexing is synchronous.** Upload, extraction, chunking, embedding and storage happen in the upload request. This is fine for study notes; if a request ever exceeds a few seconds, move only that step to a background task.
- **Chunks never cross pages**, so each citation names exactly one page. Defaults: 350 words with 60 overlap, which keeps chunks under the 512-token limit of `bge-small-en-v1.5` (the guide's 500 to 800 token range would be truncated by this model).
- **Retrieval:** exact cosine search in pgvector, filtered by user and (optionally) selected documents, top 6, near-duplicates removed, then a similarity threshold (`RETRIEVAL_MIN_SIMILARITY`, default 0.60, chosen from `evaluation-plan.md`). If nothing passes, the tutor refuses without calling Groq. No reranker or approximate index, because the measured baseline did not need them.
- **Citations come from retrieval metadata.** The model only returns passage numbers; numbers that were not retrieved are ignored.
- **Quizzes:** the model drafts JSON; the backend validates it (4 distinct options, a valid correct option, cited passages that were actually supplied), regenerates up to 3 times, shuffles option order, and saves only valid questions. A quiz can be submitted once (database unique constraint); to practise again, create another quiz.
- **Adaptive rules** (`recommendation_service.py`): fewer than 3 answered questions on a topic is "insufficient data"; under 60% needs revision; 60% to 79% is practicing; 80% and above is doing well. Integer arithmetic keeps the boundaries exact. Thresholds are configuration, not claims about optimal values.
- **Not implemented** (Phase 2 and 3 of the guide): diagnostic quiz, past-paper frequency, viva mode, reminders, mood adaptation, peer matching, conversation history, OCR.

## Frontend (`frontend`)

Next.js App Router with TypeScript and Tailwind. All backend calls go through `lib/api-client.ts` (cookies included, one error shape, `FormData` uploads). `proxy.ts` redirects visitors without a session cookie to `/login`; this is a convenience only, the backend enforces access. Every screen uses `PageContainer` for one shared margin and max width.
