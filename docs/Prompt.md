# EduRAG — Completion Plan for Claude Code

> **How to use this file**
> 1. Save this file in the repo as `docs/COMPLETION_PLAN.md` and commit it.
> 2. Open Claude Code in the repo root and send:
>    `Read docs/COMPLETION_PLAN.md fully. Do PHASE 1 only. Follow every rule in "Part A". Stop when Phase 1 acceptance checks pass and give me the phase report.`
> 3. Review and test the result yourself, then repeat with PHASE 2, PHASE 3 and PHASE 4.
>
> Do one phase per session. Do not ask Claude Code to do all four phases at once.

---

## PART A — Context and rules (apply to every phase)

### A1. What this project is
EduRAG is a Final Year Project: a RAG-based adaptive learning and exam preparation system. Students upload their own material. Every answer, quiz and explanation must come from that material and cite its source. When the material doesn't cover something, the system must say so instead of guessing.

The client's proposal requires these features (section 5 of the proposal):
- **Core:** Student Profile Builder (diagnostic quiz), Personalized Dashboard with a Course Map, and auto content generation from the student's material.
- **Adaptive Engine:** automatic difficulty adjustment, a weak-topic detector, and learning-path re-routing ("like a GPS").
- **RAG:** one private knowledge base per student, built from PDFs, notes and YouTube transcripts. Citations look like "Chapter 3, Page 45". There is a doubt-solver chatbot, and a "not found" answer when there's no evidence.
- **Differentiating features:** Mood-Based Learning, Exam Predictor (from past papers), Teacher-Clone Mode, Peer-Match Learning, Cheating-Proof Viva Bot (oral), and Study Reminders with Slip Tests.
- **Stack:** Next.js + Tailwind, a FastAPI REST API, PostgreSQL, a vector DB, sentence-transformer embeddings and an LLM that answers only from retrieved context. JWT authentication for **Student and Teacher accounts**. **AES-256 encryption**. Cloud deployment (Vercel + Render/Railway, or AWS/Azure).

### A2. What already exists (verified by reading the code, not the README)
- **Backend:** `backend/app` uses FastAPI, SQLAlchemy 2, Alembic, PostgreSQL + pgvector, `BAAI/bge-small-en-v1.5` embeddings and Groq as the LLM (`services/groq_service.py`). An ARQ + Redis worker exists (`workers/`) but is currently used only for evaluation runs.
- **Routes:** `auth`, `documents` (PDF upload, `/text`, `/website`), `tutor` (threads, SSE streaming, feedback), `quizzes` (generate, submit, attempt, `notes.pdf`), `progress` (summary, topics, insights), `evaluation` (admin only) and `health`.
- **Models:** `User` (with `is_admin` but no role), `Document`, `DocumentChunk` (`page_number`, `embedding`, `tsv`), `Topic`, `Quiz`, `Question`, `QuizAttempt`, `QuestionResponse`, `TopicProgress`, chat models and evaluation models.
- **Adaptivity today:** `services/recommendation_service.py` sorts topics into `insufficient_data`, `needs_revision` (<60%), `practicing` or `doing_well` (≥80%) and returns advice text only. **Difficulty is never changed automatically.** `frontend/components/tutor/quiz-card.tsx` hardcodes `difficulty: "intermediate"`, so the "Try a harder quiz" button in `components/quizzes/quiz-result.tsx` does not actually give a harder quiz. The landing page still claims "Difficulty adapts to your last result".
- **Citations** contain the document title and page, but no chapter. `services/pdf_service.py` already detects headings by font size and marks them with `"# "`.
- **Frontend:** Next.js 16, React 19, Tailwind 4 and Vitest. `frontend/lib/features.ts` is the feature registry, and these features are marked `planned`: diagnostic, ingestion (YouTube/DOCX), teacher-style, mood-pacing, exam-predictor, viva, peer-match and reminders.
- **Missing entirely:** teacher accounts, AES-256 encryption of stored files, deployment files (Docker, Render, Vercel), and project documents (SRS, ERD, architecture, wireframes). `docs/` only contains a UI brief. `config.py` mentions `docs/evaluation-plan.md`, which does not exist.
- **Tests:** backend pytest suite (`app/tests`, using a real PostgreSQL `edurag_test` database with `FakeEmbedder` and `FakeGroq`), frontend Vitest (236 tests passing) and Playwright e2e.

