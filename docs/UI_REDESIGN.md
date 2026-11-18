# EduRAG UI Redesign Brief: "Paper, Clay & Stone"

Owner decision dated 2026-11-18. This file replaces the "Midnight & Ice" design direction (Guide v2 section 13 and appendix 20). Save it in the repo as `docs/UI_REDESIGN.md`. CLAUDE.md product rules, coding rules and the required workflow still apply. Where this file and Guide v2 disagree on visual design, this file wins.

Source of truth for the product is the approved proposal (`EduRAG.pdf`, Amber Rehan and Ali Ahmed, Lahore Garrison University, supervised by Talha Javeed, co-supervised by Hamas Fayyaz). The two implementation guides are planning documents and are not the product definition.

---

## 0. Paste this prompt into Claude Code

```text
Read CLAUDE.md, then read docs/UI_REDESIGN.md in full before doing anything.

The owner has replaced the "Midnight & Ice" design with the light "Paper, Clay & Stone"
theme in docs/UI_REDESIGN.md (decision 2026-11-18). This is a frontend redesign. Do not
add backend features, do not start Guide v2 phases 1-7, and do not change the stack.

Step 1 - Inspect and audit (no code changes yet):
  a. Read frontend/node_modules/next/dist/docs/ for anything you will touch (Next 16).
  b. Check the installed Tailwind version, how tokens are wired today, PageContainer,
     the existing contrast test, and every route under frontend/src/app.
  c. For every screen, list what to keep, change and remove, using section 17 of the brief.
     Write it to docs/ui-audit.md.
  d. Check which backend responses exist for each screen in sections 9-15. Mark any UI
     element whose data does not exist yet. Do not build UI for data the API does not return.
  e. Reply with a plan of at most 15 lines, then continue. Do not stop after the audit.

Step 2 onwards - follow the build order in section 19 of the brief, one step at a time.
After each step run npm test, npm run typecheck and npm run lint from frontend/. Commit with
a clear message. At the end, run the full verification in section 19 and report real command
output. Never claim a check you did not run.

Also update CLAUDE.md with the replacement text in appendix A of the brief.
```

### Prompt B: run after Prompt A is finished

```text
Read CLAUDE.md, then docs/UI_REDESIGN.md, especially section 20 (Chat upgrade).
The owner approved this feature on 2026-11-18: chat threads with saved history, follow-up
question understanding, streamed answers, Stop, and answer feedback. Only build what
section 20 lists. Keep the existing POST /api/v1/tutor/ask working and its tests passing.

Step 1 - Inspect: the current tutor route, rag/retrieval/groq services, the similarity gate,
the installed FastAPI, Groq SDK and Next.js versions, and how streaming is supported in each
(read the official docs and frontend/node_modules/next/dist/docs/). Reply with a plan of at
most 15 lines, then continue.

Step 2 onwards - follow the build order in section 20.9. Write backend tests first for
ownership, event order, abstention and rewrite. After each step run the backend checks
(.venv/bin/pytest, .venv/bin/ruff check .) and the frontend checks (npm test, npm run
typecheck, npm run lint), then commit. Finish with npm run e2e and the section 20.8
checks, and report real command output. Never claim a check you did not run.
```

### Prompt C: fix the "AI-generated look" (run any time, and again at the end)

```text
Use the frontend-design skill. Read CLAUDE.md and docs/UI_REDESIGN.md, especially sections
3-7, 9, 10 and 21.

The current UI looks AI-generated. Fix it screen by screen, without changing any API calls,
auth, validation or business logic.

For each screen in this order (landing, auth, dashboard, tutor, library, quizzes, progress,
evaluation lab):
1. Start the dev servers, open the screen with Playwright MCP at 1440px and 390px, and
   take screenshots.
2. Score the screen against the 16 AI tells in section 21.1. List every hit with file:line.
3. Rewrite the layout, typography, spacing and copy to follow sections 3-7 and 21.2. Use
   real product UI as visuals, not decoration.
4. Take new screenshots, compare before and after, and repeat until there are zero tells.
5. Run npm test, npm run typecheck and npm run lint, then commit that screen.

At the end, give me a table: screen | tells found | tells fixed | screenshot paths.
Report real command output. Never claim a check you did not run.
```

---

## 1. What the user must understand in 5 seconds

The redesign has one job. A first-time visitor or examiner should understand what EduRAG does, why it differs from "just asking ChatGPT", and what to click next.

**One-line pitch (from the proposal):** A private tutor built only from your own study material. It shows the page every answer came from, says so when your notes don't cover a question, and uses your quiz results to decide what you revise next.

**The four ideas every screen reinforces:**

1. **Your material only.** Answers come from the student's uploaded files, never from general web knowledge.
2. **Proof on every answer.** Each answer cites the document and page it came from.
3. **Honest when unsure.** When the material doesn't cover a question, EduRAG says "Not found in your material" instead of guessing.
4. **It adapts.** Quiz results find weak topics and produce one clear next step.

**Why this isn't "already done":** general chatbots don't use your syllabus and don't cite pages. Notes Q&A tools don't run an adaptive quiz loop. Quiz apps don't build from your own files. EduRAG puts all of these into one loop, and its accuracy is measured in the Evaluation Lab rather than claimed. The landing page has to make that argument visually (section 9).

**Honesty rules (binding, from CLAUDE.md):**
- Never claim zero hallucinations, perfect citations or reliable exam prediction.
- Every number shown comes from the API or a real evaluation run, with its sample size.
- A feature only gets a nav item or a landing feature section when it works end to end. Planned features appear only in the clearly labelled roadmap list (section 9.8).

---

## 2. Design principles

1. **Clean over decorated.** White space and hierarchy do the work. No gradients, glow, glass, noise, sparkles or decorative AI imagery.
2. **One primary action per page.** Every screen has a title, one short line explaining the screen, and one clay-coloured primary button.
3. **Show the proof.** Citations, sources and measured metrics are the visual signature. They are what make the product look advanced.
4. **Familiar patterns.** The UI should feel like Google Workspace or Linear: obvious, calm and fast to scan.
5. **Every state is designed.** Loading, empty, error and success states exist on every list, panel and form.
6. **Remove before adding.** If an element does not help the user decide or act, it goes.

---

## 3. Colour system

Three owner colours. Everything else is derived from them, and contrast was checked against WCAG 2.1 AA.

| Role | Owner colour | Name | Share of any screen |
|---|---|---|---|
| 1st, most important | `#FFFFFF` | Paper | about 80%: page background, main surfaces |
| 2nd | `#D36243` | Clay | 5% or less: accents, active states, key highlights |
| 3rd | `#DCDCDC` | Stone | about 15%: card fills (as a tint), borders, dividers, chips |

### 3.1 Important finding: Clay needs a darker partner for small text

White text on `#D36243` measures **3.75:1**. That passes for large text (24px and up) and for UI shapes, but fails the 4.5:1 that normal-size button text and links need. The fix keeps the same hue (13°) and darkens it:

