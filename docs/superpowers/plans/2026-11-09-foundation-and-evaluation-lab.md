# Foundation and Evaluation Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing EduRAG app onto Guide v2's foundation (Midnight & Ice tokens, Redis + ARQ worker, readiness check, CI) and ship an Evaluation Lab slice that measures retrieval and abstention for the current pipeline, then use it to compare dense retrieval against hybrid (dense + full-text, RRF) retrieval.

**Architecture:** The backend stays a modular monolith. Evaluation runs are rows in PostgreSQL (`eval_runs`, `eval_results`) executed by an ARQ worker that reads jobs from Redis and writes progress counters to the database; the API enqueues and the browser polls. Metrics are pure functions in `app/evaluation/metrics.py`. Hybrid retrieval is an option on the existing `retrieval_service.retrieve`, off by default until the Lab shows it helps.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 18 + pgvector (full-text via a generated `tsvector` column), `arq==0.28.0` (pulls `redis` 5.x), Next.js 16, Tailwind 4, Recharts, Vitest, pytest.

**Spec:** `docs/IMPLEMENTATION_GUIDE.md` (Guide v2) sections 3, 5, 7 (steps 3–4), 10, 13, 14, 15, 16 (phases 0 and 8). Owner decisions are recorded at the top of `CLAUDE.md` and override the guide.

## Global Constraints

- Evolve in place: keep `frontend/` and `backend/`; do not rename to `apps/web`/`apps/api`. New backend package is `backend/app/evaluation/`.
- Approved infrastructure: PostgreSQL + pgvector, Redis, one ARQ worker. Not approved: MinIO, Mailpit, Celery, Kafka, Kubernetes. Docker is not installed on this machine; nothing may require it.
- Redis is installed (Homebrew `redis` 8.10.2) and answered `PONG` on `localhost:6379`.
- Python `redis` client is pulled in by `arq==0.28.0` (resolves to `redis==5.3.1`); do not pin it separately.
- Design: Midnight & Ice tokens live in CSS variables in `frontend/styles/tokens.css`; components never hard-code hex. Glass only on floating layers; glow only as background atmosphere; no glow on buttons, text, cards or charts. Same left/right page margin on every screen via `PageContainer` (16 px mobile, 24 px desktop, app max width 1200 px). No trailing full stop in headings or buttons.
- WCAG 2.1 AA (4.5:1 normal text) in light and dark, enforced by a test (Task 1). Guide hex values that fail are adjusted and each deviation is commented in `tokens.css`.
- Every query on user content filters by the authenticated user; evaluation data is visible only to the user who created it. Evaluation endpoints require `is_admin`.
- Error format stays `{"error": {"code", "message", "details"}}` (`AppError`). Lists use `limit`/`offset` like `GET /documents`.
- Never claim a metric that has not been run. Results written into docs must come from an actual run with the real embedding model.
- Run checks from `backend/` (`.venv/bin/pytest`, `.venv/bin/ruff check .`) and `frontend/` (`npm test`, `npm run typecheck`, `npm run lint`). Baseline before this plan: 94 backend tests, 31 frontend tests, all green.
- Commit steps below run only after the owner has agreed to commits in this session (project rule: commit only when asked). Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Dataset item whose gold document or page is not in the user's library: the item is recorded as an error, excluded from every metric, and the run still completes.
- Empty dataset, or a dataset with only answerable (or only unanswerable) items: metrics return 0.0 where a ratio is undefined; no division error, no `NaN` in JSON.
- Another user's documents sharing a title with the gold document: never used for retrieval or gold matching, in dense and in hybrid mode.
- Redis down or worker not running when a run is started: `POST /eval/runs` returns a clear 503 and leaves no run stuck in `queued`.
- A single item raising during retrieval (embedder error): that item is recorded with `error`, the run continues and finishes `completed`; an error outside the loop marks the run `failed` with a safe message.
- Queries containing full-text operators or punctuation (`"`, `&`, `:*`, `'`, empty after stripping) in hybrid mode: no SQL error, falls back to dense-only ranking for that query.

---

### Task 1: Midnight & Ice tokens, contrast test, shell restyle

**Files:**
- Create: `frontend/styles/tokens.css`, `frontend/lib/contrast.ts`, `frontend/tests/tokens.test.ts`
- Modify: `frontend/app/globals.css`, `frontend/app/layout.tsx`, `frontend/components/layout/page-container.tsx`, `frontend/components/layout/app-shell.tsx`, `frontend/components/ui/button.tsx`, `frontend/components/ui/panel.tsx`
- Test: `frontend/tests/tokens.test.ts`; existing `frontend/tests/app-shell.test.tsx` must keep passing

**Interfaces:**
- Produces: CSS variables `--brand`, `--brand-hover`, `--brand-soft`, `--bg`, `--surface`, `--surface-2`, `--text`, `--text-muted`, `--text-subtle`, `--border`, `--success`, `--warning`, `--danger`, `--glass-bg`, `--glass-border`, `--shadow-sm|md|lg`, `--shadow-brand`; plus `--on-brand` (text color used on solid brand fills). Tailwind aliases used by existing components keep working: `primary` → `--brand` fill, `primary-hover`, `selected` → `--brand-soft`, `background` → `--bg`, `foreground` → `--text`, `muted` → `--text-muted`, `surface`, `border`, `success`, `warning`, `danger`. New aliases: `surface-2`, `subtle`, `on-brand`.
- Produces: `contrastRatio(foreground: string, background: string): number` in `lib/contrast.ts` (hex `#rrggbb` in, WCAG relative-luminance ratio out).