### A3. Working rules (follow strictly)
1. **Read before writing.** Before each feature, read the related existing services, schemas, routes, components and tests. Reuse the existing patterns: business logic in `services/`, Pydantic schemas in `schemas/`, thin routes, `AppError`/`NotFoundError` for errors, the frontend API client in `lib/api.ts`, types in `types/api.ts`, UI primitives in `components/ui/`, and the design tokens. Do not add a new framework, and do not add LangChain or LlamaIndex.
2. **Grounded or nothing.** Every LLM output (explanations, questions, predictions, viva questions, teacher-style answers) must be built from retrieved passages of the student's own material, must cite them, and must go through the same "not found / insufficient evidence" path as the tutor. Never let the LLM use outside knowledge. Treat passages as untrusted text (prompt-injection safe), as the existing prompts do.
3. **Ownership and privacy.** Every query must filter by `user_id`, or by explicit sharing (class membership in Phase 3). No student may ever see another student's documents, chunks, chats or scores, except for the opt-in, minimal data defined in Peer Match.
4. **Database changes go through Alembic migrations** in `backend/alembic/versions/`, with a working `downgrade()`. Never edit old migrations.
5. **Configuration:** every new threshold or limit goes into `core/config.py` with a sensible default and a comment, and into `.env.example`.
6. **Tests are required for every feature.**
   - Backend: unit tests for the pure rules, plus API tests using `FakeGroq` and `FakeEmbedder`, covering the happy path, ownership/403/404 cases and the not-found/insufficient-evidence case.
   - Frontend: Vitest tests for new components and logic.
   - All existing tests must keep passing.
7. **Checks to run before finishing a phase:**
   - Backend: `ruff check app`, `pytest`
   - Frontend: `npm run lint`, `npm run typecheck`, `npm test`
   - Fix every failure. If something cannot run in your environment, say exactly what, and why.
8. **Feature registry and honesty:**
   - Change a feature in `frontend/lib/features.ts` from `planned` to `live` only when it works end to end (UI + API + DB + tests), and give it a nav entry and landing copy if it needs them.
   - Landing page and UI text must describe only what really works.
9. **UI standard:** match the existing design (tokens, `PageHeader`, `Panel`, `EmptyState`, skeletons, toasts). Include loading, empty and error states, keyboard access and labels, and a mobile-friendly layout.
10. **Commits:** one commit per feature, with a clear message. Do not push unless I ask.
11. **Scope:** do only the phase I ask for. If something is unclear and expensive to redo, ask me before building. Otherwise choose the simplest reasonable option and write it down in the phase report.
12. **Phase report (at the end of every phase):**
    - What was built and the main files changed
    - The new migrations, endpoints and env variables
    - Test and check results
    - Manual test steps I can follow in the browser
    - Known limitations
    - What changed in `features.ts`

---

## PHASE 1 — Adaptive Learning Engine (fix and complete the core loop)

**Goal:** make the adaptive loop in the proposal (sections 5.1 and 5.2) real: diagnostic → per-topic level → automatic difficulty → weak topics → course map with re-routing → mood-aware pacing. Also add chapter-level citations.

### 1.1 Topic extraction (foundation for everything else in this phase)
- When a document reaches `ready` status, extract its main topics.
  - Use the PDF outline (`pymupdf` `doc.get_toc()`) when it exists. Otherwise use the detected `"# "` headings. Otherwise ask the LLM to name 3–12 topics from a sample of the document's chunks.
  - Save each topic in document order.
- Data model: reuse `Topic` (keep names unique per user, case-insensitive) and add a `document_topics` link table: `document_id`, `topic_id`, `position`, and `first_page` (nullable).
- Each topic needs a way to retrieve its passages. Store an anchor (`first_page`/`last_page`, or the heading text) so a quiz on that topic can pull the right chunks.
- Add a backfill script under `app/scripts/` for documents that already exist.
- Deleting a document removes its links. A topic is removed only when no document and no progress uses it.

