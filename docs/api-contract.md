# API contract

Base path `/api/v1`. JSON unless noted. Authentication is the `access_token` httpOnly cookie set by register and login. Interactive docs: `/docs` on the running backend.

## Errors

Every error uses one shape:

```json
{ "error": { "code": "not_found", "message": "Document not found", "details": [] } }
```

`details` appears only for `validation_error` (422) and lists `{ "field", "message" }`. Unexpected failures return 500 with a generic message; details are logged, never returned.

| Status | Meaning |
|---|---|
| 400 | Invalid upload (type, signature, empty) |
| 401 | Not signed in, or wrong credentials |
| 403 | Request origin not allowed |
| 404 | Not found, or not yours |
| 409 | Email taken, or quiz already submitted |
| 413 | File over `MAX_UPLOAD_MB` |
| 422 | Invalid input, or not enough material for the request |
| 502 / 503 | AI output unusable / AI service unavailable or not configured |

## Endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | `{email, password(8-128)}` returns 201 user and sets the cookie |
| POST | `/auth/login` | same body; one generic error for wrong email or password |
| POST | `/auth/logout` | 204, clears the cookie |
| GET | `/auth/me` | current user |
| GET | `/documents?limit&offset` | `{items, total}`, newest first |
| POST | `/documents` | multipart `file` (+ optional `title`); returns the document with `status` `ready` or `failed` (with `error_message`) |
| GET | `/documents/{id}` | one owned document |
| DELETE | `/documents/{id}` | 204; removes chunks, vectors and the stored file |
| POST | `/tutor/ask` | `{question, document_ids?}` returns `{answer, citations[], insufficient_evidence}` |
| POST | `/quizzes/generate` | `{topic?, document_ids?, difficulty, num_questions(3-10)}` returns the quiz without answers |
| GET | `/quizzes?limit&offset` | list with each quiz's attempt summary |
| GET | `/quizzes/{id}` | questions and options only, never correct answers |
| POST | `/quizzes/{id}/attempts` | `{answers:[{question_id, selected_index}]}`, every question exactly once; returns the scored result |
| GET | `/quizzes/{id}/attempt` | the saved result (404 until submitted) |
| GET | `/progress/summary` | dashboard numbers, needs-revision topics, next step, recent activity, score history |
| GET | `/progress/topics` | per-topic accuracy, status, recommendation, plus the `rules` thresholds |
| GET | `/health` | `{status, database}`; 503 when the database is unreachable |

### Tutor response

```json
{
  "answer": "Recursion is a method where a function calls itself...",
  "citations": [
    { "document_id": "uuid", "document_title": "Programming Notes", "page_number": 12, "chunk_id": "uuid" }
  ],
  "insufficient_evidence": false
}
```

Citations are built from retrieval metadata. When `insufficient_evidence` is true, `citations` is empty.

### Attempt result

`score`, `total_questions`, `percent`, one entry per question (`selected_index`, `correct_index`, `is_correct`, `explanation`, `sources[]`), the topic's `topic_status`, and a `recommendation` with `action` and a plain-language `message`.
