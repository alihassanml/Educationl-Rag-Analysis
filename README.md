# EduRAG

**An AI study assistant that answers only from the student's own notes, and shows exactly where each answer came from.**

EduRAG is a final year project: a web application where students upload their study material (PDFs, web pages, YouTube lectures, pasted text) and then study from it. They ask questions, take quizzes, follow a personalised study plan, practise for exams, and get reminders. Teachers can create classes and share material with their students.

> **In one sentence:** it is like a private tutor that has read only *your* notes, never makes things up, and always tells you the page it found the answer on.

---

## Contents

1. [What problem does it solve?](#1-what-problem-does-it-solve)
2. [What was built](#2-what-was-built)
3. [How it works, in plain words](#3-how-it-works-in-plain-words)
4. [What is finished, and what is not](#4-what-is-finished-and-what-is-not)
5. [How to install it](#5-how-to-install-it)
6. [How to use it](#6-how-to-use-it)
7. [Security and privacy](#7-security-and-privacy)
8. [Putting it online](#8-putting-it-online)
9. [Checking that everything works](#9-checking-that-everything-works)
10. [Troubleshooting](#10-troubleshooting)
11. [For developers](#11-for-developers)
12. [Documentation index](#12-documentation-index)
13. [Glossary](#13-glossary)

---

## 1. What problem does it solve?

Students today use general AI chatbots to study. Those chatbots have two problems:

- **They guess.** When they do not know something, they often invent a confident but wrong answer.
- **They do not know your course.** They have not read your teacher's notes or your textbook, so the answer may not match what you will be examined on.

EduRAG fixes both:

- Every answer is built **only from the material the student uploaded**.
- Every answer **shows its source** (for example *"Chapter 3, page 45"* or *"video, 12:40"*), so the student can check it.
- If the material does not contain the answer, EduRAG says **"Not found in your material"** instead of guessing.

The technique behind this is called **RAG** (Retrieval-Augmented Generation): first *retrieve* the relevant passages from the student's documents, then let the AI *generate* an answer using only those passages.

---

## 2. What was built

### For students

| Feature | What it does, in simple words |
|---|---|
| **My library** | Upload PDFs, add a web link, paste text, or add a YouTube lecture. Everything stays private to the student. |
| **Study tutor (chat)** | Ask questions and get answers with the exact page or video time they came from. Saved chat history. Say "quiz me" to get a quiz right inside the chat. |
| **Diagnostic test** | A short first test that finds out what the student already knows, topic by topic. |
| **Course map** | An ordered study plan, like a GPS. If the student struggles on a topic, the plan changes. |
| **Quizzes with automatic difficulty** | Quizzes are written from the student's own notes. Score 80% or more and the next quiz is harder; score under 50% and it gets easier. |
| **Progress and weak topics** | Shows which topics are strong and which need revision. |
| **Lighter steps** | After repeated mistakes, the system gives a short recap and an easy quiz instead of pushing on. |
| **Exam predictor** | Reads the student's past exam papers and shows which topics are asked most often, with the real questions as evidence. |
| **Teacher style** | Can answer in the style of the student's own teacher, learned from the teacher's material. |
| **Peer match** | Opt-in. Finds another student who is weak on the same topic, and they can compete in a quiz duel. Only a display name is shared. |
| **Viva bot** | A spoken oral exam. The bot asks a question out loud, listens, asks follow-up questions, and gives a marked report with sources. Details in [section 6](#the-viva-bot-oral-exam). |
| **Study reminders and slip tests** | When a topic is due for review, the student gets one reminder a day and a very short quiz ("slip test") to keep it fresh. |

### For teachers

| Feature | What it does |
|---|---|
| **Classes** | Create a class. Students join with an 8-character code. |
| **Share material** | Share a document with the class. Students can then ask questions about it. |
| **Class dashboard** | See which topics the class finds hard and how each student is doing. To protect privacy, class-wide numbers only appear once at least 3 students have practised a topic. |

### For the administrator

| Feature | What it does |
|---|---|
| **Evaluation Lab** | Measures how accurate the search part of the system is, using a set of labelled test questions. |

### Behind the scenes

- **Encrypted file storage** (AES-256): uploaded files are unreadable without the secret key.
- **Rate limits**: protects login, registration and the AI features from abuse.
- **One-command setup** with Docker, plus ready-made files for putting it online.
- **Automated tests** and a continuous-integration workflow.
- **Full project documents** (requirements, database diagram, architecture, test report, user guide).

---

## 3. How it works, in plain words

```
  Student's browser
        │
        ▼
  Website (Next.js)  ──►  Server (FastAPI)  ──►  Database (PostgreSQL)
                               │                    └─ stores accounts, notes' text and the
                               │                       "meaning" of every passage (vectors)
                               ├──►  Redis + background worker
                               │       └─ reads uploaded files and sends reminders
                               ├──►  Encrypted file storage
                               └──►  Groq (the AI that writes answers)
```

**What happens when a student uploads a PDF**
1. The file is checked, then **encrypted** and stored.
2. The text is read page by page. Headings and tables are recognised.
3. The text is cut into small passages (about 180 words each).
4. Each passage is turned into a list of numbers that captures its *meaning* (this is called an *embedding*) and saved in the database.
5. Topics are found automatically (from the PDF's table of contents, its headings, or with AI help).

**What happens when a student asks a question**
1. The question is turned into numbers the same way.
2. The database finds the passages from *this student's* documents whose meaning is closest.
3. If nothing is close enough, the answer is **"Not found in your material"**.
4. Otherwise the AI is given **only those passages** and asked to answer from them, with citations.

---

## 4. What is finished, and what is not

### Finished and tested
Everything in [section 2](#2-what-was-built) is built and working. It has been checked with:

- **632** automated backend tests, **331** frontend tests and **25** browser tests (a real browser clicking through the real app), all passing
- a security scan of the libraries used, with no known problems found
- a fresh-database installation test

### Honest limits (please read)

| Limit | What it means |
|---|---|
| **Scanned PDFs** | Photos or scans of pages (no real text) are not supported; there is no text recognition (OCR). The app says so clearly when it happens. |
| **Docker setup was not run by the developer** | The Docker and Render files were written and reviewed, but Docker was not available on the build machine. Please run `docker compose up --build` once and report any problem. |
| **Voice exam needs a good browser** | The hands-free Viva bot needs a browser with microphone access (Chrome or Edge recommended). If the microphone is not allowed, the student can type instead. |
| **Answers need internet and a Groq key** | The AI that writes answers and quizzes runs at Groq (a third-party service). Passages of the student's notes are sent to it when an answer is written. |
| **Search text is not encrypted in the database** | The *files* are encrypted. The text passages in the database must stay readable so that search works; protect them with your database host's encryption. See [Security](#7-security-and-privacy). |

---

## 5. How to install it

There are two ways. **Option A (Docker)** is the easiest: one command starts everything. **Option B (manual)** is for developers who want to edit the code.

### Before you start: get a free AI key
EduRAG needs a Groq API key to write answers.
1. Go to <https://console.groq.com> and create a free account.
2. Open *API Keys* and create a key. Copy it somewhere safe.

### Option A: Docker (recommended)

**1. Install Docker Desktop** from <https://www.docker.com/products/docker-desktop> (Windows, Mac or Linux) and start it.

**2. Download the project** and open a terminal inside the project folder.

**3. Create your settings file.**
```bash
cp .env.example .env
```
(On Windows Command Prompt use `copy .env.example .env`.) Open the new `.env` file in any text editor and fill in the three required values:

| Setting | What to put |
|---|---|
| `SECRET_KEY` | A long random text. Create one with: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `FILE_ENCRYPTION_KEY` | The key that locks uploaded files. Create one with: `python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"`. **Keep a private backup of this value.** If it is lost, uploaded files cannot be read again. |
| `GROQ_API_KEY` | The key you copied from Groq. |

**4. Start everything.**
```bash
docker compose up --build
```
The first time takes several minutes (it downloads the AI search model). When the text stops scrolling, open **<http://localhost:3000>** in your browser.

**5. Stop it** with `Ctrl + C`, or `docker compose down`. Your data is kept. To also delete all data: `docker compose down -v`.

### Option B: Manual installation (for developers)

**Install these first**

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22 or newer | <https://nodejs.org> |
| Python | 3.11 or newer | <https://python.org> |
| PostgreSQL | 16 or newer, with the **pgvector** extension | Mac: `brew install postgresql pgvector` |
| Redis | any recent | Mac: `brew install redis && brew services start redis` |

**Then run**
```bash
./start.sh        # Mac or Linux
start.bat         # Windows
```
The script creates the Python environment, installs everything, creates `backend/.env`, prepares the database and starts the website (<http://localhost:3000>), the server (<http://localhost:8000>, API docs at `/docs`) and the background worker.

Finally open `backend/.env` and set `DATABASE_URL` (your Postgres user), `GROQ_API_KEY` and `GROQ_MODEL`. To list the AI models your key can use:
```bash
cd backend && .venv/bin/python -m app.scripts.list_groq_models
```

<details>
<summary>Step by step, without the script</summary>

```bash
# Backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env                 # then edit it
createdb edurag
.venv/bin/alembic upgrade head       # creates the database tables
.venv/bin/uvicorn app.main:app --reload

# In a second terminal: the background worker (needs Redis)
cd backend && .venv/bin/arq app.workers.settings.WorkerSettings

# In a third terminal: the website
cd frontend
npm install
npm run dev
```
The website talks to the server through its own address (`/api/v1`); Next.js forwards the request to the server (`BACKEND_URL`, default `http://localhost:8000`).
</details>

---

## 6. How to use it

### First steps (student)
1. Open the site and choose **Create account**. Pick **Student**, enter a display name, email and password.
2. Go to **My library** and press **Add source**. Upload a PDF, add a link, paste text or add a YouTube lecture. Wait until it says **Ready**.
3. Open the **Dashboard**. It shows the next step to take.
4. Press **+ New chat** and ask a question about your material. Click the source under the answer to see where it came from.
5. Say *"quiz me"* in the chat, or open **Quizzes**, to practise.

### The main screens

| Screen | What you do there |
|---|---|
| **Dashboard** | See your streak, the next recommended step, recent chats, quizzes and your activity. |
| **My library** | Add and manage your material. Label each item (notes, textbook, past paper, teacher material, lecture). |
| **Chat** | Ask questions, get cited answers, take quizzes. |
| **Course map** | Your topics in the best order to study them. |
| **Progress** | Accuracy per topic and which topics need revision. |
| **Exam predictor** | Upload at least two past papers (label them *Past paper* and add the year) to see which topics are most likely to appear. |
| **Peer match** | Turn it on, find a student weak on the same topic, challenge them to a duel. |
| **Viva bot** | Take an oral exam (below). |
| **Settings** | Switch lighter steps, peer match and study reminders on or off; retake the diagnostic. |

### The Viva bot (oral exam)
1. Open **Viva bot**, type a topic (or tap a suggested one) and press **Start exam**. Allow the microphone when the browser asks. **This is the only click you need.**
2. The bot **asks the question out loud**. When it finishes, it **listens automatically**.
3. Answer in your own words. When you stop talking for about two seconds, your answer is sent automatically.
4. The bot asks a **follow-up question**, then the next question, and so on, **with no more clicking**.
5. At the end you get a **score, feedback for every question, a model answer and the sources**.

Useful buttons during the exam: **Pause voice**, **Repeat question** and **Type instead** (if you prefer to type or have no microphone). Each answer has a time limit (90 seconds by default). Leaving the browser tab is counted and shown in the report.

### Teachers
1. Create an account and choose **Teacher**.
2. Open **My classes**, create a class and copy the **8-character code**.
3. Share one of your uploaded documents with the class.
4. Give the code to your students. They enter it under **My classes** and can then ask questions about the shared material.
5. In the teacher area, see which topics the class finds hard and how each student is doing.

### Administrator
Make an existing account an administrator:
```bash
cd backend && .venv/bin/python -m app.scripts.make_admin you@example.com
# With Docker:  docker compose exec backend python -m app.scripts.make_admin you@example.com
```
The administrator then sees the **Evaluation** page. To load the sample questions and run a measurement:
```bash
cd backend && .venv/bin/python -m eval.seed_lab --email you@example.com --run dense,hybrid
```

A longer, step-by-step guide for every feature is in [`docs/user-guide.md`](docs/user-guide.md).

---

## 7. Security and privacy

In plain words:

- **Uploaded files are encrypted** with AES-256, the same kind of encryption used by banks. Without `FILE_ENCRYPTION_KEY` the files are unreadable.
- **Passwords are never stored.** Only a one-way scrambled form (Argon2) is saved.
- **Login uses a protected cookie** that page scripts cannot read.
- **Students cannot see each other's data.** Every request is limited to the signed-in student, or to a class they joined.
- **Peer match shares only a display name**, and only between students who turned it on.
- **Teachers see class numbers only when at least 3 students have practised a topic**, so no one is singled out.
- **Abuse is limited**: too many login attempts, sign-ups or AI requests in a short time are refused.
- **Web links are checked** so the importer cannot be tricked into reading private internal addresses.
- **The browser is told to apply strict safety rules** (security headers).

What is **not** covered, so there are no surprises:
- The passages of text used for search, and chat messages, are stored readable in the database. Use your database host's built-in encryption ("encryption at rest") for these.
- The AI provider (Groq) receives the relevant passages and the question each time an answer is written. Do not upload material you are not allowed to send to a third-party service.

Full details are in [`docs/security.md`](docs/security.md).

---

## 8. Putting it online

The recommended set-up uses **Vercel** for the website and **Render** for the server, plus a PostgreSQL database with the pgvector extension (Neon, Supabase or Render Postgres). The files `render.yaml` and `frontend/vercel.json` are ready.

Short version:
1. Create the database and enable the vector extension.
2. On Render, create a Blueprint from this repository and fill in the secret values.
3. On Vercel, import the repository, set the folder to `frontend`, and add `BACKEND_URL` with your Render address.
4. Set `CORS_ORIGINS` on Render to your Vercel address.

The complete, step-by-step guide (including backups and creating the first administrator) is in [`docs/deployment.md`](docs/deployment.md).

**Important settings for a live site**

| Setting | Why |
|---|---|
| `APP_ENV=production` | Makes the server refuse to start with weak or missing secrets. |
| `SECRET_KEY` | Signs logins. Must be long and private. |
| `FILE_ENCRYPTION_KEY` | Locks uploaded files. **Back it up separately.** |
| `COOKIE_SECURE=true` | Required once the site uses HTTPS. |
| `CORS_ORIGINS` | The public address of the website. |

---

## 9. Checking that everything works

From the project folder:

```bash
# Server: code style and 632 tests
cd backend && .venv/bin/ruff check app && .venv/bin/pytest

# Website: code style, types, 331 tests, production build
cd frontend && npm run lint && npm run typecheck && npm test && npm run build

# Browser tests (a real browser clicks through the app)
cd frontend && npm run e2e
```

For the browser tests, create an empty test database once (`createdb edurag_e2e`), run `alembic upgrade head` against it after every database change, and install the browser once with `npx playwright install chromium`. The browser tests use a scripted stand-in for the AI, so they need no Groq key.

A summary of results is in [`docs/test-report.md`](docs/test-report.md). The same checks run automatically on every push through GitHub Actions (`.github/workflows/ci.yml`).

---

## 10. Troubleshooting

| Problem | What to try |
|---|---|
| **"Could not reach the server"** on every page | The backend is not running. Check the terminal (or `docker compose logs backend`). |
| **Upload stays on "Processing"** | The background worker is not running (it needs Redis). Start it, or in development set `PROCESS_DOCUMENTS_INLINE=true`. |
| **Upload fails with "no readable text"** | The PDF is a scan or photo. Upload a text-based PDF. |
| **Answers say "Not found in your material"** | The document does not contain the answer, or the question is too different from the wording. Try rephrasing, or add a source that covers it. |
| **No answers or quizzes at all** | `GROQ_API_KEY` is missing or wrong, or `GROQ_MODEL` is not available to your key (use `list_groq_models`). |
| **Server will not start in production** | It tells you which secret is missing: `SECRET_KEY` or `FILE_ENCRYPTION_KEY`. |
| **Sign-up fails in the browser tests with a missing column error** | Run `alembic upgrade head` against the `edurag_e2e` database. |
| **Viva bot does not listen** | Allow the microphone in the browser address bar, use Chrome or Edge, or press **Type instead**. |
| **Login does not stay signed in after going online** | Set `COOKIE_SECURE=true` only with HTTPS, and make sure `CORS_ORIGINS` is your exact site address. |
| **"Too many requests"** | A rate limit was hit. Wait a minute and try again. |

---

## 11. For developers

### Technology

| Part | Technology | Why |
|---|---|---|
| Website | Next.js 16, React 19, Tailwind 4 | Fast, modern pages |
| Server | FastAPI (Python), SQLAlchemy, Alembic | Clear API with automatic documentation |
| Database | PostgreSQL + pgvector | Stores data and searches by meaning in one place |
| Embeddings | `BAAI/bge-small-en-v1.5` (sentence-transformers) | Turns text into meaning vectors, runs locally |
| AI model | Groq (default `openai/gpt-oss-120b`) | Fast answers; used only to write from retrieved passages |
| Background jobs | Redis + ARQ | Indexing uploads and sending reminders without slowing requests |
| Tests | pytest, Vitest, Playwright | Server, website and real-browser tests |

The reasons behind these choices are in [`docs/design-decisions.md`](docs/design-decisions.md).

### Folder layout
```
backend/app/api/routes    thin web endpoints
backend/app/services      the business rules (one file per feature)
backend/app/models        database tables
backend/app/tests         server tests
backend/alembic           database migrations
backend/eval              retrieval measurement tools
frontend/app              pages
frontend/components       screens and reusable parts
frontend/lib              API client, helpers, feature list
frontend/e2e              browser tests
docs                      project documents
```

### Useful scripts
Run from `backend/` as `.venv/bin/python -m app.scripts.<name>`.

| Script | Purpose |
|---|---|
| `make_admin you@example.com` | Make an account an administrator |
| `encrypt_existing_files [--dry-run]` | Encrypt uploads stored before encryption was switched on |
| `reindex_documents [--email ...]` | Rebuild passages after a change to reading or chunking |
| `backfill_topics` | Find topics for older documents |
| `generate_erd` | Print the database diagram |
| `list_groq_models` | List the AI models your key can use |

### Configuration
Every setting is explained next to its default in `backend/app/core/config.py` and listed in `backend/.env.example`. Thresholds such as the difficulty limits, reminder intervals, viva length and rate limits can all be changed there without touching code.

### Tutor API (summary)
All endpoints are under `/api/v1/tutor` and limited to the signed-in student. Another student's chat returns 404.

| Method | Endpoint | Purpose |
|---|---|---|
| GET, POST | `/threads` | List chats, create one |
| GET, PATCH, DELETE | `/threads/{id}` | Read, rename, delete a chat |
| POST | `/threads/{id}/messages` | Send a question; the answer streams back (server-sent events) |
| POST | `/messages/{id}/feedback` | Thumbs up or down |

The stream sends `status`, `sources`, `token` and `done` events. When nothing passes the evidence check, no answer is generated and `done` has `abstained: true`. The full API is browsable at `/docs` on a running server.

### Rules the code follows
- A model is only given retrieved passages, and treats them as untrusted text.
- Every query is filtered by owner (or class membership).
- Every database change has a reversible migration.
- Every new threshold is a setting with a comment.

---

## 12. Documentation index

| Document | What it covers |
|---|---|
| [`docs/SRS.md`](docs/SRS.md) | Requirements: each feature, where it is in the code, and which tests cover it |
| [`docs/user-guide.md`](docs/user-guide.md) | How students, teachers and admins use every feature |
| [`docs/architecture.md`](docs/architecture.md) | System, search flow, adaptive learning loop and deployment diagrams |
| [`docs/ERD.md`](docs/ERD.md) | Database diagram, generated from the code |
| [`docs/design-decisions.md`](docs/design-decisions.md) | Why these technologies were chosen |
| [`docs/security.md`](docs/security.md) | Encryption, privacy, limits and what is not covered |
| [`docs/deployment.md`](docs/deployment.md) | Docker, Render and Vercel, backups, first administrator |
| [`docs/evaluation-plan.md`](docs/evaluation-plan.md) | How search quality is measured |
| [`docs/test-report.md`](docs/test-report.md) | Test results and known limitations |

---

## 13. Glossary

| Term | Meaning |
|---|---|
| **RAG** | Retrieval-Augmented Generation. Find the relevant passages first, then let the AI answer from them only. |
| **Citation** | The reference under an answer showing the document and page (or video time) it came from. |
| **Embedding / vector** | A list of numbers that captures the meaning of a piece of text, so similar meanings can be found. |
| **pgvector** | The PostgreSQL add-on that stores and searches those vectors. |
| **LLM** | Large Language Model: the AI that writes the answer (here, through Groq). |
| **Diagnostic test** | The first short test that sets the student's starting level on each topic. |
| **Slip test** | A very short quiz that keeps a topic fresh in memory. |
| **Viva** | An oral exam. |
| **Docker** | A tool that runs the whole application in ready-made containers with one command. |
| **Migration** | A versioned change to the database structure. |
| **JWT / cookie** | The secure token, kept in a protected browser cookie, that keeps a user signed in. |
| **AES-256** | A strong encryption standard used to lock uploaded files. |
| **Rate limit** | A cap on how many requests can be made in a short time, to stop abuse. |
