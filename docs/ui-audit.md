# UI redesign audit (Paper, Clay & Stone)

Written 2026-11-18 before any redesign code, following `docs/UI_REDESIGN.md` section 17. Scope is the frontend only.

## Environment facts

| Item | Finding |
| --- | --- |
| Next.js | 16.4.5, App Router, `proxy.ts` (not `middleware.ts`), `cacheComponents: true`, routes live in `frontend/app` (not `src/app`) |
| Tailwind | 4.3.5, tokens wired with `@theme inline` in `app/globals.css`, raw values in `styles/tokens.css` |
| Font | `Google_Sans_Flex` and `Google_Sans_Code` exist in Next's bundled `next/font/google` data (variable, axes wght/wdth/opsz/ROND/GRAD/slnt), so no new dependency is needed |
| Tokens today | `--bg --surface --surface-2 --text --text-muted --text-subtle --border --brand --brand-solid --brand-hover --brand-soft --on-brand --success --warning --danger`, light plus a `prefers-color-scheme: dark` block, glass and glow variables |
| Components | Use semantic utilities only (`bg-surface`, `text-muted`, `border-border`, `bg-selected`, `text-primary` ...). No hex colours in any `.tsx`. So the redesign is mostly a token remap plus component restyling |
| `PageContainer` | Exists, `max-w-[1200px]`, gutter `px-4 sm:px-6` (needs the 32px step at 1280px). Used by every student page and the app-shell top bar. The auth layout uses its own `max-w-5xl`, which breaks the one-container rule |
| Contrast test | `tests/tokens.test.ts` checks text pairs in light and dark. Must be rewritten for the section 3 table, dark removed |
| Tests touching UI text | `app-shell.test.tsx` (nav label "Dashboard", mobile menu), `tutor.test.tsx`, `progress.test.tsx`, `quiz-runner.test.tsx`, `evaluation.test.tsx`, `auth-form.test.tsx`, `e2e/core-flow.spec.ts` |

## Per-screen decisions

Legend: keep, change, remove.

### Global shell (`app-shell`, `sidebar-nav`, `account-menu`, `nav-items`)

- Change: sidebar 240px, paper with stone right border, grouped LEARN / PRACTISE / INSIGHTS, 3px clay bar on the active item, settings link above the account block.
- Change: mobile top bar uses a plain paper bar (remove `.glass`), menu opens as a sheet.
- Change: nav labels to sentence case: "Study tutor", "My library", "Quizzes" (was "Practice Quizzes"), "Evaluation Lab" (was "Evaluation").
- Remove: glass class, backdrop blur, brand-shadow.
- Keep: session gate, admin-only filter, sign-out logic.

### Landing `/`

- Today `/` redirects to `/dashboard` and `proxy.ts` redirects every unauthenticated request to `/login`. Change: `/` becomes the public landing page, the proxy lets `/` through. Signed-in visitors see "Open dashboard" in the header (client check through `/auth/me`).
- Data gaps: see "Missing data" below. No proof strip, no screenshots yet (step 9).

### Auth (`/login`, `/register`)

- Change: split layout (form left, static hero illustration right on stone-50, hidden below 1024px), show/hide password toggle, copy in sentence case.
- Change: the auth layout stops using its own max width and uses `PageContainer`.
- Keep: zod validation, kept values after error, expired-session notice, redirects.
- Not built: forgot password (the API has no such endpoint).

### Dashboard

- Change: header becomes a greeting ("Good evening", no name because `/auth/me` returns only email), next-step card with clay left border, snapshot, stat row, needs revision, recent activity, score history.
- Change: the first-run checklist ("Get started in three steps") from real state: documents total, plus quizzes completed.
- Remove: the two header buttons (the next-step card holds the one primary action), stats duplicated between snapshot and stat row, "None yet" strings replaced by dash plus "No data yet".
- Missing: the step "Ask your first question" has no API state (the backend does not store tutor questions). It will show as an unchecked action, never as done.

### Study tutor

- Change: layout per section 13 (centred conversation, sticky composer, sources panel). Question bubble stone-100, answer with no bubble, designed "Not found in your material" state, suggestion cards built from real document titles that fill the composer without sending.
- Missing: `Citation` has no snippet and no marker, and abstained responses carry no closest passages. So the sources panel shows document title and page only, and "Closest passages" is not built.
- Missing: "Quiz me on this" needs a topic quiz tied to an answer, which the API does not have, so it is left out.
- Keep: scope selection (becomes a chip), `?q=` prefill, retry, `/tutor/ask` flow.

### Library

- Change: header with "Upload PDF" primary button, dropzone card, table with Title, Pages, Status, Uploaded, row menu. Delete dialog names the file.
- Missing: the library does not poll today (only reloads after upload and delete). Nothing new is added, per the brief. "Open in tutor" is left out until the tutor accepts a document scope from the URL.

### Quizzes (list, generate, attempt, result)

- Change: list with difficulty chip and last score, "New quiz" dialog with segmented difficulty tiles, one-question attempt view with progress bar, keyboard 1–4, results with citations and the next step.
- Keep: all scoring and submit protection logic.

### Progress

- Change: topic table with accuracy bar, "How we decide" panel using `rules` from `/progress/topics` (the thresholds already come from the backend, no backend change needed), footnote.

### Evaluation Lab (admin)

- Change: restyle tiles, matrix, compare bars (clay and stone-strong), small-sample banner when dataset under 150 items.
- Keep: all run, compare and result logic.

### Settings, 404, 500

- New: Settings shows email (the only profile field the API returns) and sign out. 404 and 500 pages inside `PageContainer`.

## Missing data (do not build UI for it)

| UI element in the brief | Backend today | Decision |
| --- | --- | --- |
| Landing proof strip | Evaluation endpoints are admin-only, no public read | Not rendered (brief: no data, no strip) |
| Greeting with name | `/auth/me` returns id, email, is_admin | Greeting without a name |
| Recent tutor questions on dashboard | Tutor questions are not stored | Hidden |
| Citation snippet, inline markers, closest passages | Not in `AskResponse` | Sources list with title and page only. Becomes available when the chat upgrade (Prompt B) ships |
| Chat history, streaming, Stop, feedback | Not built | Prompt B, not this task |
| Forgot password, settings profile fields | No endpoints | Not built |

## Removal list (section 17), with where it is found

1. Midnight & Ice tokens, glow, glass, shadows: `styles/tokens.css`, `app/globals.css`, `.glass` in `app-shell`, `--shadow-brand` in `button`.
2. Dark theme: `styles/tokens.css` dark block and `tests/tokens.test.ts`. There is no toggle, only `prefers-color-scheme`.
3. Trailing full stops in headings and buttons: to be checked per screen while restyling.
4. More than one primary button per screen: dashboard header (two buttons).
5. Nested cards: library upload panel plus list, evaluation panels, to be checked per screen.
6. Pages that set their own padding: `auth/layout.tsx` (own `max-w-5xl`), `session-provider` loading and error states.
7. Hard-coded hex values in components: none found.
8. Nav items for unbuilt features: none today (the registry in step 5 keeps it that way).
