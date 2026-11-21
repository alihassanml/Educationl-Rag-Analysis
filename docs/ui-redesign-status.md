# UI redesign status

Snapshot taken 2026-11-21, with the Prompt B section updated on 2026-11-22, against `docs/UI_REDESIGN.md`, from the repo at commit `e129dcd` (branch `main`). Based on reading the code, git history and a run of the frontend checks. The app was not opened in a browser, so visual quality is not judged here.

## Summary

| Part of the brief | Status | Rough share done |
| --- | --- | --- |
| Prompt A: Paper, Clay & Stone redesign (sections 1-19) | Built, final verification incomplete | about 90% |
| Prompt B: Chat upgrade (section 20) | Built and verified, optional extras not built | about 95% |
| Prompt C: Remove the "AI-generated look" (section 21) | Not started | 0% |

Overall, roughly two thirds of the three prompts' work is done. That figure is an estimate. Prompt C (the AI-look pass over every screen) is the main remaining block.

## Prompt A: build order from section 19

| Step | Status | Evidence |
| --- | --- | --- |
| 1. Audit, `docs/ui-audit.md` | Done | `docs/ui-audit.md` (99 lines) |
| 1. Update CLAUDE.md with appendix A | **Not done** | `CLAUDE.md` does not exist in the working tree. It was deleted in commit `a6b50e2`. |
| 2. Tokens and Google Sans Flex, dark theme removed | Done | commit `e89cac0`; no `dark:` or `prefers-color-scheme` left in `app`, `components` or `styles` |
| 3. Primitives and `/dev/design` page | Done | `components/ui/*` (16 files), `app/dev/design/page.tsx` |
| 4. Layout, `PageContainer`, sidebar | Done | `PageContainer` used in 21 files; auth form column is a centred 400px block as the brief allows |
| 5. Feature registry | Done | `lib/features.ts`, nav built from `live` items |
| 6. Landing page and hero illustration | Done | `components/landing/*` (9 files), commit `7d2b0ea` |
| 7. Auth screens | Done | split layout with static illustration |
| 8. Dashboard, tutor, library, quizzes, progress, evaluation, settings, 404/500 | Done | commit `ebc7a11`, `app/not-found.tsx`, `app/error.tsx` |
| 9. Landing screenshots | Done | 4 images in `frontend/public/landing/` |
| 10. Final verification | Partly done | see below |

### Step 10: what was checked and what was not

Run on 2026-11-21 from `frontend/`:

- `npm test`: 15 files, 118 tests, all passed.
- `npm run typecheck`: no errors.
- `npm run lint`: no errors.

Not run in this review, so not confirmed:

- `npm run e2e`
- Backend `.venv/bin/pytest` and `.venv/bin/ruff check .`
- Screenshots of every screen at 390, 768, 1280 and 1440px saved to `artifacts/screens/`. The spec `e2e/screenshots.spec.ts` exists and its commit message says it sweeps these widths. No `artifacts/` folder is in the repo.
- axe accessibility checks.
- The manual walk-through (sign up, upload, ask, open citation, quiz, results, dashboard, progress).

### Known gaps from the audit (by design, not bugs)

These were left out because the backend returns no data for them: landing proof strip, name in the dashboard greeting, recent tutor questions, citation snippets and inline markers, "Closest passages", "Quiz me on this", forgot password, "Open in tutor". Chat history and streaming are in the registry as `planned`.

## Prompt B: chat upgrade (section 20), built

Commits `079e2e7` to `fcff423`. Build order 20.9, steps 1-8 are done:

1. Models and migration `6c890f3e9046` (`chat_threads`, `chat_messages`, `chat_citations`, `message_feedback`). Upgrade, downgrade and upgrade again was run on a scratch database.
2. Thread CRUD under `/api/v1/tutor/threads`, another user's thread returns 404.
3. Follow-up rewrite service (skipped on the first message, falls back to the original question on any failure).
4. `POST /threads/{id}/messages` streams the 20.5 events. Verified against a running server: a cut connection saves the partial answer as `stopped`.
5. `POST /messages/{id}/feedback` and the admin `GET /feedback`.
6. Frontend: SSE parser, history panel (search, rename, delete), streamed messages with sources first, Stop (button and Esc), Ask again, thumbs with a reason, a Live feedback list in the Evaluation Lab.
7. Registry marks chat history, follow-ups and streaming as live; tutor landing copy and screenshot updated.
8. README documents the API, the events and the grounding rules.

Checks run on 2026-11-22:

- Backend: `.venv/bin/pytest` 222 passed, `.venv/bin/ruff check .` clean.
- Frontend: `npm test` 161 passed, `npm run typecheck` and `npm run lint` clean.
- `npm run e2e`: 13 passed, 1 skipped (the screenshot capture, which runs only with `SCREENSHOTS=1` and was run separately and passed).
- Manual check with the real Groq model on a two-page sample PDF: a follow-up ("What happens without it?") was rewritten to "What happens if a recursive function has no base case?" and found page 1, a quick sort question found page 2, and an unrelated football question abstained inside the same thread with no generation call. The check found that the model sometimes writes citations as `【1】` or `[1, 2]`; this is now handled and tested.

Deviations and open points:

- **Layout at 1536px and up.** The brief's three columns (260 + 760 + 340px) are wider than the 1200px container beside the 240px app sidebar. The history panel is inline at 1536px and up and the conversation column flexes below 760px there. Below 1536px, history is a left drawer.
- **Markdown.** No Markdown library is installed, so answers render as plain text with citation pills. A library such as `react-markdown` with raw HTML disabled would add lists and code blocks; it was not added without approval.
- **Extra column.** `chat_citations` also stores `document_title` and `snippet`, so history still reads well after a document is deleted. The rewrite details (`standalone_query`, `rewrite_used`) are saved on the student's message, not the answer.
- **Optional extras not built:** the Redis message limit (20.7) and the follow-up question pairs in the evaluation set.
- **e2e database.** After pulling this change, run `alembic upgrade head` against `edurag_e2e`, otherwise the chat tests fail with a network error (the API returns 500 for the missing tables).
- The sweep screenshots in `artifacts/screens/` were regenerated and are not committed.

## Prompt C: AI-look review (section 21), not started

The Prompt C section was added in the latest commit (`e129dcd`). There is no tells list in `docs/ui-audit.md` and no `artifacts/screens/review/` folder. The nearest related change is `f8dae23` (visible borders on buttons). Remaining: the per-screen loop for landing, auth, dashboard, tutor, library, quizzes, progress and evaluation lab, then the final table.

## Other items to resolve

1. **Uncommitted edit to the brief.** `docs/UI_REDESIGN.md` has the first 11 lines deleted (the title, the intro paragraphs and the start of Prompt A). The file now begins in the middle of Prompt A. If that was not intended, restore with `git checkout docs/UI_REDESIGN.md`.
2. **Missing CLAUDE.md.** The brief tells the agent to read it first and to apply appendix A to it. It is not in the repo.