- `#D36243` (Clay) is for accents, icons, the active-nav indicator, the focus ring, headline accent words at 24px or larger, charts and the hero illustration.
- `#B5492C` (Clay Strong) is for primary button fills (white text 5.31:1) and text links (5.31:1 on white, 4.83:1 on the card tint).

Visually it still reads as the owner's clay colour.

### 3.2 Tokens

Define these once as CSS variables in the global stylesheet and expose them to Tailwind using the method the installed Tailwind version supports. Never hard-code hex values in components.

| Token | Value | Use | Checked contrast |
|---|---|---|---|
| `--paper` | `#FFFFFF` | Page background, primary cards, inputs | — |
| `--stone-50` | `#F7F7F7` | Alternate landing section background | — |
| `--stone-100` | `#F4F4F4` | Muted card fill (stat tiles, empty states, sources panel, landing feature cards) | ink 15.6:1, ink-2 6.08:1 |
| `--stone` | `#DCDCDC` | Card borders, dividers, table header fill, chip at rest, progress track, skeleton | ink 12.5:1, ink-2 4.88:1 |
| `--stone-strong` | `#8A8A8A` | Input borders, checkbox and radio outlines (non-text 3:1 rule) | 3.45:1 on paper, 3.14:1 on stone-100 |
| `--ink` | `#1C1B1A` | Headings and body text (warm near-black) | 17.2:1 on paper |
| `--ink-2` | `#5C5C5C` | Secondary text, captions, metric labels | 6.69:1 on paper |
| `--ink-3` | `#6B6B6B` | Placeholders, timestamps | 5.33:1 on paper |
| `--clay` | `#D36243` | Accent (see 3.1) | 3.75:1 on paper, large text and UI only |
| `--clay-strong` | `#B5492C` | Primary button fill, links | white on it 5.31:1 |
| `--clay-stronger` | `#9C3D26` | Primary hover and pressed, text on clay-soft | white on it 6.75:1 |
| `--clay-soft` | `#FBEEE9` | Selected nav fill, citation pill background, highlighted passage | clay-stronger on it 5.95:1 |
| `--clay-200` | `#F6DCD2` | Hover on clay-soft, lightest chart tint | — |
| `--success` / `--success-soft` | `#1A6E44` / `#E7F4EC` | Correct, ready, doing well | 5.52:1 on soft |
| `--warning` / `--warning-soft` | `#8A5A00` / `#FFF4DC` | Practising band, processing | 5.43:1 on soft |
| `--danger` / `--danger-soft` | `#B3261E` / `#FCEEEE` | Errors, wrong answers, destructive actions | 5.79:1 on soft |
| `--focus` | `var(--clay)` | 2px ring with 2px paper offset | 3.75:1 |

### 3.3 Colour rules

- **Clay budget:** if clay appears in more than three places in one viewport (excluding the illustration), remove one.
- **Clay is never a status colour.** Clay is a warm red-orange, close to danger red. Errors always use `--danger` with an icon and text, and clay is never used to mean "bad".
- **Card fill:** muted cards use `--stone-100`, a lighter tint of the owner's `#DCDCDC`. Full-strength `#DCDCDC` across every card makes the UI look grey and dull, so Stone at full strength is for borders, chips and inner wells. To use literal `#DCDCDC` card fills, change `--stone-100` only. Ink and ink-2 still pass on it, but links inside those cards must then use `--clay-stronger`.
- **Charts:** one series uses `--clay`. Two series use `--clay` and `--stone-strong`. Ordered ramps use `--clay-stronger`, `--clay`, `#E8A48F` and `--clay-200`. Status colours are used only when the meaning is good or bad. Always show text values as well, never colour alone.
- **Light theme only.** Remove the dark theme and its toggle. Keep the tokens structured so a dark set could be added later, but don't build one now.

---

## 4. Typography

**Font: Google Sans Flex.** Google released it on Google Fonts on 18 Nov 2025 under the SIL Open Font License, so it is free for this project. It is the Google look the owner asked for and it reads well at small sizes.

- Load it with `next/font/google` if the installed Next.js font data includes it (check `node_modules/next` for the export name). Otherwise use the Fontsource variable package and record the new dependency in the report.
- Fallback stack: `"Google Sans Flex", "Google Sans", Roboto, system-ui, -apple-system, "Segoe UI", sans-serif`.
- Code blocks in tutor answers: Google Sans Code if available, otherwise `ui-monospace`.
- Numbers in tables and metrics use `font-variant-numeric: tabular-nums`. Check that the font supports it.

| Style | Size / line height | Weight | Use |
|---|---|---|---|
| Display | 56/64 desktop, 40/48 mobile, tracking −0.02em | 500 | Landing hero headline only |
| H1 section | 36/44 desktop, 28/36 mobile | 500 | Landing section titles |
| Page title | 24/32 | 500 | One per app screen |
| H3 | 18/26 | 600 | Card titles |
| Lead | 18/28 | 400 | Landing sub-lines |
| Body large | 16/24 | 400 | Landing body, tutor answers |
| Body | 14/20 | 400 | App default |
| Label | 14/20 | 500 | Buttons, nav, form labels |
| Small | 13/18 | 400 | Captions, table meta |
| Overline | 12/16, uppercase, +0.06em | 600 | Sidebar group labels, landing eyebrow |
| Metric | 32/40 (app), 44/52 (landing) | 500 | Stat numbers, tabular |

Rules:
- **Accent word:** a marketing headline may have one phrase in `--clay` (allowed at 24px and up). Don't use italics, gradients or underlines for it.
- **Line length:** keep body text to 60–75 characters, and tutor answers to 720px max.
- **No full stops:** no trailing full stop in headings or buttons (owner rule).
- **Case:** use sentence case everywhere, not Title Case.

---

## 5. Layout, spacing and margins

The owner's main complaint is margins. These rules are strict.

### 5.1 One container everywhere

- `PageContainer` is the only component that sets page side padding and max width. Every screen uses it: landing sections, auth, every app page, 404 and 500.
- Max content width is **1200px** for both the marketing site and the app, so left and right edges line up across the whole product.
- Side padding is **16px** below 640px, **24px** from 640 to 1279px, and **32px** at 1280px and up.
- In the app, `PageContainer` sits inside the content area to the right of the sidebar. Page content must never touch the sidebar edge or the viewport edge.
- Narrow reading content, such as the tutor conversation or the auth form, is centred inside the container with its own max width. It never changes the container padding.

### 5.2 Spacing scale

Spacing is on a 4px base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96. Don't use other values.

| Context | Value |
|---|---|
| App page top padding | 32 desktop, 24 mobile |
| Page title to subtitle | 4 |
| Header block to content | 24 |
| Between app page sections | 32 |
| Grid gap between cards | 24 desktop, 16 mobile |
| Card padding | 24 default, 20 compact (stat tiles, list rows), 16 on mobile |
| Landing section vertical padding | 96 desktop, 64 mobile |
| Landing section title to content | 48 desktop, 32 mobile |
| Form field gap | 16; label to input 6 |

### 5.3 Grid