- [ ] **Step 1: Write the failing test** `tests/tokens.test.ts`: `contrastRatio("#000000","#ffffff")` ≈ 21; `contrastRatio("#1F6FFF","#FFFFFF")` ≈ 4.4 (two decimals). Then parse `styles/tokens.css` (light = the `:root` block, dark = the block inside `@media (prefers-color-scheme: dark)`), and for each theme assert ≥ 4.5 for these pairs: `text/bg`, `text/surface`, `text-muted/bg`, `text-muted/surface`, `text-subtle/surface`, `on-brand/brand`, `brand/bg` (links), `success/surface`, `warning/surface`, `danger/surface`. Also assert the light and dark blocks define exactly the same set of variable names.
- [ ] **Step 2: Run** `cd frontend && npx vitest run tests/tokens.test.ts` — Expected: FAIL (module and file missing).
- [ ] **Step 3: Implement** `lib/contrast.ts`, then `styles/tokens.css` with the guide's section 13 light/dark values. Measured against the guide's own hexes: white on `#1F6FFF` is 4.40, `#1F6FFF` on `#F4F7FC` is 4.09, `#8D9BB5` on white is 2.80, `#12A27A` on white is 3.24; dark white on `#3D86FF` is 3.47 and `#62728F` on `#0A1426` is 3.79. Adjust only what the test requires: keep `--brand` `#1F6FFF`/`#3D86FF` for focus rings, accents and large display text; make the solid-fill and link color `--brand-hover`-level (`#155BDB`) in light; use midnight `#050B18` as `--on-brand` in dark; darken `--text-subtle` and the status colors until the test passes. Comment each deviation inline as `/* deviation from guide 13: <pair> was <ratio> */`.
- [ ] **Step 4: Wire up.** `globals.css` imports `../styles/tokens.css` and maps tokens in `@theme inline`; keep `:focus-visible` as a 2 px `--brand` ring with 2 px offset. `layout.tsx` swaps Geist for Inter (`next/font/google`, variable font, `--font-sans`). `PageContainer`: `max-w-[1200px]`, `PAGE_GUTTER = "px-4 sm:px-6"` (the top bar uses the same constant). Radii: controls 10 px, panels 16 px. `Button` primary uses `bg-primary text-on-brand` plus `--shadow-brand` (primary buttons only). `Panel`: `--shadow-sm`. `AppShell` mobile top bar uses glass (`--glass-*`, `backdrop-filter: blur(18px) saturate(140%)`) with a solid fallback inside `@supports not (backdrop-filter: blur(1px))` and `@media (prefers-reduced-transparency: reduce)`. Read `frontend/node_modules/next/dist/docs/` for the current `next/font` API before editing `layout.tsx`.
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run lint` — Expected: all pass (31 existing + new tests).
- [ ] **Step 6: Visual check.** Start `npm run dev` (backend not required for `/login`), open `/login` at 390 px and 1440 px in light and dark (Playwright screenshot or browser devtools emulation), confirm identical left/right margins and no horizontal scroll. If the app cannot be viewed, say so in the report.
- [ ] **Step 7: Commit** `feat(frontend): Midnight & Ice design tokens with contrast test`.

---

### Task 2: Redis settings, job queue abstraction, readiness endpoint

**Files:**
- Create: `backend/app/workers/__init__.py`, `backend/app/workers/queue.py`, `backend/app/tests/test_ready.py`
- Modify: `backend/app/core/config.py`, `backend/app/api/routes/health.py`, `backend/requirements.txt`, `backend/.env.example`

**Interfaces:**
- Produces: `Settings.redis_url: str = "redis://localhost:6379/0"`.
- Produces: `class JobQueue(Protocol): def enqueue(self, function: str, *args: str) -> None` — raises `AppError(503, "queue_unavailable", "The background service is not running. Please try again shortly")` on any connection failure.
- Produces: `get_job_queue() -> JobQueue` (FastAPI dependency; real implementation wraps `arq.create_pool` and is called from sync route threads via `anyio.from_thread.run`), `redis_available() -> bool` (2 s timeout).
- Produces: `GET /api/v1/ready` → `{"status": "ok"|"degraded", "database": "ok"|"unavailable", "redis": "ok"|"unavailable"}`, HTTP 503 when degraded. `/health` is unchanged.

- [ ] **Step 1: Add `arq==0.28.0` to `requirements.txt`** and run `.venv/bin/pip install -r requirements-dev.txt`. Confirm the release is at least two weeks old on PyPI (project rule); if not, step down to the previous stable and say so.
- [ ] **Step 2: Write the failing tests** in `test_ready.py`: `test_ready_ok` (monkeypatch `redis_available` to `True` → 200, all `"ok"`); `test_ready_degraded_when_redis_down` (patched `False` → 503, `redis == "unavailable"`, `database == "ok"`); `test_real_queue_raises_queue_unavailable_for_dead_redis` (settings `redis_url="redis://localhost:1/0"` → `enqueue("x")` raises `AppError` with code `queue_unavailable`).
- [ ] **Step 3: Run** `.venv/bin/pytest app/tests/test_ready.py -v` — Expected: FAIL (modules missing).
- [ ] **Step 4: Implement** the setting, `workers/queue.py`, and the `/ready` route in `health.py` (keep database check logic shared with `/health`). Add `REDIS_URL=redis://localhost:6379/0` to `.env.example`.
- [ ] **Step 5: Run** `.venv/bin/pytest && .venv/bin/ruff check .` — Expected: all pass.
- [ ] **Step 6: Commit** `feat(backend): redis settings, job queue wrapper and /ready endpoint`.

