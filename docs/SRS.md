# Software Requirements Specification: EduRAG

A RAG-based adaptive learning and exam-preparation system. Students upload their own material; every answer, quiz and explanation comes from that material, cites it, and says "not found" when the material does not cover the question.

## 1. Actors
- **Student:** uploads material, studies, takes quizzes and tests.
- **Teacher:** creates classes, shares material, sees class progress (with privacy limits).
- **Admin:** runs the Evaluation Lab, creates other admins with `make_admin`.

## 2. Functional requirements
Status of every requirement: **Implemented**. "Code" is under `backend/app/` and `frontend/`; "Tests" are under `backend/app/tests/`, `frontend/tests/` and `frontend/e2e/`.

| ID | Requirement | Code | Tests |
|---|---|---|---|
| FR-AUTH-01 | Register and sign in as Student or Teacher with a JWT in an httpOnly cookie; Argon2 password hashes | `api/routes/auth.py`, `services/auth_service.py`, `core/security.py` | `test_auth.py`, `auth-form.test.tsx`, `core-flow.spec.ts` |
| FR-AUTH-02 | Role checks: teacher-only and admin-only areas | `api/deps.py` | `test_classes.py`, `test_eval_api.py` |
| FR-KB-01 | Upload PDFs; one private knowledge base per student | `services/document_service.py`, `pdf_service.py`, `chunking_service.py` | `test_documents.py`, `test_chunking.py`, `test_rag_quality.py`, `library.test.tsx` |
| FR-KB-02 | Add material by link, pasted text, and YouTube lecture (timestamped) | `services/source_service.py`, `youtube_service.py` | `test_sources.py`, `test_youtube.py` |
| FR-KB-03 | Document kinds (notes, textbook, past paper, teacher material, lecture) | `models/document.py` | `test_document_kinds.py` |
| FR-RAG-01 | Cited answers with chapter and page (or timestamp), streamed | `services/rag_service.py`, `retrieval_service.py`, `chat_stream_service.py` | `test_tutor.py`, `test_chat_stream.py`, `test_section_titles.py`, `core-flow.spec.ts` |
| FR-RAG-02 | "Not found" answer when evidence is missing | `rag_service.py` (evidence bar + model guard) | `test_tutor.py`, `test_rag_quality.py`, `core-flow.spec.ts` |
| FR-RAG-03 | Saved chats, follow-ups, feedback, history | `services/chat_service.py` | `test_chat_threads.py`, `test_chat_rewrite.py`, `test_chat_feedback.py`, `history-page.test.tsx` |
| FR-ADAPT-01 | Student Profile Builder: diagnostic test seeds every topic's level | `services/diagnostic_service.py` | `test_diagnostic.py`, `features.spec.ts` |
| FR-ADAPT-02 | Topic extraction (outline, headings, LLM) | `services/topic_service.py` | `test_topics.py` |
| FR-ADAPT-03 | Automatic difficulty (80%+ harder, under 50% easier) | `services/recommendation_service.py`, `quiz_service.py` | `test_difficulty.py`, `test_recommendation.py` |
| FR-ADAPT-04 | Weak-topic detector and progress dashboard | `services/progress_service.py`, `insights_service.py` | `test_progress.py`, `test_insights.py`, `progress.test.tsx`, `dashboard.test.tsx` |
| FR-ADAPT-05 | Course Map with GPS-style re-routing | `services/learning_path_service.py` | `test_learning_path.py`, `course-map.test.tsx`, `features.spec.ts` |
| FR-MOOD-01 | Mood-aware pacing: lighter steps after repeated struggle | `services/mood_service.py`, `light_mode_service.py` | `test_light_mode.py`, `light-mode.test.tsx` |
| FR-EXAM-01 | Exam Predictor ranks topics from past papers, with evidence | `services/exam_predictor_service.py` | `test_exam_predictor.py`, `exam-predictor.test.tsx` |
| FR-TEACH-01 | Teacher-Clone Mode: answers in the style of teacher material | `services/teacher_style_service.py` | `test_teacher_style.py` |
| FR-CLASS-01 | Teachers create classes and share material; students join with a code | `services/class_service.py`, `api/routes/classes.py` | `test_classes.py`, `classes.test.tsx`, `features.spec.ts` |
| FR-CLASS-02 | Teacher dashboard: class weak topics and member progress with privacy minimums | `services/teacher_dashboard_service.py` | `test_teacher_dashboard.py`, `features.spec.ts` |
| FR-PEER-01 | Peer Match: opted-in students with the same weak topic duel; only display names shared | `services/peer_match_service.py` | `test_peer_match.py` |
| FR-VIVA-01 | Viva Bot: spoken or typed oral exam with follow-ups, time limits, cited rubric report | `services/viva_service.py` | `test_viva.py` |
| FR-REM-01 | Spaced study reminders (max one notification per day) and slip tests that update progress | `services/reminder_service.py`, `notification_service.py`, `workers/` | `test_reminders.py`, `features.spec.ts` |
| FR-QUIZ-01 | Quizzes from the student's material, scoring, notes PDF | `services/quiz_service.py`, `quiz_notes_service.py` | `test_quizzes.py`, `test_scoring.py`, `quiz-runner.test.tsx` |
| FR-EVAL-01 | Evaluation Lab: hit rate, MRR, nDCG, abstention | `app/evaluation/` | `test_eval_*.py`, `evaluation.test.tsx` |
| FR-SEC-01 | AES-256-GCM encryption of stored files; key rotation; migration script | `services/file_store.py`, `scripts/encrypt_existing_files.py` | `test_file_encryption.py` |
| FR-SEC-02 | Rate limits on login, registration, model-backed and peer requests | `core/rate_limit.py` | `test_rate_limit.py` |
| FR-SEC-03 | Security headers; same-origin API | `frontend/next.config.ts` | `features.spec.ts` (headers) |

## 3. Non-functional requirements
- **Security:** AES-256-GCM files at rest, Argon2, httpOnly JWT cookie, CSRF origin check, SSRF guard, rate limits, security headers (`docs/security.md`).
- **Privacy:** every query is scoped to the owner or an explicit class share; class aggregates need at least 3 students; peer data limited to display names.
- **Performance:** uploads are indexed by a background worker (or inline in small setups) so a request never waits on a large PDF; answers stream.
- **Availability:** health endpoint, container healthchecks, migrations on start; a Redis outage disables only queueing and limits (rate limits fail open).
- **Maintainability:** logic in services, thin routes, migrations for every schema change, ruff, typecheck and CI.

## 4. Use cases
**Student:** register → upload notes → take the diagnostic → follow the course map → take adaptive quizzes → ask the tutor (cited) → prepare with the Exam Predictor → practise with Peer Match and the Viva Bot → answer a slip test when a reminder arrives.
**Teacher:** register as Teacher → create a class → share a document → give the code to students → read class weak topics and member progress.
**Admin:** make the first admin from the command line → run the Evaluation Lab.

## 5. Acceptance criteria (summary)
- A stored upload is unreadable without the key, and the app works with it (`test_file_encryption.py`).
- A student never sees another user's document, chat or score (404 tests in every suite; `features.spec.ts`).
- A question the material cannot answer returns "not found" (`test_tutor.py`, `core-flow.spec.ts`).
- A teacher creates a class and shares a document; a student joins and cites it; a non-member gets 404.