- **Columns:** 12 columns on desktop, 8 on tablet, 4 on mobile. Card widths snap to columns, such as 8+4, 6+6 or 4+4+4.
- **Equal heights:** cards in the same row are equal height (`align-items: stretch`), and content is top-aligned.
- **No nested cards:** use a divider or an inset `--stone` well inside a card, never a second card.
- **Mobile:** everything is single-column below 640px, with no horizontal scroll at 390px.

---

## 6. Shape, elevation, motion and icons

- **Radius:** 12px for cards and dialogs, 8px for buttons, inputs and inner wells, 999px for chips and badges only, 16px for the tutor composer.
- **Elevation:** cards use a border (white card) or a fill (muted card), never a shadow at rest. Shadows are neutral and only on floating layers:
  - `--shadow-sm: 0 1px 2px rgba(28,27,26,0.06)` for hover on clickable cards
  - `--shadow-md: 0 8px 24px -8px rgba(28,27,26,0.16)` for menus, popovers, the composer and the sticky header after scroll
  - `--shadow-lg: 0 24px 48px -12px rgba(28,27,26,0.20)` for dialogs only
- **Motion:** 120ms hover and press, 180ms menus and tabs, 240ms dialogs and sheets, easing `cubic-bezier(0.2, 0.8, 0.2, 1)`. Nothing loops except loading indicators. Respect `prefers-reduced-motion`.
- **Icons:** Lucide, 1.75 stroke, 16px in controls, 20px in nav, 24px in empty states. An icon must mean something; don't add an icon to every card title.

---

## 7. Core components

Build these first on a `/dev/design` page (dev-only route, excluded from production nav), then use them everywhere. Extend the existing component setup; don't add a second UI kit.

| Component | Spec |
|---|---|
| Button | Heights 32, 36 (default) and 40 (marketing). Primary: clay-strong fill, white text, hover clay-stronger. Secondary: paper fill, stone border, ink text. Ghost: text only. Destructive: danger outline, then danger fill in the confirm dialog. States: hover, active, focus-visible, disabled, loading (spinner replaces icon, width fixed). |
| Input, Textarea, Select | 40px tall, paper fill, stone-strong border, focus ring clay. Label above, help text below in ink-2, error text in danger with icon. Values are kept after a failed submit. |
| Card | `card` is paper with a 1px stone border, radius 12. `card-muted` is stone-100 with no border. A clickable card gets shadow-sm and a border change on hover, and the whole card is one link. |
| Stat tile | card-muted, overline label, metric number, one line of context ("from 12 attempts"). Shows a dash plus "No data yet" when empty, never a fake zero. |
| Chip / Status | 24px pill. Ready (success), Processing (warning, small spinner), Failed (danger), Not enough data (stone), Needs revision (danger-soft), Practising (warning-soft), Doing well (success-soft). Text always present. |
| Citation pill | `[1]` in clay-soft with clay-stronger text, radius 6. Hover or focus shows a card with document title, page and a 2-line snippet. Click opens the sources panel at that citation. |
| Source card | Document icon, title, "Page 45", snippet with the matched passage highlighted in clay-soft. |
| Segmented tiles | For difficulty and modes. Selected tile is clay-soft fill with a clay border and clay-stronger text. |
| Progress bar | Stone track, clay fill, numeric label beside it. |
| Empty state | card-muted, 24px icon in ink-2, title, one sentence, one primary action. |
| Error state | Danger icon, plain-language message, Retry button. Never a raw stack trace. |
| Skeleton | Stone blocks matching the final layout. Shimmer is off under reduced motion. |
| Dialog, Sheet, Toast, Tooltip, Dropdown | Paper, radius 12, shadow-md or shadow-lg, focus trapped, Esc closes. |
| Table | Stone header fill, 48px rows, stone dividers, sortable headers where useful. Becomes stacked cards below 640px. |

---

## 8. Information architecture

### 8.1 App navigation (left sidebar)

The sidebar is 240px, paper background with a stone right border. It collapses to a top bar with a menu sheet below 1024px.

```
EduRAG (logo)
LEARN
  Dashboard
  Study tutor
  My library
PRACTISE
  Quizzes
  Progress
INSIGHTS            (admin only)
  Evaluation Lab
——
Settings
Account menu (name, email, sign out)
```

- **Active item:** clay-soft fill, clay-stronger text, and a 3px clay bar on the left edge.
- **Hidden until built:** no nav items for features that are not built. When a new module ships, it is added to the feature registry and appears automatically.
- **Top of content area:** only the page title area, inside `PageContainer`. Don't repeat the page name in a separate top bar.

### 8.2 Feature registry

Create one UI config file, placed to fit the existing structure, that lists each product module with `status: "live" | "planned"`, its nav label, route, landing section copy and roadmap line. Nav and the landing feature sections render only `live` items. The roadmap list renders `planned` items. This is display config only; business rules stay in the backend.

Initial statuses, to be confirmed in the audit: Auth, Library (PDF), Study tutor, Quizzes, Progress and Evaluation Lab are `live`. Chat history, follow-up questions and streamed answers become `live` when section 20 passes its checks. Diagnostic test, DOCX/YouTube ingestion, teacher-style mode, mood-aware pacing, exam predictor, viva bot, peer match and reminders are `planned`.

---

## 9. Landing page (`/`)

Server components where possible. Every section sits inside `PageContainer`. Sections alternate paper and stone-50 backgrounds to separate content without heavy borders.

### 9.1 Header

- **Behaviour:** sticky, 64px tall, paper background. Gets a stone bottom border and shadow-md after 8px of scroll.
- **Contents:** logo on the left; anchor links in the middle (How it works, Features, Why EduRAG, Evaluation, FAQ); on the right, "Sign in" (ghost) and "Get started" (primary).
- **Mobile:** links collapse into a menu sheet. When signed in, the right side shows "Open dashboard" instead.

### 9.2 Hero

- **Desktop layout:** two columns, text on the left in 6 columns and the illustration on the right in 6 columns, vertically centred, minimum 560px tall.
- **Mobile layout:** text first, illustration below.
- **Eyebrow** (overline, ink-2): `FINAL YEAR PROJECT · LAHORE GARRISON UNIVERSITY`
- **Headline** (display): "Study from your own notes, with **answers you can check**". The bolded phrase is in clay.
- **Sub-line** (lead, ink-2, max 52ch): "Upload your PDFs and EduRAG becomes a private tutor. Every answer cites the document and page it came from, it tells you when your notes don't cover a question, and your quiz results decide what you revise next"
- **Buttons:** "Get started" (primary, 40px) and "See how it works" (secondary, scrolls to 9.4).
- **Trust line** (small, ink-2, with check icons, facts only): "Private to your account · Page-level citations · Says when it doesn't know"
- **Illustration:** see section 10.

### 9.3 Proof strip

- **Content:** a row of 3–4 stat tiles from the latest real Evaluation Lab run, such as Hit@5, MRR, abstention accuracy and questions tested.
- **Context line:** each tile shows the sample size and date, for example "38 labelled questions · 3 documents · 12 Nov 2026", plus a "How we measure" link to the evaluation section.
- **Data source:** a public read-only endpoint, if one exists, or a value the backend exports at build time. Check which one exists in the audit.
- **No data, no strip:** if no run exists, the strip is not rendered. Never hard-code numbers.