### 1.2 Chapter-aware citations
- Add `section_title` (nullable, 255 characters) to `DocumentChunk`. Fill it during chunking from the TOC chapter that covers the chunk's page, falling back to the nearest heading above the chunk.
- Add `section_title` to the `Citation` schema, the `ChatCitation` snapshot (new column), and the quiz question `sources` JSON.
- UI: citations read **"Chapter 3: Recursion · Page 45"**. When there is no chapter, keep the current format.
- Extend `app/scripts/reindex_documents.py` so existing documents get section titles.

### 1.3 Automatic difficulty adjustment (fix the broken behaviour)
- Add `current_difficulty` (`beginner`/`intermediate`/`advanced`, default `beginner`) to `TopicProgress`. It is set by the diagnostic (1.4) or by the first quiz.
- Rule (a pure function in `recommendation_service`, with its thresholds in config):
  - After each submitted attempt on a topic: score ≥ 80% → move **up** one level; score < 50% → move **down** one level; anything else → stay.
  - Two failed attempts in a row at `beginner` → set a `needs_support` flag, which Mood mode (1.6) uses.
- `GenerateQuizRequest.difficulty` becomes **optional**. When it is omitted, the server uses the topic's `current_difficulty` (or `beginner` when there is no history). The quiz still records the difficulty it actually used.
- `AttemptResult` returns `previous_difficulty`, `next_difficulty` and a plain reason, for example "You scored 9/10, so your next quiz on Recursion will be advanced."
- Frontend:
  - Remove the hardcoded `"intermediate"` from `quiz-card.tsx` and send no difficulty unless the student chose one.
  - "Try a harder quiz" and "Try another quiz" must create a quiz on **that topic** at `next_difficulty` (pass the topic and difficulty through the URL to `/tutor?mode=quiz`, or start it directly).
  - Show the level chip and level changes ("Level up: Intermediate → Advanced").
  - On the generate panel the student may still override the difficulty manually; label that clearly.
- Simpler content for weak topics: when the tutor's retrieved passages map to a topic with `needs_revision` status, add an instruction to the answer prompt asking for simpler wording and one extra example from the passages. Show a small note under the answer: "Explained more simply because this topic needs revision."

### 1.4 Student Profile Builder (diagnostic quiz)
- Trigger: once the student has at least one ready document and has never taken a diagnostic, the dashboard shows a "Start your diagnostic" card. A diagnostic can be retaken later from Settings or the Course Map.
- Content: 1–2 questions per extracted topic (maximum 15 questions in total), at mixed difficulty, drawn from passages for each topic. Reuse the quiz generator and its validation (`validate_generated`). Mark the quiz `kind = "diagnostic"` (new column on `Quiz`, default `"practice"`).
- Results:
  - Seed `TopicProgress` for every topic, with `current_difficulty` set from the score: 0–1 correct → beginner, half → intermediate, all → advanced.
  - Show a results page with a strengths / weak topics summary and a link to the Course Map.
- `features.ts`: `diagnostic` → live.

### 1.5 Personalized Course Map and learning-path re-routing
- New endpoint `GET /api/v1/learning-path`. It returns the student's ordered study path; each topic has its status, level, accuracy, source document/pages and "next action", and the path marks one current step.
- Ordering rule:
  - Start from document order.
  - Then move every `needs_revision` topic to the front (the weakest first).
  - `doing_well` topics move to the end as "review later".
  - Topics with `insufficient_data` keep their document order.
- Re-routing: when an attempt changes a topic's status, record a `path_events` row (`user_id`, `topic_id`, `old_status`, `new_status`, `reason`, `created_at`).
  - The Course Map shows a "Route updated" banner, for example: "Recursion moved up because you scored 2/5."
  - The Course Map shows a short history of route updates.
- Frontend:
  - New page `/course-map` (nav group "Learn"). It shows the path as a vertical stepper, with status colours, level chips and buttons: "Study" (opens the tutor with "Explain <topic>"), "Quiz" (quiz on that topic at its level) and "Source" (document and pages).
  - The Dashboard shows the current step and the latest route update.