---

### Task 3: Evaluation metrics (pure functions)

**Files:**
- Create: `backend/app/evaluation/__init__.py`, `backend/app/evaluation/metrics.py`, `backend/app/tests/test_eval_metrics.py`

**Interfaces:**
- Produces, all in `metrics.py` (per-item inputs are `rels: Sequence[bool]`, relevance of the ranked retrieved list, best first):
  - `hit_at_k(rels, k: int) -> float` (1.0 or 0.0)
  - `precision_at_k(rels, k: int) -> float` (denominator is `k`)
  - `reciprocal_rank(rels) -> float` (0.0 when none relevant)
  - `ndcg_at_k(rels, k: int, n_relevant: int) -> float` (binary gain, `log2(i+1)` discount, ideal list has `min(k, n_relevant)` ones; 0.0 when `n_relevant == 0`)
  - `mean(values: Sequence[float]) -> float` (0.0 for empty)
  - `percentile(values: Sequence[float], p: float) -> float` (linear interpolation; 0.0 for empty)
  - `bootstrap_ci(values: Sequence[float], resamples: int = 1000, confidence: float = 0.95, seed: int = 0) -> tuple[float, float]` (percentile method of the mean; `(0.0, 0.0)` for empty)
  - `@dataclass(frozen=True) class AbstentionMatrix: tp: int; fn: int; fp: int; tn: int` with properties `precision`, `recall`, `f1`, `accuracy` (0.0 when the denominator is 0) and `build_abstention_matrix(pairs: Sequence[tuple[bool, bool]]) -> AbstentionMatrix` where each pair is `(answerable, answered)`; answerable+answered is `tp`, answerable+abstained `fn`, unanswerable+answered `fp`, unanswerable+abstained `tn`.

- [ ] **Step 1: Write the failing tests.** For `rels=[False, True, False, True]`: `hit_at_k(rels,1)==0.0`, `hit_at_k(rels,2)==1.0`, `precision_at_k(rels,3)==pytest.approx(1/3)`, `reciprocal_rank(rels)==0.5`, `ndcg_at_k(rels,3,n_relevant=2)==pytest.approx(0.3869, abs=1e-4)`. Edge cases: all functions on `[]` return 0.0; `ndcg_at_k([True],5,n_relevant=1)==1.0`; `ndcg_at_k([True],5,n_relevant=0)==0.0`; `percentile([1,2,3,4], 50)==2.5`, `percentile([1,2,3,4], 95)==pytest.approx(3.85)`; `bootstrap_ci([1.0]*20)==(1.0,1.0)`, same seed gives the same interval, interval for `[0,1]*50` contains 0.5 and `lo <= hi`. Matrix: pairs `[(True,True),(True,False),(False,True),(False,False)]` → `tp=fn=fp=tn=1`, `precision==0.5`, `recall==0.5`, `f1==0.5`, `accuracy==0.5`; empty and all-unanswerable-abstained inputs give `f1==0.0` without raising.
- [ ] **Step 2: Run** `.venv/bin/pytest app/tests/test_eval_metrics.py -v` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the functions above (no numpy dependency; `random.Random(seed)` for the bootstrap).
- [ ] **Step 4: Run** the same command — Expected: PASS, then `.venv/bin/ruff check .` clean.
- [ ] **Step 5: Commit** `feat(backend): retrieval and abstention metrics for the evaluation lab`.

---

### Task 4: Evaluation data model, admin flag, dataset import

**Files:**
- Create: `backend/app/models/evaluation.py`, `backend/app/evaluation/datasets.py`, `backend/eval/datasets/sample_course.jsonl`, `backend/app/scripts/make_admin.py`, `backend/alembic/versions/<new>_evaluation_lab.py`, `backend/app/tests/test_eval_datasets.py`
- Modify: `backend/app/models/user.py`, `backend/app/models/__init__.py`, `backend/app/schemas/auth.py`, `backend/app/api/deps.py`, `frontend/types/api.ts`

**Interfaces:**
- Produces: `User.is_admin: bool` (default `False`, `server_default` false); `UserOut.is_admin: bool`; `require_admin(user: CurrentUser) -> User` dependency in `deps.py` raising `AppError(403, "forbidden", "This area is for administrators")`; `AdminUser = Annotated[User, Depends(require_admin)]`.
- Produces models in `models/evaluation.py` (UUID PKs, UTC timestamps like existing models):
  - `EvalDataset(id, user_id→users CASCADE, name, created_at)`, unique `(user_id, name)`
  - `EvalItem(id, dataset_id→eval_datasets CASCADE, question: Text, answerable: bool, gold_document_title: str|None, gold_page: int|None, question_type: str, concept: str|None)`
  - `EvalRun(id, user_id, dataset_id, status: str in {"queued","running","completed","failed"}, config: JSONB, metrics: JSONB|None, error_message: str|None, items_done: int, items_total: int, created_at, started_at|None, finished_at|None)`
  - `EvalResult(id, run_id→eval_runs CASCADE, item_id→eval_items CASCADE, answered: bool|None, passed: bool|None, first_relevant_rank: int|None, retrieved: JSONB, latency_ms: float|None, error: str|None)`, unique `(run_id, item_id)`