### 9.4 How it works (4 steps)

The steps are in a horizontal row on desktop and vertical on mobile, numbered 1–4 and connected by a thin stone line with a clay dot at each step.

1. **Upload your material.** PDF notes, slides and books stay private to your account.
2. **EduRAG builds your knowledge base.** Text is split into passages and indexed so it can be searched by meaning.
3. **Ask, and check the source.** Answers cite the document and page, or say "Not found in your material".
4. **Practise and improve.** Quizzes from your files find weak topics and suggest your next step.

### 9.5 Feature sections (live features only)

These alternate text and a visual, left and right. Each has an overline, an H1 section title, 2–3 sentences and 3 short bullet facts. Visuals are real screenshots captured from the running app with Playwright and seeded demo data, shown in a paper frame with a stone border and radius 12. No device mockups.

- **Study tutor:** cited answer with the sources panel, plus a second small crop of the "Not found in your material" state. The honest abstention is a selling point, so show it.
- **Adaptive quizzes:** a question view and the results view with explanations and citations.
- **Progress and next step:** weak topics with the plain-language rule and the next action.
- **Evaluation Lab:** metrics and the abstention matrix. Headline: "Accuracy you can inspect, not just trust".

### 9.6 Why EduRAG (the "isn't this already done?" answer)

This is the section that answers "this already exists". Section title: "One study loop instead of four separate tools".

The comparison table uses categories, not brand names:

| | EduRAG | General AI chatbots | Notes Q&A tools | Quiz & flashcard apps |
|---|---|---|---|---|
| Answers only from your own files | ✓ | — | ✓ | — |
| Cites document and page | ✓ | Varies | Varies | — |
| Says when your notes don't cover it | ✓ | Varies | Varies | — |
| Quizzes generated from your files | ✓ | Manual | Varies | Varies |
| Weak topics and a next step from your results | ✓ | — | — | Varies |
| Accuracy measured on a labelled test set | ✓ | — | — | — |

Guard rules:
- EduRAG gets ✓ only for live features.
- Competitor cells default to "Varies" unless the team has verified them. Claude Code must not invent competitor claims.
- Design: EduRAG column on a clay-soft background with a clay top border; other columns plain. Below 768px, show stacked cards per row, with EduRAG first.

### 9.7 For teachers and institutes (short)

Use 2–3 sentences from the proposal's target users (universities, O/A-Level students, tuition centres). Add a card only for what is live; planned teacher features go in the roadmap.

### 9.8 Roadmap ("What's next")

- **Content:** a simple two-column list of `planned` features from the registry, each with a "Planned" stone chip and one line.
- **Framing:** label it honestly. This shows the ambition of the proposal without pretending the features exist.

### 9.9 FAQ

Use an accordion with these questions:
- Is my material private?
- Can EduRAG be wrong? Answer honestly: citations show where an answer came from, so you can check it; accuracy is measured, not guaranteed.
- Which files can I upload? Name only the live types.
- Which AI model does it use? "Answers are generated by a language model through our backend and grounded in your passages"; name the provider only if the team wants to.
- Who built it?

### 9.10 Team

- **People:** student developers Amber Rehan and Ali Ahmed; supervisor Talha Javeed; co-supervisor Hamas Fayyaz; Department of Computer Science, Lahore Garrison University.
- **Display:** names and roles only, with initials avatars on stone-100. No phone numbers or emails.

### 9.11 Final call to action and footer

- **Final CTA:** card-muted band with "Start studying from your own notes" and the primary button.
- **Footer:** three link groups (Product, Project, Account), the line "EduRAG · Final Year Project, BS Computer Science, Lahore Garrison University", and the year. Legal links appear only if the pages exist.

---

## 10. Hero illustration (SVG)

**Concept: "From your page to a cited answer".** One picture tells the whole product story, left to right: a page of notes, passages indexed into a knowledge map, an answer whose citation links back to the exact line on the page, and the next study step. The dashed line from the citation back to the highlighted line is the signature visual: proof on every answer.

### 10.1 Build rules

- **Component:** `HeroIllustration.tsx`, inline SVG, `viewBox="0 0 560 480"`, scales to its column width, max 560px.
- **Colours:** only from CSS variables, using `fill="var(--clay)"` style references. No hex values in the file.
- **Text:** labels are real `<text>` elements in the app font, at 11–13px rendered size. Hide or simplify small labels below 640px.
- **Accessibility:** decorative to screen readers (`aria-hidden="true"`), because the hero text carries the meaning.
- **Sample content:** the sample names in it ("OS Notes.pdf", "Deadlock") are illustration content, not data, and must not look like a metric.
- **Animation:** CSS only, no animation library.

### 10.2 Composition

1. **Stage.** A rounded rect (radius 24) filled with stone-50, with a very faint dot grid (1px stone dots every 16px) clipped inside. It gives depth without glow.
2. **Pages (left, x 24–210, y 60–330).** Three stacked white pages with stone borders, rotated −6°, −2° and 0°. The front page has a stone header bar, 8 text lines as rounded stone rects of varying widths, and the footer label "p. 45" in ink-3. Line 4 is the matched passage: clay-soft fill behind it and a 3px clay marker on its left.
3. **Indexing (middle, x 200–340).** Five small passage tiles (28×10, radius 3, paper with stone border) sit along a smooth cubic curve from the page to a knowledge cluster. The cluster has 7 nodes (circles r 6–10, paper fill, stone-strong stroke) joined by thin stone edges. The node for the matched concept is filled clay and labelled "Deadlock".
4. **Answer card (right, x 318–540, y 90–300).** White card, radius 16, stone border, shadow-md (using an SVG filter or a drop-shadow on the wrapper). Inside:
   - an overline "ANSWER" in ink-2
   - 4 text lines in stone
   - an inline citation pill `[1]` in clay-soft with clay-stronger text after line 2
   - a source chip under the lines: document icon, "OS Notes.pdf · p. 45"
5. **The proof link.** A dashed connector (clay, 1.5px, dash 4 4, rounded caps) arcs from the `[1]` pill back over the cluster to the highlighted line 4 on the page, ending in a small clay dot.
6. **Next step (bottom right, x 318–540, y 330–420).** Small card-muted card with a success-soft "Next step" chip, the text "Revise Deadlock · you scored 2/5", and a small clay arrow. This matches the live rule-based recommendation.

### 10.3 Animation (once on load, total about 2.8s, then static)

| Time | What happens |
|---|---|
| 0–400ms | Pages fade and rise 8px, staggered |
| 400–800ms | The highlight on line 4 sweeps in from left to right (scaleX) |
| 800–1500ms | Passage tiles travel along the curve (`offset-path` or transform keyframes) and fade into the cluster |
| 1500ms | The Deadlock node fills clay with one soft scale (1 to 1.15 to 1) |
| 1600–2100ms | Answer lines draw in left to right |
| 2100–2600ms | The `[1]` pill appears, then the dashed connector draws (`stroke-dashoffset`) |
| 2600–2800ms | The next-step card rises in |

- **Reduced motion:** with `prefers-reduced-motion: reduce`, render the final state immediately.
- **Hover:** on pointer devices, hovering the `[1]` pill darkens the connector to clay-stronger. This is the only interaction.

