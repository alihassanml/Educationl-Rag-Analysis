# Test report

Results at the end of Phase 4 (2026-11-23).

| Suite | Command | Result |
|---|---|---|
| Backend (pytest, real PostgreSQL + pgvector, fake embedder and fake LLM) | `ruff check app && pytest` | **632 passed**, ruff clean |
| Frontend unit (Vitest) | `npm test` | **320 passed** in 31 files |
| Frontend static checks | `npm run lint`, `npm run typecheck`, `npm run build` | all clean |
| End-to-end (Playwright, real browser, real DB and embeddings, scripted LLM) | `npm run e2e` | **25 passed** |
| Dependency audit | `pip-audit -r requirements.txt`, `npm audit --omit=dev` | no known vulnerabilities |

## End-to-end coverage
`e2e/core-flow.spec.ts` (register, upload, cited streamed answer, follow-up, "not found", in-chat quiz, progress, delete, sign out) and `e2e/features.spec.ts` (encrypted upload indexed, diagnostic, course map, exam predictor, teacher class sharing and student join by code, 404 for a non-member, teacher area, peer match, viva, reminders and notifications, settings, cross-user document access refused, security headers).

Not covered end to end in a browser: a full Peer Match duel, a typed Viva session and a slip test run through the UI. These are covered by backend API tests (`test_peer_match.py`, `test_viva.py`, `test_reminders.py`) and by component tests; browser tests for them are the next addition.

## Retrieval quality (Evaluation Lab, see `evaluation-plan.md`)
Measured by hand during development on three labelled sets (the extra sets are not stored in the repo; only `sample_course.jsonl` is): the answer was found for 76 of 78 questions with the current similarity rule (69 with the bar alone), and the model's NOT_FOUND guard refused every off-topic question that passed the bar. On the 30-question set for the Phynxa PDF, 27 of 30 were found after chunking at headings (23 before). Re-run the Lab for current hit rate, MRR and abstention numbers: they depend on the embedding model and the datasets in `backend/eval/datasets`.

## Known limitations
- `docker compose` and `render.yaml` were written but not executed in the build environment (no Docker installed there); run them once and report issues.
- Scanned (image-only) PDFs are rejected with a clear message; there is no OCR.
- Chunk text and embeddings are not application-encrypted (search needs them); see `security.md`.
- On Render the API indexes uploads itself because a disk cannot be shared with the worker.
- The CSP allows inline scripts (Next.js requirement); a nonce policy is future work.