### 1.6 Mood-Based Learning (mood-aware pacing)
- Signals (a pure function, with thresholds in config). Any one of these triggers it:
  - ≥ 3 wrong answers in a row across the student's most recent answers
  - two quiz attempts in a row below 40%
  - the `needs_support` flag from 1.3
- Response, called "light mode":
  - The next step for that topic becomes:
    - (a) a short "Quick recap" card: 3–4 simple sentences, one example and one memory tip (mnemonic), all generated **only** from the topic's passages, with citations
    - (b) a 3-question beginner "confidence quiz"
    - (c) optionally, a link to the student's own uploaded YouTube lecture on that topic, once Phase 2 exists
  - After the student passes the confidence quiz (≥ 2/3), return to the normal level.
  - Never invent memes, videos or outside content.
- Tone: supportive and neutral, for example "Let's take a lighter step on Recursion". Never write "you seem frustrated".
- Store each light-mode episode, with its start, end and reason, for analytics.
- Add a Settings toggle "Lighter steps when I'm struggling" (on by default). Store it in a new `user_preferences` table, or in columns on `User`.
- `features.ts`: `mood-pacing` → live.

### Phase 1 acceptance checks
- [ ] Taking a quiz at ≥ 80% makes the next quiz on that topic one level harder automatically. A score below 50% makes it easier. Tests prove both, including the boundaries (exactly 50% and exactly 80%).
- [ ] No hardcoded difficulty remains in the frontend quiz flow. "Try a harder quiz" really produces a harder quiz on the same topic.
- [ ] The diagnostic seeds the levels of all topics. The Course Map reorders itself and shows "Route updated" after a bad result.
- [ ] Citations show the chapter when the PDF has one.
- [ ] Light mode triggers after 3 wrong answers in a row and ends after a passed confidence quiz.
- [ ] All checks from rule A3-7 pass, and the phase report is written.

---

## PHASE 2 — Knowledge sources and exam preparation

**Goal:** complete the RAG knowledge system (YouTube, document types, background processing) and build the Exam Predictor and Teacher-Clone Mode.

### 2.1 Document kinds
- Add `kind` to `Document`: `notes` | `textbook` | `past_paper` | `teacher_material` | `lecture` (default `notes`).
  - The student picks the kind on upload and can change it later from the Library (PATCH endpoint).
  - Past papers also get an optional `exam_year` (int) and `exam_session` (string).
- The Library shows a kind chip and lets the student filter by kind.

### 2.2 YouTube lecture ingestion
- New endpoint `POST /documents/youtube` with `{url, title?}`.
  - Accept `youtube.com/watch`, `youtu.be` and `/shorts` URLs, and validate the video ID.
  - Fetch the transcript with `youtube-transcript-api` (pin its version in `requirements.txt`). Prefer English, and fall back to an auto-generated transcript.
  - If no transcript is available or the fetch is blocked, return a clear 422 error that offers the existing "paste transcript" option (`/documents/text`).
- Store the transcript as a `.txt` file, like the text source, with `mime_type` `video/youtube` and `kind = lecture`.
- Chunk with timestamps: add `start_seconds` (nullable int) to `DocumentChunk`. Citations for lectures show **"Lecture title · 12:34"** and link to `https://youtu.be/<id>?t=754`.
- UI: the Library upload panel gets a "YouTube lecture" tab.
- `features.ts`: `ingestion` → live (update its text to say PDF, notes, web pages and YouTube). Optional and only if simple: DOCX upload via `python-docx`.

### 2.3 Move document processing to the background worker
- Today, indexing runs inside the upload request. Large PDFs and transcripts must instead go through ARQ:
  - The upload route saves the file, creates the document as `processing` and enqueues `process_document_job`.
  - Topic extraction (1.1) runs after indexing in the same job.
- The frontend already shows status. Make it poll until the status is `ready` or `failed`.
- Keep a synchronous fallback for tests/dev, controlled by a config flag `PROCESS_DOCUMENTS_INLINE` (default `false` in production, `true` in tests).