---

## 11. Auth screens

- **Layout:** split on desktop. The form sits on the left half on paper (max 400px wide, centred). The right half is a stone-50 panel with a static, smaller version of the hero illustration (frame 5 only, no animation) and one line: "Every answer shows where it came from". Single column on mobile, with no illustration.
- **Screens:** Sign in and Create account. Add only the flows that exist in the backend today, such as forgot password; don't build screens for flows the API doesn't support.
- **Form behaviour:**
  - Labels sit above the inputs.
  - Show/hide password toggle.
  - The submit button shows a spinner and is disabled while pending.
  - Errors are generic and safe ("Email or password is incorrect").
  - Entered values are kept after an error.
- **After sign-up:** go straight to the dashboard's first-run checklist (12.3).

---

## 12. Dashboard

**The question it answers:** "What should I study next?"

### 12.1 Header

- **Greeting:** "Good evening, Amber", based on the client's local time, using the page title style.
- **Sub-line:** "Here's what to focus on next".
- **No primary button in the header:** the next-step card holds the primary action.

### 12.2 Returning student layout

1. **Next step card** (8 columns, card with a clay 3px left border). The overline "RECOMMENDED NEXT STEP", then the topic name as H3, then the reason in plain words from the recommendation API ("You scored 2/5 on Recursion, so start with the beginner quiz"). Buttons: one primary for the recommended action, and a secondary "Ask the tutor about this".
2. **Snapshot** (4 columns, card-muted). Two stacked mini stats: "Topics needing revision" and "Average quiz score".
3. **Stat row** (4 tiles, 3 columns each): Documents ready, Quizzes completed, Average score, Topics needing revision. Real queries only. If a number is already in the snapshot, drop it from one of the two places so nothing is duplicated.
4. **Needs revision** (6 columns): list rows with topic, accuracy bar with % text, attempts, band chip and a "Practise" button. At most 5 rows, then "View all progress".
5. **Recent activity** (6 columns): quiz date, topic and score, plus the last 3 tutor questions if the API stores them. Hide the tutor part if it doesn't.
6. **Score history:** a line chart, shown only with at least 3 attempts, single clay series, with labels.

### 12.3 New student (no documents)

Replace everything with a first-run checklist card:

- Title: "Get started in three steps"
- Progress line: "1 of 3 done"
- Step 1: Upload a PDF
- Step 2: Ask your first question
- Step 3: Take a quiz

Each step has a status (done from real API state) and one button; only the current step's button is primary. Don't show empty charts or zero-filled tiles.

---

## 13. Study tutor

**The question it answers:** "Can I trust this answer?"

Prompt A builds this screen on the current single-question `/ask` endpoint. Prompt B (section 20) then upgrades it to a full chat with history, follow-ups and streaming, reusing the same components.

### 13.1 Layout

- **Desktop (1280px and up):** conversation in the centre (max 760px) and a sources panel on the right (360px, card-muted, sticky, independently scrollable).
- **1024–1279px:** the sources panel opens as a right sheet from a "Sources (3)" button.
- **Mobile:** sources appear as a bottom sheet.
- **Threads:** no thread list unless the API has threads.

### 13.2 Composer

- **Placement:** sticky at the bottom of the conversation column.
- **Style:** paper, radius 16, stone border, shadow-md.
- **Input:** auto-growing textarea (1–6 lines). Placeholder "Ask a question about your material". Enter sends, Shift+Enter makes a new line.
- **Controls:** a document scope selector chip if the API supports scope; otherwise "Searching all your documents" as small ink-2 text. A round 36px clay-strong send button with an arrow icon, disabled when empty.

### 13.3 Empty state

- **Title:** "Ask about your material".
- **Suggestions:** four prompt cards built from the user's real document titles, for example "Summarise the key ideas in {title}" and "Explain the hardest topic in {title} simply". Clicking one fills the composer; it does not send.
- **No documents yet:** if the user has no ready documents, replace the suggestions with an empty state that points to the library.

### 13.4 Answer

- **Layout:** the question is right-aligned in a stone-100 bubble. The answer is left-aligned with no bubble, in body-large text with Markdown rendering.
- **Citations:** inline citation pills if the API returns markers. Otherwise a numbered "Sources" row of source chips under the answer. Citation data always comes from the API, never from parsing the model's text.
- **Actions:** small ghost icon buttons for Copy, plus "Quiz me on this" only if a topic-based quiz endpoint exists.

### 13.5 Loading

- **Honest progress only:** show "Searching your material and writing an answer" with a 3-line skeleton.
- **No fake stages:** don't show stages like "Retrieving… Reranking…" unless the backend actually streams stage events. When SSE streaming ships, stages can be added.

### 13.6 "Not found in your material" (designed state, not an error)

- **Style:** card-muted with a 24px `SearchX` icon in ink-2.
- **Title:** "Not found in your material".
- **Body:** "Your uploaded documents don't cover this, so I won't guess. Try rephrasing, or upload a source that covers it."
- **Buttons:** "Upload a source" (secondary) and "Rephrase" (ghost, focuses the composer).
- **Closest passages:** if the API returns them, show them as collapsed source cards labelled "Closest passages (not enough to answer)".

### 13.7 Errors

Use the error state with Retry, and keep the question in the composer.

---

## 14. Library, Quizzes, Progress

### 14.1 Library ("My library")

- **Header:** "My library", the sub-line "PDFs you upload are private to your account", and the primary button "Upload PDF".
- **Empty state:** a large dropzone card (card-muted, dashed stone-strong border, radius 12): "Drop a PDF here or choose a file", with the size limit and file type from config shown underneath. A normal file picker must also work; drag and drop is only an enhancement.
- **Table columns:** Title, Pages, Status chip, Uploaded (relative date with a full date tooltip), and a row menu (Open in tutor, Delete).
- **Processing:** the row shows a Processing chip and refreshes by polling at the existing rate. Nothing new is added on the backend.
- **Failed:** a Failed chip, the safe reason from the API, and the next step ("Upload a text-based PDF").
- **Delete:** a confirm dialog that names the file and says its passages will be removed.

### 14.2 Quizzes

- **List:** cards or a table with topic, difficulty chip, number of questions, source document and last score. Primary button: "New quiz".
- **New quiz dialog:**
  - Choose a document or topic, whatever the API takes.
  - Difficulty as segmented tiles.
  - Number of questions.
  - Generating state: "Writing questions from your material" with a skeleton.
- **Attempt:**
  - One question per view with a progress bar ("Question 3 of 10").
  - Options are full-width selectable rows (radio group semantics, keys 1–4), with selected state clay-soft and a clay border.
  - "Next" is disabled until an option is selected. The final button is "Submit quiz".
  - Answers are never revealed before submission. Submit is protected against double clicks.
- **Results:**
  - Large score "7 / 10" with a one-line verdict.
  - Per question: your answer, the correct answer (success or danger chips with icons), the explanation and the source citation.
  - Next step: "Review this topic" or "Try a harder quiz", matching the recommendation.

### 14.3 Progress