- Produces in `datasets.py`: `class EvalItemIn(BaseModel)` with `question: str (3..1000)`, `answerable: bool`, `gold_document_title: str|None`, `gold_page: int|None (>=1)`, `question_type: Literal["factual","conceptual","multi_hop","numeric"] = "factual"`, `concept: str|None`; validator: answerable items require both gold fields, unanswerable items forbid them. `load_jsonl(path: Path) -> list[EvalItemIn]` (error names the line number) and `import_dataset(db, user_id: uuid.UUID, name: str, items: list[EvalItemIn]) -> EvalDataset` (replaces an existing dataset of that name for the user).
- Produces: `app/scripts/make_admin.py` — `python -m app.scripts.make_admin <email>` sets `is_admin`, exits non-zero with a message if the user does not exist.

- [ ] **Step 1: Write the failing tests** in `test_eval_datasets.py`: `test_load_sample_dataset` (the bundled `sample_course.jsonl` loads; 15 answerable, 8 unanswerable; every `(gold_document_title, gold_page)` exists in `eval.corpus.CORPUS` with page in range); `test_answerable_requires_gold` and `test_unanswerable_rejects_gold` (`ValidationError`); `test_load_jsonl_reports_line_number` (bad JSON on line 2 → message contains "line 2"); `test_import_dataset_replaces_same_name` (importing twice leaves one dataset with the new items); `test_require_admin_forbids_regular_user` (a throwaway route using `AdminUser`, or call the dependency directly: regular user → `AppError` 403; user with `is_admin=True` passes); `test_me_returns_is_admin`.
- [ ] **Step 2: Run** `.venv/bin/pytest app/tests/test_eval_datasets.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** models, schema, `require_admin`, `datasets.py`, and `make_admin.py`. Generate `sample_course.jsonl` from `ANSWERABLE` and `UNANSWERABLE` in `eval/corpus.py` (`question_type` `"factual"`, `concept` = document title for answerable items) with a one-off snippet; do not hand-type the items.
- [ ] **Step 4: Migration.** `cd backend && .venv/bin/alembic revision --autogenerate -m "evaluation lab"`, then review the file: it must add `users.is_admin` with `server_default=sa.false()`, the four tables, and the unique constraints; remove any unrelated drift autogenerate reports. Apply to a scratch database (`createdb edurag_plan_check`, `DATABASE_URL=… .venv/bin/alembic upgrade head`, then `downgrade -1` and `upgrade head` again); drop it afterwards.
- [ ] **Step 5: Frontend type.** Add `is_admin: boolean` to `User` in `frontend/types/api.ts`.
- [ ] **Step 6: Run** `.venv/bin/pytest && .venv/bin/ruff check .` and `cd ../frontend && npm run typecheck` — Expected: pass.
- [ ] **Step 7: Commit** `feat(backend): evaluation data model, admin flag and dataset import`.

---

### Task 5: Evaluation runner and lab seed command

**Files:**
- Create: `backend/app/evaluation/runner.py`, `backend/app/evaluation/service.py`, `backend/eval/seed_lab.py`, `backend/app/tests/test_eval_runner.py`
- Modify: `backend/app/services/retrieval_service.py` (type only: accept `mode` now, behavior arrives in Task 6)

**Interfaces:**
- Consumes: Task 3 metrics, Task 4 models, `retrieval_service.retrieve`, `Embedder`.
- Produces in `service.py`:
  - `class RunConfig(BaseModel)`: `retrieval_mode: Literal["dense","hybrid"] = "dense"`, `min_similarity: float` (default from settings, range -1..1), `depth: int = 10` (fixed ranking depth), `embedding_model: str` (from settings). Stored verbatim in `EvalRun.config`.
  - `create_run(db, user_id: uuid.UUID, dataset_id: uuid.UUID, overrides: dict[str, object]) -> EvalRun` — dataset must belong to the user else `NotFoundError("Dataset")`; sets `status="queued"`, `items_total=len(items)`, config snapshot.
- Produces in `runner.py`: `execute_run(db: Session, embedder: Embedder, run_id: uuid.UUID) -> None`. Behavior contract, per item (ranking retrieved with `retrieve(..., top_k=depth, min_similarity=-1.0, mode=config.retrieval_mode)` so the full ranked list is available):
  - Gold resolution: an answerable item is *resolvable* only if the run owner has a ready document with title `gold_document_title` containing a chunk on `gold_page`; otherwise the result gets `error="Gold passage not found in your library"`, `answered/passed = None`, and the item is excluded from every metric and the abstention matrix.
  - `rels[i]` is true when ranked chunk `i` has `document_title == gold_document_title and page_number == gold_page`; `n_relevant` is the count of the owner's chunks matching the gold pair.
  - `answered = best similarity in the ranked list >= config.min_similarity` (false for an empty list).
  - `passed`: answerable → `answered and hit_at_k(rels, 5) == 1.0`; unanswerable → `not answered`.
  - `retrieved` stores up to `depth` entries `{rank, chunk_id, document_title, page_number, similarity, relevant}` (no chunk text), `latency_ms` is the wall time of that retrieval call.
  - Exceptions inside one item are caught (`except Exception` is justified here and logged with `logger.exception`) and stored as `error="Retrieval failed for this item"`.
  - Run status goes `queued → running → completed`; `items_done` is committed after every item; `started_at`/`finished_at` set. An exception outside the item loop sets `status="failed"`, `error_message="The evaluation could not be completed"` and is logged.
  - `metrics` (JSON, floats rounded to 4 places): `{"n_answerable","n_unanswerable","n_errors","hit_rate":{"1","3","5","10"},"precision":{…},"ndcg":{…},"mrr","ci":{"hit_rate@5":[lo,hi],"mrr":[lo,hi]},"abstention":{"tp","fn","fp","tn","precision","recall","f1","accuracy"},"pass_rate","latency_ms":{"p50","p95"}}` — ranking metrics over resolvable answerable items only; latency over all non-error items.
- Produces: `eval/seed_lab.py` — `python -m eval.seed_lab --email <user email> [--run dense,hybrid]`: builds the sample corpus in that existing user's library via `eval.run_retrieval_eval.build_corpus` (skip documents whose title already exists), imports `sample_course.jsonl` as dataset `"Sample course"`, and with `--run` executes each listed mode synchronously via `create_run` + `execute_run` and prints the headline metrics.

- [ ] **Step 1: Write the failing tests** in `test_eval_runner.py` using `db`, `FakeEmbedder` and `make_pdf` (create a user and documents through `document_service.create_and_process` as in `test_documents.py`): `test_perfect_retrieval_metrics` (two documents, three answerable items whose questions reuse words from their gold page and one off-topic unanswerable item at `min_similarity=0.2`: `hit_rate["1"]==1.0`, `mrr==1.0`, `abstention.tn==1`, run `completed`, `items_done==items_total`); `test_unresolvable_gold_is_error_and_excluded` (gold title absent → result `error` set, `n_errors==1`, not counted in `n_answerable`); `test_other_users_document_with_same_title_is_ignored` (user B has a same-titled document; run owned by A never returns B's chunk ids and an A item with gold only in B's library is unresolvable); `test_item_exception_does_not_stop_run` (embedder that raises on one question → that result has `error`, run `completed`); `test_run_failure_marks_failed` (patch `compute_metrics`/the metrics step to raise → `status=="failed"`, `error_message` is the safe sentence, no exception text); `test_empty_dataset_completes_with_zero_metrics` (no items → `completed`, all metrics 0.0, JSON-serialisable with `allow_nan=False`); `test_create_run_rejects_other_users_dataset` (`NotFoundError`); `test_config_snapshot_is_stored` (`mode="hybrid"` override appears in `run.config`).
- [ ] **Step 2: Run** `.venv/bin/pytest app/tests/test_eval_runner.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** `service.py` and `runner.py` per the contract; add `mode: Literal["dense","hybrid"] = "dense"` to `retrieve`'s signature (accepted and ignored until Task 6) and `rrf_score: float | None = None` to `RetrievedChunk` is deferred to Task 6.
- [ ] **Step 4: Run** `.venv/bin/pytest && .venv/bin/ruff check .` — Expected: pass.
- [ ] **Step 5: Real-model smoke test.** `createdb edurag_eval` if absent, register a user in it, run migrations with `DATABASE_URL` pointing at it, then `DATABASE_URL=… .venv/bin/python -m eval.seed_lab --email <that user> --run dense`. Expected: prints hit rate, MRR, abstention F1 for 15 + 8 items without error. Record the numbers for Task 12 (do not commit them yet). If the embedding model is not cached, the first run downloads about 130 MB.
- [ ] **Step 6: Commit** `feat(backend): evaluation runner, config snapshots and lab seed command`.

