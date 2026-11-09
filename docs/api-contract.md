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
| 403 | Request origin not allowed, or not an administrator (`forbidden`) |
| 404 | Not found, or not yours |
| 409 | Email taken, quiz already submitted, or comparing runs that are not finished (`run_not_finished`) |
| 413 | File over `MAX_UPLOAD_MB` |
| 422 | Invalid input, or not enough material for the request |
| 502 / 503 | AI output unusable / AI service unavailable or not configured / background service not running (`queue_unavailable`) |

## Endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | `{email, password(8-128)}` returns 201 user and sets the cookie |
| POST | `/auth/login` | same body; one generic error for wrong email or password |
| POST | `/auth/logout` | 204, clears the cookie |
| GET | `/auth/me` | current user: `{id, email, is_admin, created_at}` |
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
| GET | `/ready` | `{status, database, redis}`; 503 when either is unreachable |

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

## Evaluation Lab (administrators only)

All endpoints below return 403 `forbidden` for a signed-in user who is not an administrator and 401 when signed out. Datasets and runs belong to the user who created them; anyone else's id returns 404.

| Method | Path | Notes |
|---|---|---|
| GET | `/eval/datasets` | `{items: [{id, name, item_count, answerable_count, created_at}], total}` |
| POST | `/eval/runs` | `{dataset_id, retrieval_mode?: "dense"\|"hybrid", min_similarity?: -1..1}`; 202 with the run (`status: "queued"`) and a job is queued. 503 `queue_unavailable` if the queue cannot be reached (the run is stored as `failed`). |
| GET | `/eval/runs?limit&offset` | `{items: [Run], total}`, newest first |
| GET | `/eval/runs/{id}` | one run; poll while `status` is `queued` or `running` (`items_done` / `items_total` show progress) |
| GET | `/eval/runs/{id}/results?outcome=all\|failed\|passed&limit&offset` | per-question results in dataset order; `failed` includes questions that could not be scored |
| GET | `/eval/compare?runs=<id>&runs=<id>` | 2 to 4 completed runs; returns `{runs, config_diff}` where `config_diff` lists only settings that differ |

`Run`: `{id, dataset_id, dataset_name, status, config, metrics, error_message, items_done, items_total, created_at, started_at, finished_at}`. `status` is `queued`, `running`, `completed` or `failed`. `config` is the snapshot used (`retrieval_mode`, `min_similarity`, `depth`, `embedding_model`). `metrics` (completed runs only): `n_answerable`, `n_unanswerable`, `n_errors`, `hit_rate`, `precision` and `ndcg` keyed by K (`"1"`, `"3"`, `"5"`, `"10"`), `mrr`, `ci` (95% bootstrap intervals for `hit_rate@5` and `mrr`), `abstention` (`tp`, `fn`, `fp`, `tn`, `precision`, `recall`, `f1`, `accuracy`), `pass_rate`, `latency_ms` (`p50`, `p95`).

`Result`: `{id, question, answerable, question_type, concept, gold_document_title, gold_page, answered, passed, first_relevant_rank, retrieved: [{rank, chunk_id, document_title, page_number, similarity, relevant}], latency_ms, error}`. Retrieved chunk text is not returned.