- **Header:** "Progress" and the sub-line "How you're doing on each topic, and why we suggest what we do".
- **Topic table:** topic, accuracy bar with % text, attempts, last practised and band chip, sortable by accuracy.
- **"How we decide" panel:** card-muted, stating the rule in plain language. The threshold numbers must come from the backend. If the progress response doesn't include them, add them to that response in the smallest backend change, with a test, rather than copying the numbers into the frontend (CLAUDE.md coding rule 7). Wording example: "Fewer than 3 attempts: not enough data. Under 60%: needs revision. 60–79%: practising. 80% and up: doing well."
- **Footnote:** "Scores reflect quiz results on your material, not your ability".

---

## 15. Evaluation Lab (admin only)

- **Header:** "Evaluation Lab" and the sub-line "How accurately EduRAG retrieves, cites and abstains, measured on a labelled question set". Primary button: "New run".
- **Headline tiles:** Hit@5, MRR, abstention accuracy and items tested, each with the sample size and run date. Add a change-versus-previous-run label only when a previous run exists.
- **Small-sample warning:** if the dataset is under 150 items, show a warning-soft banner: "Small test set ({n} items). Results may not reflect real course material". This keeps the honesty rule visible.
- **Abstention matrix:** a 2×2 grid (answerable versus not, by answered versus abstained) with counts and percentages, plain cells, and success-soft or danger-soft only on the correct and incorrect diagonals, with labels.
- **Compare view:** grouped bars per metric in clay and stone-strong, with a config diff (dense versus hybrid) as a two-column list.
- **Runs table:** date, config, items, status and a link to the run.

---

## 16. Settings, 404, 500, global

- **Settings:** profile name and email, plus sign out. Add sections only for what the backend supports.
- **404 and 500 pages:** inside `PageContainer`. Plain title ("Page not found"), one sentence and a primary "Go to dashboard" button, or "Go home" when signed out.
- **Toasts:** success messages are short and past tense ("Document deleted"), with no exclamation marks.

---

## 17. Removal audit: what to remove or change

Claude Code lists each instance in `docs/ui-audit.md` (screen, element, reason, decision) before changing anything. Remove:

1. All Midnight & Ice styling: midnight backgrounds, electric-blue tokens, glow, glass and backdrop blur, dot grids on dark canvases, noise overlays and blue-tinted shadows.
2. The dark theme and its toggle.
3. Gradient text, glowing borders, sparkles and decorative AI imagery.
4. Decorative icons that repeat the card title.
5. Stats shown twice on the same screen, and any number not backed by an API query.
6. Charts that don't lead to a decision, and charts with fewer than 3 data points.
7. Nav items, buttons or links to unbuilt features (move them to the roadmap via the registry).
8. Placeholder copy, lorem ipsum, fake testimonials, fake partner logos and fake percentages.
9. Trailing full stops in headings and buttons.
10. More than one primary button per screen.
11. Nested cards; replace them with dividers or inset wells.
12. Any page that sets its own side padding instead of using `PageContainer`.
13. Hard-coded hex colours in components.

**Do not delete working logic.** Removal is visual only. API calls, auth, validation, uploads, quiz scoring and permissions must keep working, and the existing tests must keep passing or be updated with a stated reason.

---

## 18. Copy, UX writing and accessibility

### 18.1 Copy

- **Voice:** plain, calm and specific. Write "Upload a PDF", not "Supercharge your learning".
- **Names:** use the same name for a thing everywhere: Study tutor, My library, Quizzes, Progress, Evaluation Lab.
- **Labels:** buttons start with a verb ("Upload PDF", "Start quiz", "Ask the tutor").
- **Empty states:** say what will appear there and the single next step.
- **Errors:** say what happened and what to do, with no codes or stack traces.
- **Language:** British/Pakistani English spelling is fine ("practise", "summarise"). Pick one and stay consistent.

### 18.2 Accessibility (WCAG 2.1 AA)

- **Contrast:** all text and UI pairs meet the ratios in 3.2. Update the existing contrast test so it checks every pair in that table, and delete the Midnight & Ice pairs.
- **Focus:** visible 2px clay focus ring with a 2px offset on every interactive element, with keyboard access to everything.
- **Quiz keyboard support:** arrow keys move between options in the radio group, keys 1–4 select, and Enter goes next.
- **Semantics:** semantic landmarks (header, nav, main, footer), one h1 per page and labels on every input.
- **Targets:** touch targets at least 40px on mobile.
- **Colour:** status is never shown by colour alone; chips always have text and icons where meaningful.

---

## 19. Build order and verification

Do one step at a time. After each step run `npm test`, `npm run typecheck` and `npm run lint` from `frontend/`, then commit.

1. **Audit.** Write `docs/ui-audit.md` and update CLAUDE.md with appendix A.
2. **Tokens and font.** Add the section 3 tokens, Google Sans Flex, and remove the old tokens. Update the contrast test.
3. **Primitives.** Build the section 7 components plus the `/dev/design` page showing every component in every state.
4. **Layout.** `PageContainer` per section 5, and the app shell and sidebar per section 8. Every existing page is moved onto `PageContainer`.
5. **Feature registry** (8.2), wired to nav.
6. **Landing page** (section 9) and hero illustration (section 10). Add real screenshots after step 8.
7. **Auth** (section 11).
8. **Dashboard** (section 12), **Study tutor** (section 13), **Library, Quizzes, Progress** (section 14), **Evaluation Lab** (section 15), **Settings, 404 and 500** (section 16).
9. **Screenshots.** Use Playwright with the seeded demo account to capture the landing feature screenshots, then put them into section 9.5.
10. **Final verification:**
    - `npm test`, `npm run typecheck`, `npm run lint`, `npm run e2e` from `frontend/`.
    - Backend `.venv/bin/pytest` and `.venv/bin/ruff check .` if any backend response changed.
    - Playwright screenshots of every main screen at 390, 768, 1280 and 1440px, saved to `artifacts/screens/`. Check each for horizontal scroll, clipped content, misaligned left and right edges, and uneven card heights in a row.
    - Check that the left content edge lines up at the same x position on the landing page, auth and every app page at 1440px.
    - Run axe checks if `@axe-core/playwright` is already installed. If it isn't, propose adding it in the report instead of adding it silently.
    - Walk through sign up, upload, ask, open citation, quiz, results, dashboard and progress with real data.
    - Report real command output, list any deviation from this brief with the reason, and list anything that could not run and why.

### Out of scope for this redesign

New backend features (except the chat upgrade in section 20, which runs as Prompt B), OAuth, classrooms, knowledge graph, BKT/FSRS, exam predictor, viva and the 100M-PDF scale claims. These stay as Guide v2 phases, to be decided by the owner later. A redesign must not imply that any of them exist.

---

## 20. Chat upgrade (Prompt B)

**Goal:** the Study tutor becomes a real chat. Students keep their conversations, ask follow-up questions naturally, watch the answer appear word by word with its sources shown first, and can stop it. Everything stays grounded in their own material, and every step is visible, which is what makes it look advanced in the demo.