### 2.4 Exam Predictor
- Input: the student's `past_paper` documents (at least 2 are needed for a prediction; with 1, show "Add more past papers").
- Pipeline (`services/exam_predictor_service.py`):
  1. **Split each past paper into questions.** The LLM gets the paper's pages and returns JSON `[{question_text, marks?, page}]`. Validate the result: drop empty or duplicate questions, and keep page numbers within range. Cache the output in a `past_paper_questions` table, so a paper is only processed once (redo it when the paper is re-uploaded).
  2. **Map each question to a topic:**
     - Embed the question and find the closest of the student's extracted topics, using topic anchor passages from notes/textbooks.
     - Accept a match only above a similarity threshold (config). Questions below it go into an "Unmatched" group; never force them into a topic.
  3. **Score each topic:**
     - `papers_with_topic / total_papers` (frequency)
     - a recency weight (newer `exam_year` counts more)
     - total marks
     - Output a 0–100 "likelihood score" and a label: High / Medium / Low.
- Output (`GET /api/v1/exam-predictor`): topics ranked by score. **Every topic shows its evidence**: the actual past questions, with paper title, year and page, as clickable citations. The page also states the rule in plain words, for example "Appeared in 4 of 5 papers, most recently 2025".
- Revision plan: buttons on each topic — "Quiz me on this topic" (at its current level), "Explain this topic" and "Add to my Course Map priority". Predicted High topics that are also weak go to the top of the Course Map, with the reason "likely in exam".
- Honesty: the page shows the disclaimer "Based only on the past papers you uploaded; not a guarantee."
- New page `/exam-predictor` (nav group "Practise"). `features.ts`: `exam-predictor` → live.

### 2.5 Teacher-Clone Mode
- Requires at least one `teacher_material` document. If there is none, the toggle is disabled and says "Upload your teacher's slides or notes and mark them as Teacher material".
- Style profile (`services/teacher_style_service.py`):
  - Build it once per change to the teacher material, and store it in a `teacher_style_profiles` table.
  - The LLM reads a sample of the teacher's passages and extracts:
    - a glossary of the teacher's own terms and definitions
    - typical phrases, analogies and examples
    - how the teacher structures explanations, for example "definition → example → common mistake"
  - Every item must quote or cite a teacher passage. Drop items without a source.
- Tutor: a "Teacher style" toggle in the composer (next to the existing modes). When it is on:
  - Retrieval boosts `teacher_material` chunks: search them first, then fill the remaining slots from other material.
  - The answer prompt includes the style profile and the instruction to use the teacher's terms, phrasing and structure, while still answering only from the retrieved passages and citing them.
  - The answer shows the badge "In your teacher's style" and lists the teacher sources.
- The tutor's insufficient-evidence rule still applies.
- `features.ts`: `teacher-style` → live.

### Phase 2 acceptance checks
- [ ] A YouTube URL with captions becomes a ready document, and its citations open the video at the right second. A URL without captions gives a clear error and offers the paste option.
- [ ] Uploads are processed by the worker, and the Library updates by itself when processing finishes.
- [ ] With 3 sample past papers, the predictor ranks topics and shows the real past questions as evidence for every topic. Unmatched questions are listed separately.
- [ ] Teacher style uses the teacher's terms (a test checks that a glossary term from the teacher material appears in the prompt and that teacher chunks are retrieved first).
- [ ] All checks pass, and the phase report is written.

---

## PHASE 3 — Teacher accounts, Peer Match, Viva Bot, Reminders and Slip Tests

**Goal:** add the Student/Teacher account types from the proposal, plus the remaining differentiating features.

### 3.1 Student and Teacher accounts
- Add `role` (`student` | `teacher`, default `student`) to `User`. Keep `is_admin` separate; admin is not a role.
- Registration has an account-type choice. The JWT/session includes the role. Add `require_teacher` next to the existing `require_admin` in `api/deps.py`.
- Add `display_name` to `User` (required for new accounts, backfilled from the part of the email before "@"). It is used by Peer Match, so emails are never shown to other users.
- **Classes:**
  - A teacher creates a class (`classes`: `id`, `teacher_id`, `name`, `join_code` (unique, 8 characters), `created_at`) and shares documents with it (a `class_documents` link table).
  - A student joins with the code (`class_members`). Leaving is possible, and the teacher can remove a member.