---

### Task 6: Hybrid retrieval (dense + full-text, reciprocal rank fusion)

**Files:**
- Create: `backend/alembic/versions/<new>_chunk_fulltext.py`, `backend/app/tests/test_hybrid_retrieval.py`
- Modify: `backend/app/models/document.py`, `backend/app/services/retrieval_service.py`, `backend/app/core/config.py`, `backend/app/tests/conftest.py` (only if the GIN index must be created like `uq_topics_user_lower_name`)

**Interfaces:**
- Produces: `DocumentChunk.tsv` — PostgreSQL generated column `to_tsvector('english', content)` (SQLAlchemy `Computed(..., persisted=True)`, `TSVECTOR`, deferred) plus a GIN index `ix_document_chunks_tsv`.
- Produces: `reciprocal_rank_fusion(rankings: Sequence[Sequence[uuid.UUID]], k: int = 60) -> list[tuple[uuid.UUID, float]]` in `retrieval_service.py` — score(d) = Σ 1/(k + rank_i(d)) with 1-based ranks, sorted by score descending, ties broken by first appearance.
- Produces: `retrieve(..., mode: Literal["dense","hybrid"] | None = None)`; `None` means `Settings.retrieval_mode` (new setting, default `"dense"`, valid `"dense"|"hybrid"`). `RetrievedChunk.rrf_score: float | None = None` (set in hybrid mode only).
- Hybrid algorithm: dense top 40 and full-text top 40 (ordered by `ts_rank_cd` using `websearch_to_tsquery('english', query)`), both restricted exactly as today (user, ready documents, optional document scope); the full-text query also selects each row's cosine distance so every candidate has a similarity. Fuse with RRF. The similarity gate is unchanged: a candidate below `min_similarity` is dropped even if it matched by keyword, so abstention behavior does not change; fusion only adds keyword-matched candidates that pass the gate and reorders. Then the existing near-duplicate filter and `top_k` apply. If the tsquery is empty (query reduces to nothing), skip the full-text list and return dense ranking.