Approved by the owner on 2026-11-18. It needs no new infrastructure: PostgreSQL, the existing Groq service and the existing retrieval are enough. Redis is used only for the optional rate limit.

### 20.1 What the student gets

- **Chat history:** a list of past conversations. Each one reopens with all its messages and citations, survives a page refresh, and can be renamed or deleted.
- **Follow-up questions:** "What about its base case?" is understood as "What is the base case of recursion?". The rewritten question is shown under the student's message as "Searched your material for: …", so they can see exactly what was searched.
- **Streamed answers:** status first ("Searching your material…"), then the source cards, then the answer text word by word. The student sees the evidence before the answer.
- **Stop:** a Stop button ends the answer early. The partial answer is kept and labelled "Stopped".
- **Answer feedback:** thumbs up or down, with an optional reason (Wrong, Missing source, Not clear). Feedback appears in the Evaluation Lab as a "Live feedback" list for admins.
- **Ask again:** re-sends the same question in the same thread.
- **Copy:** copies the answer text with its source list.

### 20.2 Grounding rules (do not break)

1. **Rewriting has one job.** Conversation history is used only to rewrite a follow-up into a standalone question. The answer prompt still receives only the retrieved passages and the standalone question. Earlier assistant answers are never treated as evidence.
2. **Same gate as today.** Retrieval and the similarity gate run exactly as they do now, on the standalone question, and `RETRIEVAL_MODE` is unchanged. If the gate abstains, no answer-generation call is made.
3. **Citations from the database only.** Citations come from retrieved chunk metadata. If the model writes a marker like `[4]` that was not in the sources, the UI drops it and never shows it as a citation.
4. **No rewrite on the first message.** The first message in a thread skips the rewrite call and is searched as typed, which saves latency and Groq quota.
5. **Fallback if rewriting fails.** If the rewrite call fails or times out, fall back to the original question and record that a fallback happened. Never fail the whole message because of the rewrite.

### 20.3 Data model (Alembic migration)

Use names that fit the existing models; these are suggestions.

| Table | Columns |
|---|---|
| `chat_threads` | id (UUID), user_id (FK, indexed), title, created_at, updated_at |
| `chat_messages` | id, thread_id (FK, indexed), user_id, role (`user` or `assistant`), content, standalone_query (nullable), rewrite_used (bool), abstained (bool), status (`complete`, `stopped`, `failed`), model, latency_ms (JSON per stage), created_at |
| `chat_citations` | id, message_id (FK), chunk_id (FK), marker (int), document_id, page_number |
| `message_feedback` | id, message_id (FK, unique per user), user_id, rating (`up` or `down`), reason (nullable), created_at |

- **Deleting:** deleting a thread deletes its messages, citations and feedback.
- **Deleted documents:** if a document is deleted, citations pointing to it are shown as "Source deleted", not as broken links.
- **Thread title:** the first question, trimmed to 60 characters. No LLM call is needed.

### 20.4 API

All endpoints are under `/api/v1/tutor` and every query is filtered by the authenticated user. Another user's thread returns 404, never 403, so it's not revealed that the thread exists.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/threads` | List the user's threads, newest first, paginated |
| POST | `/threads` | Create an empty thread |
| GET | `/threads/{id}` | Thread with its messages and citations |
| PATCH | `/threads/{id}` | Rename |
| DELETE | `/threads/{id}` | Delete |
| POST | `/threads/{id}/messages` | Send a question and get a streamed answer (SSE) |
| POST | `/messages/{id}/feedback` | Thumbs up or down |
| GET | `/feedback` | Admin only: recent feedback for the Evaluation Lab |

Keep `POST /tutor/ask` and its tests working. It can share the same service code underneath.

### 20.5 Streaming events

The response is `text/event-stream`. Check how the installed FastAPI version supports streaming responses or SSE, and that the Groq SDK version supports `stream=True`, in the official docs before writing code (CLAUDE.md coding rule 10). The events arrive in this order:

```text
event: status   data: {"stage": "rewriting"}            (only for follow-ups)
event: status   data: {"stage": "searching"}
event: sources  data: [{"marker": 1, "chunk_id": "...", "document_id": "...",
                        "document_title": "OS Notes.pdf", "page_number": 45, "snippet": "..."}]
event: status   data: {"stage": "writing"}
event: token    data: {"text": "A deadlock occurs when "}
event: done     data: {"message_id": "...", "abstained": false, "standalone_query": "...",
                       "latency_ms": {"rewrite": 0, "retrieve": 210, "generate": 1900}}