- Shared material:
  - Documents shared with a class are indexed once (by the teacher) and become searchable for every member.
  - Update `retrieval_service` and every ownership check so the allowed document set is "own documents + documents shared with my classes".
  - Shared documents are read-only for students, and they count as `teacher_material` for Teacher-Clone mode.
  - Add tests proving that a non-member cannot retrieve, cite or open them.
- Teacher dashboard (`/teacher`):
  - a class list, a member count and shared documents
  - **class weak topics**: aggregated accuracy per topic, shown only when at least 3 students are in the data
  - per-student topic status for the teacher's own class members only
- Teachers do not see students' private documents or chats.

### 3.2 Peer-Match Learning
- Opt-in: a Settings toggle "Let me be matched with students who have the same weak topics" (off by default).
- Matching:
  - Find opted-in students whose `needs_revision` topics match (normalised topic name, or embedding similarity of topic names above a config threshold).
  - Prefer students in the same class.
  - Show the matches as "display_name — shared weak topic: Recursion". Show nothing else.
- Duel flow (privacy-safe):
  - One student sends a challenge on a topic, and the other accepts or declines.
  - **Each player gets a quiz generated from their own material** (or from the shared class material when both are in the same class) on that topic, with the same number of questions and the same difficulty.
  - Both answer within a time limit (config, for example 10 minutes).
- Results:
  - Compare scores and time, show the winner and a short summary. Both players' topic progress updates normally.
  - Tables: `peer_challenges` (`challenger_id`, `opponent_id`, `topic_name`, `difficulty`, `status`, `expires_at`) and per-player `quiz_id` and score.
- In-app notifications (3.4) announce challenges and results.
- Add a block/report option and rate limits on challenges.
- `features.ts`: `peer-match` → live.

### 3.3 Cheating-Proof Viva Bot (oral exam)
- The student chooses a topic, and a session of 5 questions starts.
- Questions:
  - Generated from **random** passages of that topic. The passages are reshuffled each session, so the questions differ every time.
  - After each answer the bot asks **one follow-up** that probes understanding (why/how/example), based on what the student said and the passages.
- Voice:
  - The question is spoken with the browser `speechSynthesis`.
  - The answer is recorded with `MediaRecorder` and sent to a new endpoint that transcribes it with Groq's Whisper transcription (`groq` SDK, model in config, for example `whisper-large-v3`).
  - If the microphone or transcription isn't available, fall back to typed answers.
  - The student sees the transcript and can confirm it.
- Anti-cheating measures:
  - a per-answer time limit (config, for example 90 seconds)
  - no going back
  - questions are not revealed in advance
  - the page logs tab switches during an answer (`visibilitychange`) and shows them in the report
  - copy/paste is disabled in typed-answer mode
- Scoring:
  - The LLM grades each answer against the source passages with a rubric (accuracy, completeness and own words, each 0–2), and gives a short justification that cites the passages.
  - Grades must be returned as validated JSON.
  - The final report shows per-question scores, the ideal answer points with citations, and weak points.
  - Viva results also update topic progress, with a lower weight than quizzes (config).
- Tables: `viva_sessions`, `viva_turns`. New page `/viva` (nav group "Practise"). `features.ts`: `viva` → live.

### 3.4 Study Reminders and Slip Tests
- Due topics (spaced repetition, a pure function with intervals in config):
  - A topic is due when `now - last_practiced_at` exceeds its interval:
    - `needs_revision`: 1 day
    - `practicing`: 3 days
    - `doing_well`: 7 days
  - The interval doubles after each passed slip test, up to a maximum of 30 days.
- Slip tests:
  - 3 quick questions on one due topic, at the topic's current level. `Quiz.kind = "slip_test"`.
  - They are started from the dashboard card "Slip test due: Recursion (2 min)" or from a notification.
  - Results update progress and the difficulty rule.