- [ ] **Step 1: Write the failing tests** in `test_hybrid_retrieval.py`: `test_rrf_scores` (`[[a,b],[b,a]]` → both `1/61 + 1/62`, tie order `a` then `b`; `[[a,b,c],[c]]` → scores `c = 1/63 + 1/61`, `a = 1/61`, `b = 1/62`, so order `c, a, b`); `test_rrf_empty` (`[]` and `[[]]` → `[]`); `test_dense_mode_unchanged` (same ids/order as before for an existing retrieval fixture); `test_hybrid_includes_keyword_match_that_passes_gate` (document with a rare token such as "zyxophore" in one chunk; query containing it returns that chunk in hybrid mode); `test_hybrid_never_returns_other_users_chunks` (user B owns a chunk containing the keyword; A's hybrid query never returns it); `test_hybrid_respects_document_scope`; `test_hybrid_still_abstains_below_threshold` (unrelated query with a high `min_similarity` returns `[]`); parametrised `test_hybrid_survives_odd_queries` for `'"unbalanced'`, `"a & | b"`, `"foo:*"`, `"'"`, `"   "` (no exception; returns a list).
- [ ] **Step 2: Run** `.venv/bin/pytest app/tests/test_hybrid_retrieval.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** the model column, migration (autogenerate then hand-check: it must backfill existing rows automatically because the column is generated; verify on the scratch database), setting, RRF function, and hybrid branch. Keep `retrieve` readable: extract `_dense_candidates` and `_fulltext_candidates` helpers rather than growing one function.
- [ ] **Step 4: Run** `.venv/bin/pytest && .venv/bin/ruff check .` — Expected: all existing retrieval/tutor tests still pass unchanged.
- [ ] **Step 5: Commit** `feat(backend): optional hybrid retrieval with reciprocal rank fusion`.

---

### Task 7: Evaluation API and worker job

**Files:**
- Create: `backend/app/api/routes/evaluation.py`, `backend/app/schemas/evaluation.py`, `backend/app/workers/settings.py`, `backend/app/workers/tasks.py`, `backend/app/tests/test_eval_api.py`
- Modify: `backend/app/api/router.py`, `backend/app/evaluation/service.py`

**Interfaces:**
- Consumes: `AdminUser`, `get_job_queue`, `create_run`, `execute_run`, models from Tasks 2–5.
- Produces endpoints (all `Depends(require_admin)`; every query filtered by `user_id == admin.id`; foreign or missing ids → 404 via `NotFoundError`):
  - `GET /eval/datasets` → `{items: [{id, name, item_count, answerable_count, created_at}], total}`
  - `POST /eval/runs` body `{dataset_id: UUID, retrieval_mode?: "dense"|"hybrid", min_similarity?: float}` → 202 `RunOut`; enqueues `run_eval_job` with `str(run.id)`; if `enqueue` raises, the run is marked `failed` with message "The background service is not running" and the 503 is returned
  - `GET /eval/runs?limit&offset` → `{items: [RunOut], total}`, newest first
  - `GET /eval/runs/{run_id}` → `RunOut`
  - `GET /eval/runs/{run_id}/results?outcome=all|failed|passed&limit&offset` → `{items: [ResultOut], total}` where `ResultOut = {id, question, answerable, question_type, concept, answered, passed, first_relevant_rank, retrieved: [...], latency_ms, error}` (outcome `failed` means `passed is False` or `error` set)
  - `GET /eval/compare?runs=<id>&runs=<id>` (2 to 4 completed runs) → `{runs: [RunOut], config_diff: {key: [value per run]}}` with only keys whose values differ
  - `RunOut = {id, dataset_id, dataset_name, status, config, metrics, error_message, items_done, items_total, created_at, started_at, finished_at}`
- Produces: `workers/tasks.py::async def run_eval_job(ctx: dict, run_id: str) -> None` (opens its own `Session`, uses `get_embedder()`, calls `execute_run` through `asyncio.to_thread`); `workers/settings.py::WorkerSettings` with `functions=[run_eval_job]`, `redis_settings=RedisSettings.from_dsn(get_settings().redis_url)`, `job_timeout=1800`, `max_tries=1`. Start with `.venv/bin/arq app.workers.settings.WorkerSettings`.

- [ ] **Step 1: Write the failing tests** in `test_eval_api.py` with a `FakeQueue` overriding `get_job_queue` (records calls; a variant that raises `AppError(503,"queue_unavailable",…)`): `test_non_admin_forbidden_on_every_endpoint` (each route → 403 `forbidden`); `test_unauthenticated_is_401`; `test_start_run_enqueues_and_returns_queued` (202, `status=="queued"`, queue received `("run_eval_job", run_id)`); `test_start_run_queue_down_returns_503_and_marks_failed`; `test_run_visible_only_to_creator` (second admin gets 404 on run, results, and compare); `test_dataset_of_other_admin_404`; `test_results_filter_failed` (seed one passed, one failed, one errored result → `outcome=failed` returns two); `test_compare_requires_two_to_four_completed_runs` (one id → 422; queued run → 409 `run_not_finished`); `test_compare_config_diff_lists_only_differences`; `test_run_eval_job_executes_run` (monkeypatch `execute_run`, call the coroutine with a test session factory, assert it was called with the run id; unknown id → logs and returns without raising).
- [ ] **Step 2: Run** `.venv/bin/pytest app/tests/test_eval_api.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** schemas, routes (thin; logic in `evaluation/service.py`), and the worker modules; register the router in `api/router.py`.
- [ ] **Step 4: Run** `.venv/bin/pytest && .venv/bin/ruff check .` — Expected: pass.
- [ ] **Step 5: Real worker check** (the one thing tests do not cover). With Redis running, start `.venv/bin/arq app.workers.settings.WorkerSettings` in one terminal and `.venv/bin/uvicorn app.main:app` against the `edurag_eval` database in another; sign in as the seeded admin (`python -m app.scripts.make_admin <email>`), `POST /api/v1/eval/runs` with the dataset id from `GET /eval/datasets` (browser devtools or `curl -c/-b` cookie jar; do not print the cookie), and poll `GET /eval/runs/{id}` until `completed`. Expected: `items_done` rises to 23 and `metrics` is populated. Then stop the worker and POST again — Expected: 202 is not returned from a dead Redis; with Redis stopped the response is 503 `queue_unavailable`.
- [ ] **Step 6: Commit** `feat(backend): evaluation lab API and ARQ worker job`.

---

### Task 8: Evaluation Lab screens

**Files:**
- Create: `frontend/app/(student)/evaluation/page.tsx`, `frontend/app/(student)/evaluation/runs/[runId]/page.tsx`, `frontend/components/evaluation/{stat-grid,start-run-panel,run-list,run-view,confusion-matrix,hit-rate-chart,result-list,compare-panel}.tsx`, `frontend/lib/eval-format.ts`, `frontend/tests/evaluation.test.tsx`
- Modify: `frontend/lib/api.ts` (add `evalApi`), `frontend/types/api.ts`, `frontend/components/layout/nav-items.ts` and `sidebar-nav.tsx` (Evaluation item shown only when `useUser().is_admin`), `frontend/app/globals.css` (stat-grid hairline/star styles only if utilities are not enough)

**Interfaces:**
- Consumes: Task 7 endpoints. Produces `evalApi`: `datasets(signal)`, `startRun({dataset_id, retrieval_mode?, min_similarity?})`, `runs(signal)`, `run(id, signal)`, `results(id, {outcome, limit, offset}, signal)`, `compare(ids, signal)`; matching types `EvalRun`, `EvalMetrics`, `EvalResult`, `EvalCompare` in `types/api.ts`.
- Produces in `eval-format.ts`: `formatPercent(value: number): string` (0.8667 → "86.7%"), `formatDelta(from: number, to: number): { text: string; direction: "up"|"down"|"flat" }` (percentage points, "+6.7 pts"), `formatLatency(ms: number): string` ("1.2 s" at or above 1000, else "840 ms").
- Screens (headings carry no trailing full stop; one primary action per page; loading, empty, error and success states; the page container is `PageContainer`):
  - `/evaluation` — heading "Evaluation Lab"; headline stat grid from the latest completed run (Hit rate at 5, MRR, Abstention F1, p95 latency), each with the change versus the previous completed run; "Start run" panel (dataset select, retrieval mode select Dense/Hybrid, primary button "Start run" disabled while pending); run list with status, mode, progress while running (poll `evalApi.run` every 2 s until `completed` or `failed`, cancel the timer on unmount); compare panel for any two completed runs (metric table with deltas plus config diff). Empty state when no datasets: tells the admin to run `python -m eval.seed_lab`. A 403 shows a calm "This area is for administrators" message, not a retry button.
  - `/evaluation/runs/[runId]` — Hit rate at K bar chart (single blue series, value labels, K = 1, 3, 5, 10), abstention confusion matrix with counts and percentages and the labels from guide section 10, 95% intervals shown as text next to Hit rate at 5 and MRR, latency p50/p95, and the item list (cards, not a table, so it works at 390 px) with All/Failed filter; opening an item shows the retrieved chunks with rank, similarity, and a "gold passage" marker; errored items show their error text.
- Copy rule: say what is measured ("Retrieval only, no answer generation yet"); do not label scores as accuracy of answers.

- [ ] **Step 1: Write the failing tests** in `evaluation.test.tsx` (mock `@/lib/api`): `formatPercent`/`formatDelta`/`formatLatency` cases above incl. flat delta; `StatGrid` renders four captions and values from a metrics fixture and shows "No previous run" instead of a delta when there is only one run; `RunView` renders the confusion matrix counts and the "Retrieval only" note; it polls while `status="running"` (fake timers: after 2 s `evalApi.run` is called again) and stops after `completed`; `StartRunPanel` disables the button while the request is pending and surfaces the 503 message; a 403 from `evalApi.runs` renders the administrators message and no retry button; `ResultList` Failed filter hides passed items and an errored item shows its error text; `SidebarNav` hides "Evaluation" for a non-admin user and shows it for an admin.
- [ ] **Step 2: Run** `cd frontend && npx vitest run tests/evaluation.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** per the contract. Recharts is already installed; use token colors via CSS variables (single-hue blue ramp), never hex in components. Business rules (pass/fail, gate, metrics) stay in the backend; the UI only formats.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint` — Expected: pass.
- [ ] **Step 5: Live check.** With Redis, the worker, the API (admin user, `edurag_eval` database) and `npm run dev` running: start a Dense run from the UI, watch progress reach 100%, open the run detail, start a Hybrid run, then compare the two. Capture screenshots at 390 px and 1440 px in light and dark under `docs/screenshots/` (Playwright `page.screenshot`). If any piece cannot run, state which and why.
- [ ] **Step 6: Commit** `feat(frontend): Evaluation Lab screens`.

---

### Task 9: Run scripts, CI, documentation, and the measured comparison

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `start.sh`, `start.bat`, `README.md`, `docs/architecture.md`, `docs/api-contract.md`, `docs/evaluation-plan.md`, `backend/.env.example` (if still missing `REDIS_URL`), `CLAUDE.md` (Commands section)

**Interfaces:** none produced; consumes everything above.

- [ ] **Step 1: `start.sh`/`start.bat`.** Before starting servers, check Redis (`redis-cli ping`; on failure print `brew services start redis` / install hint and continue without the worker, warning that the Evaluation Lab will not run), then start `.venv/bin/arq app.workers.settings.WorkerSettings` alongside uvicorn and stop it in the existing `trap`.
- [ ] **Step 2: `ci.yml`.** One workflow on `pull_request` and push to `main` with two jobs. Backend: service container `pgvector/pgvector:pg16` with `POSTGRES_PASSWORD`, Python 3.11, install `requirements-dev.txt`, `TEST_DATABASE_URL` pointing at the service, `ruff check .`, `pytest`. Frontend: Node 22, `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`. No secrets. Validate locally with `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"`; state in the report that the workflow itself has not run on GitHub.
- [ ] **Step 3: Docs.** README: Redis requirement and `brew install redis && brew services start redis`, worker command, `make_admin`, `eval.seed_lab`, Evaluation Lab usage, updated checks list, "What works" now lists the Lab (retrieval metrics only; faithfulness, answer judging and ablations beyond dense vs hybrid are not built). `docs/architecture.md`: worker and Redis, why progress lives in the database. `docs/api-contract.md`: `/ready` and every `/eval/*` endpoint with response shapes. `docs/evaluation-plan.md`: new section defining each metric exactly as implemented (per-item functions, `pass` definition, gate, confidence intervals with 1,000 resamples), what the Lab does not measure yet, and the rule for flipping `RETRIEVAL_MODE` to `hybrid` (only if the recorded comparison shows hybrid does not lower abstention F1 and improves Hit rate at 5 or MRR). `CLAUDE.md` Commands: add the worker, `make_admin`, `seed_lab` lines.
- [ ] **Step 4: Measure dense versus hybrid on the real embedding model** (`edurag_eval` database): `python -m eval.seed_lab --email <admin email> --run dense,hybrid`. Record in `docs/evaluation-plan.md` a table with both runs (Hit rate at 1/3/5/10, MRR, nDCG at 5, abstention precision/recall/F1, p50/p95 latency, 95% intervals for Hit rate at 5 and MRR) and the date, exactly as printed, with a plain sentence about the result and its limits (23 items on a 2-document sample corpus; a gain or a tie are both reported as they are). Leave the default `RETRIEVAL_MODE=dense` unless the rule in Step 3 is met; if met, change the default in `config.py` and `.env.example` in this same step and re-run the full backend tests.
- [ ] **Step 5: Final gates.** `cd backend && .venv/bin/pytest && .venv/bin/ruff check .`; `cd frontend && npm test && npm run typecheck && npm run lint`; `npm run e2e` (existing 11 flows; they must still pass on the new styling — if any assertion depends on old class names or copy, fix the test, not the product). Report each result with real output.
- [ ] **Step 6: Commit** `docs,ci: evaluation lab docs, CI workflow and dense versus hybrid results`.

---

## Self-review notes

- **Spec coverage:** Phase 0 items covered: tokens/theme (1), Redis + worker (2, 7), readiness (2), CI (9), app shell restyle (1). shadcn/ui, Docker Compose, MinIO and Mailpit are deliberately not done (owner decision: Docker unavailable, MinIO/Mailpit not approved; the existing hand-built components are restyled instead of adopting shadcn, which would be a stack change). Phase 8 slice covered: datasets (4), metrics incl. Hit Rate@K, Precision@K, MRR, nDCG, abstention matrix, latency p50/p95, bootstrap CIs (3, 5), runs with config snapshot and progress (5, 7), overview, run detail, drill-down, compare (8), ablation dense vs hybrid (6, 9). Not in this plan, by design: faithfulness, answer relevance/correctness, citation precision/recall, judge validation (all need LLM judging), threshold tuner, Scale tab, golden set of 150 (needs human-reviewed items; the 23 existing items are the seed), live-feedback tab, OpenAPI-generated client, reranker/query rewrite/graph ablations (later phases).
- **Guide issues carried as deviations:** several guide color pairs fail AA (Task 1); the guide's `workspace_id` model does not exist yet, so isolation here is `user_id`, consistent with current code.
- **Type consistency:** `retrieve(..., mode)` added in Task 5 as an accepted argument and implemented in Task 6; `RunConfig.retrieval_mode` and `Settings.retrieval_mode` use the same two literals; `RunOut.metrics` keys match the Task 5 contract and the Task 8 types.
- **Proportion:** the plan is longer than the spec's two sections because the spec leaves the slice's interfaces undecided; code blocks are absent, signatures and test assertions are pinned.