event: error    data: {"code": "provider_unavailable", "message": "..."}  (safe message only)
```

- **Abstained:** the stream sends `status: searching`, then `sources` with the closest passages (if any), then `done` with `abstained: true`. No token events.
- **Disconnect:** if the client disconnects (Stop), the server stops reading from Groq, saves the partial answer with status `stopped`, and does not keep generating in the background.
- **Saving order:** the user message is saved before streaming starts. The assistant message and its citations are saved when the stream ends or stops.
- **Timeouts and retries:** use the existing Groq service's timeout and retry settings. A rate-limit error from the provider becomes a friendly `error` event.

### 20.6 Chat screen design (extends section 13)

**Layout:**

| Width | Layout |
|---|---|
| 1536px and up | History panel (260px) · conversation (max 760px) · sources panel (340px) |
| 1280–1535px | History opens as a left drawer from a "History" button. Sources panel stays inline |
| 1024–1279px | History and sources both open as sheets |
| Mobile | Conversation only. History from a menu button, sources as a bottom sheet |

**History panel:**
- "New chat" is the primary button.
- A search box filters threads by title, client-side only.
- Threads are grouped by Today, Yesterday, Previous 7 days and Older.
- The active thread uses the same clay-soft style as the active nav item.
- Each row has a menu with Rename (inline edit) and Delete (confirm dialog).
- Routes are `/tutor` (new chat) and `/tutor/[threadId]`. Check how Next 16 handles dynamic route params before writing the page.

**Messages:**
- The student's message is a right-aligned stone-100 bubble. Under it, a small ink-2 line "Searched your material for: …" appears only when the rewrite changed the question.
- The answer is left-aligned with no bubble, and Markdown is rendered with raw HTML disabled. If no Markdown library is installed, propose one in the report instead of adding it silently.
- Source cards appear above the answer text as soon as the `sources` event arrives. Markers in the text become citation pills that open the sources panel.
- While streaming, a thin caret sits at the end of the text. Tokens are appended without layout jumps, and the page auto-scrolls only if the user is already at the bottom. Otherwise a "Jump to latest" button appears.
- The status line shows real stages only: "Understanding your follow-up", "Searching your material", "Writing answer".
- Actions appear under a finished answer: Copy, Ask again, thumbs up, thumbs down. Thumbs down opens a small popover with the three reasons.
- A stopped answer shows a stone "Stopped" chip. A failed answer shows the error state with Retry.

**Composer:**
- While streaming, the send button becomes a Stop button (square icon, secondary style).
- Esc also stops the answer.
- The composer stays usable during streaming, but sending is disabled until the current answer finishes.

**Empty new chat:** the section 13.3 suggestions built from document titles.

**Accessibility:**
- The streaming answer region uses `aria-live="polite"` and announces once when the answer completes, not on every token.
- Stop is reachable by keyboard.
- Thread rows are keyboard navigable.

### 20.7 Optional extras (build only if steps 1–6 pass)

- **Per-user message limit:** Redis based, 30 messages per 10 minutes. When the limit is reached, the friendly message says when the student can ask again.
- **Follow-up items in the Evaluation Lab:** add 10–20 follow-up question pairs to the eval dataset and report retrieval with and without rewriting. This gives a measured result for the rewrite step instead of a claim.

### 20.8 Tests and checks

**Backend (pytest, Groq mocked):**
- Thread CRUD: user B gets 404 on user A's thread for read, rename, delete and send.
- The event order matches 20.5 for answer, abstain and follow-up cases.
- Abstain makes no generation call and emits no tokens.
- Rewrite runs only when the thread has earlier messages, and falls back on error.
- Citations saved equal the retrieved chunks, and markers not in the sources are flagged.
- A stop or disconnect saves a partial answer with status `stopped`.
- Feedback is unique per user and message; the admin feedback list is forbidden to non-admins.

**Frontend (vitest):**
- The SSE parser handles events split across network chunks and several events in one chunk.
- Unknown markers are not rendered as pills.
- Composer keys work: Enter sends, Shift+Enter adds a new line, Esc stops.
- Stop aborts the request.
- Thread grouping by date is correct.

**End to end (Playwright):** new chat → ask → streamed answer with a citation → open citation → follow-up question showing "Searched your material for" → reload → history and citations still there → rename → delete.

**Manual demo check:** a follow-up on a real document retrieves the right page, and an unrelated question abstains inside a thread.

### 20.9 Build order

1. Migration and models.
2. Thread service and CRUD endpoints, with ownership tests.
3. Follow-up rewrite service, with tests.
4. Streaming message endpoint and saving, with event-order, abstain and stop tests.
5. Feedback endpoints, with tests.
6. Frontend: SSE client and parser, history panel, streaming messages, Stop, feedback, and an admin "Live feedback" list in the Evaluation Lab.
7. Feature registry: mark chat history, follow-ups and streaming as `live`. Update the landing tutor section copy ("Ask follow-up questions, see sources before the answer") and recapture its screenshot.
8. Section 20.8 checks, then README and API docs updated (CLAUDE.md coding rule 15).

---

## 21. Anti "AI-generated look" rules (Prompt C)

These are the patterns that make a page look machine-made. Claude Code checks every screen against this list and fixes every hit.

### 21.1 Banned patterns ("AI tells")

| # | AI tell | Do this instead |
|---|---|---|
| 1 | Centred hero with a gradient blob or glow behind it | Left-aligned text with the section 10 illustration on the right |
| 2 | A grid of 6 identical cards, each an icon in a rounded square, a title and two lines | Fewer sections with real product screenshots and alternating layouts (9.5) |
| 3 | Purple, blue or pink gradients and gradient text | Flat Paper, Clay & Stone colours only |
| 4 | Sparkle or star icons, "AI-powered" badges, robot or brain imagery | No AI imagery. The citations and sources are the "smart" visual |
| 5 | Words like "Unlock", "Supercharge", "Revolutionize", "Seamless", "Empower", "Next-level" | Plain, specific verbs: "Upload a PDF", "See the page it came from" |
| 6 | Fake stats ("10k+ students"), fake testimonials, fake logos, five-star rows | Real evaluation numbers with sample size, or nothing |
| 7 | All text centred, every section the same height | Left-aligned body, varied section rhythm, content-led heights |
| 8 | The same radius, shadow and padding on every element | Use the hierarchy in sections 5–7: borders at rest, shadows only on floating layers |
| 9 | Every card lifts and scales on hover | Hover only changes the border or background on clickable cards, with no scale |
| 10 | Pills and badges everywhere | Chips only for status (section 7) |
| 11 | Decorative icon on every heading and button | Icons only where they help people scan or recognise something |
| 12 | Low-contrast grey text in many shades | Only ink, ink-2 and ink-3 |
| 13 | Wavy SVG section dividers, floating 3D shapes, grain or noise | Background changes between paper and stone-50 |
| 14 | Generic lorem-style copy that could describe any app | Copy that mentions EduRAG's real objects: documents, pages, citations, topics, quizzes |
| 15 | A pricing table for a product that isn't sold | No pricing section |
| 16 | Emoji used as icons | Lucide icons |

### 21.2 What makes a design look made by a person

- **Real UI as the visual:** the product's own screens, not illustrations of the product. The hero SVG is the single exception, and it shows real product concepts.
- **Strong type contrast:** big jumps between display, title and body sizes, and tight headline tracking.
- **Density where it helps:** tables and lists in the app are compact and scannable, not padded like marketing cards.
- **Craft details:** hairline dividers, tabular numbers, aligned baselines, an icon size consistent within each context, and real empty states.
- **Asymmetry with a reason:** 8+4 and 7+5 grids, with the most important item biggest.
- **Specific copy:** every sentence could only be about EduRAG.

### 21.3 Review loop (required for every screen)

1. Open the screen in the browser with Playwright MCP at 1440px and 390px and take screenshots.
2. Score it against the 16 tells in 21.1. List every hit with the file and line.
3. Fix the hits, take new screenshots and compare before and after.
4. A screen is done only when it has zero tells and passes the section 19 checks.
5. Save the before and after screenshots to `artifacts/screens/review/` and list the changes in `docs/ui-audit.md`.

---

## Appendix A: replacement text for CLAUDE.md

Replace the "Design direction" bullet under "Owner decisions" with:

```markdown
- Design direction (2026-11-18) is "Paper, Clay & Stone", a light-only theme defined in
  docs/UI_REDESIGN.md. It replaces "Midnight & Ice" (Guide v2 section 13 and appendix 20).
  Owner colours: white #FFFFFF (main), clay #D36243 (accent), stone #DCDCDC (cards, borders).
  Clay Strong #B5492C is used for button fills and links because white on #D36243 fails AA
  for small text. Font: Google Sans Flex. No glow, glass, gradients or dark theme.
- Chat upgrade approved (2026-11-18): tutor threads with saved history, follow-up rewriting,
  SSE streamed answers, Stop and answer feedback, as specified in docs/UI_REDESIGN.md
  section 20. History is used only to rewrite follow-ups, never as evidence. No new
  infrastructure.
```

Replace UI rules 1 and 2 with:

```markdown
1.  Use the Paper, Clay & Stone tokens from docs/UI_REDESIGN.md section 3 through shared CSS
    variables; never hard-code hex values in components. Light theme only.
2.  No glow, glass, gradients, noise, sparkle effects or decorative AI visuals. Clay is an
    accent (at most three places per viewport) and never a status colour. Avoid fake cursors,
    fake logos, fake metrics and excessive pills.
```

Add to the UI note from the owner:

```markdown
Every screen, including landing and auth, uses PageContainer (max 1200px; side padding
16/24/32px at <640/640-1279/>=1280px). Sections and cards follow the spacing scale in
docs/UI_REDESIGN.md section 5.
```