- Reminders:
  - An ARQ **cron job** runs hourly, finds students with due topics, and creates in-app notifications (`notifications` table: `user_id`, `type`, `title`, `body`, `link`, `read_at`, `created_at`).
  - Respect the user's preferences: reminder on/off, preferred time of day, and at most 1 reminder per day.
- Optional email: when `SMTP_*` settings are configured, also send an email using the same template. Without them, use in-app only. Never fail if SMTP is missing.
- Frontend:
  - a bell icon with an unread count and a notifications panel (mark as read, mark all as read)
  - a Settings section for reminder preferences
  - a dashboard "Due today" card
- `features.ts`: `reminders` → live.

### Phase 3 acceptance checks
- [ ] A teacher can create a class and share a document. A student joins with the code and gets answers citing that document. A non-member gets 404/403 everywhere (tests).
- [ ] Two opted-in students with the same weak topic see each other only by display name, can duel, and both see the results.
- [ ] A viva session works with voice and with typing, asks follow-ups, enforces time limits, and produces a cited rubric report.
- [ ] Due topics create one notification per day at most. A slip test updates progress and the topic's level.
- [ ] All checks pass, and the phase report is written.

---

## PHASE 4 — Security, deployment, quality and FYP documentation

**Goal:** make the project production-ready, deployable and fully documented for the client and the FYP defense.

### 4.1 AES-256 encryption at rest
- Encrypt every stored upload (PDF, txt, transcripts) with **AES-256-GCM** using the `cryptography` package. The key comes from `FILE_ENCRYPTION_KEY`, a base64 32-byte value; refuse to start in production without it.
- File format:
  - a header (version byte)
  - a 12-byte random nonce per file
  - the ciphertext + tag
- Store the key ID or version on `Document` so keys can be rotated later.
- Put all file reads and writes behind one module (`services/file_store.py`, with `save_encrypted` and `open_decrypted`). Use it in upload, reindex, processing jobs, notes PDF and the YouTube/text sources. Decrypted bytes stay in memory or in a temporary file that is deleted afterwards.
- Add a one-time migration script, `app/scripts/encrypt_existing_files.py`, that is idempotent and can be dry-run.
- Document honestly in `docs/security.md`:
  - Chunk text and embeddings in PostgreSQL are not application-encrypted, because search needs them. Encrypt them with managed-database encryption at rest.
  - Passwords use Argon2.
  - The JWT is stored in an httpOnly cookie.
  - The web-link import has an SSRF guard.
- Also add:
  - **Rate limits** on login, registration, LLM-heavy endpoints and peer challenges (simple Redis-based limiter).
  - **Security headers** on the frontend.
  - **Audit**: run `pip-audit` and `npm audit`, and fix the high/critical findings.

### 4.2 Deployment
- `backend/Dockerfile`:
  - multi-stage build, non-root user
  - pre-downloads the embedding model at build time
  - runs `alembic upgrade head` on start, then `uvicorn`
- A worker image or command for ARQ (including the cron jobs).
- `docker-compose.yml` at the root:
  - `pgvector/pgvector:pg16`, `redis:7`, backend, worker and frontend
  - volumes for the database and uploads, healthchecks, and an `.env` file
  - `docker compose up` must give a working app locally.
- Cloud configuration, as in the proposal:
  - `render.yaml` (web service + worker + Redis, with Postgres from Render or Neon/Supabase with pgvector enabled)
  - `frontend/vercel.json` or the matching notes
  - Check how `frontend/proxy.ts` and `lib/api-client.ts` reach the API, and make cookie auth work across the deployed domains:
    - **Preferred:** keep API calls same-origin through the Next.js proxy/rewrite.
    - **Otherwise:** set `SameSite=None; Secure` and the CORS origins correctly.
- Fonts: switch `next/font/google` to `next/font/local` (self-hosted Hanken Grotesk files) so builds don't depend on Google Fonts at build time.
- `docs/deployment.md`: step-by-step instructions for local Docker, Render + Vercel, the required env variables, how to create the first admin (`app/scripts/make_admin.py`), and backups.

### 4.3 Quality and end-to-end testing
- Playwright e2e tests (extend `frontend/e2e/`), one per feature:
  - register (student/teacher) → upload → diagnostic → course map → adaptive quiz level change → tutor with chapter citation → YouTube (mocked) → exam predictor → teacher style → class sharing → peer duel → viva (typed) → slip test → notification
- Add a GitHub Actions workflow `.github/workflows/ci.yml`:
  - backend: ruff + pytest against a pgvector service container
  - frontend: lint, typecheck, Vitest and build
- Evaluation Lab: add datasets that cover the new features where it makes sense, and create the missing `docs/evaluation-plan.md` that `config.py` refers to.
- Review the codebase for:
  - TODOs
  - dead code
  - unused files (remove the `.DS_Store` files and add them to `.gitignore`)
  - consistent error messages
- Every `features.ts` item must be `live`, and the landing page roadmap section must be removed or updated.

### 4.4 FYP and client documentation (in `docs/`)
- `SRS.md`: functional requirements (one per feature, with IDs, for example FR-ADAPT-01), non-functional requirements (security, performance, privacy, availability), use cases per actor (Student, Teacher, Admin) and acceptance criteria.
- `ERD.md`: a Mermaid `erDiagram` generated from the real SQLAlchemy models, including every new table, with a short description of each table.
- `architecture.md`: Mermaid diagrams for the system architecture (Next.js → FastAPI → PostgreSQL/pgvector, Redis/ARQ worker, Groq, embeddings), the RAG flow, the adaptive loop and the deployment.
- `wireframes/`: screenshots of every page, taken with `frontend/e2e/review/capture.mjs` and extended to the new pages, plus a `README` index.
- `design-decisions.md`: why pgvector instead of Chroma/FAISS/Pinecone, why a custom retrieval pipeline instead of LangChain/LlamaIndex, why Groq, and why RAG instead of fine-tuning. Each with its trade-offs, answering the proposal's stack section honestly.
- `test-report.md`: test counts per suite, e2e coverage, evaluation-lab metrics (hit rate, MRR, abstention accuracy) and known limitations.
- `user-guide.md`: how students and teachers use every feature.
- Rewrite the root `README.md` so it matches the code exactly: features, setup, env variables, scripts and deployment.

### Phase 4 acceptance checks
- [ ] Stored files are unreadable without the key. The app works normally with it. The migration script encrypts old files safely.
- [ ] `docker compose up` gives a working app from a clean clone. The Render/Vercel configuration and docs are complete.
- [ ] CI passes, and every feature has an e2e test.
- [ ] Every proposal feature appears in the SRS with its status "Implemented" and a pointer to the code and tests.
- [ ] The final phase report includes a table: proposal feature → implemented where → tested where.

---

## Final mapping — proposal requirement → phase

| Proposal requirement | Phase |
|---|---|
| Student Profile Builder (diagnostic quiz) | 1.4 |
| Personalized Dashboard + Course Map | 1.5 |
| Auto content generation (adaptive explanations) | 1.3 (already partly exists in the tutor) |
| Difficulty auto-adjust | 1.3 |
| Weak-topic detector | Exists; improved by 1.1, 1.3 and 1.5 |
| Learning-path re-routing | 1.5 |
| Citations "Chapter X, Page Y" | 1.2 |
| PDFs, notes, YouTube → one private knowledge base | 2.1, 2.2, 2.3 |
| Doubt-solver chatbot + not-found answer | Exists; kept in every phase |
| Mood-Based Learning | 1.6 |
| Exam Predictor | 2.4 |
| Teacher-Clone Mode | 2.5 |
| Student and Teacher accounts (JWT) | 3.1 |
| Peer-Match Learning | 3.2 |
| Cheating-Proof Viva Bot | 3.3 |
| Study Reminders and Slip Tests | 3.4 |
| AES-256 encryption | 4.1 |
| Cloud deployment | 4.2 |
| End-to-end testing | 4.3 |
| SRS, ERD, architecture, wireframes, final documentation | 4.4 |
