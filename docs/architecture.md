# Architecture

## System
```mermaid
flowchart LR
  B[Browser] -->|/api/v1 same-origin| N[Next.js]
  N -->|rewrite| A[FastAPI]
  A --> P[(PostgreSQL + pgvector)]
  A --> R[(Redis)]
  A --> F[(Encrypted upload store)]
  A -->|passages + question| G[Groq LLM]
  A --> E[Embedding model bge-small]
  W[ARQ worker] --> R
  W --> P
  W --> F
  W --> E
```
The Next.js server forwards `/api/v1/*` to FastAPI, so the session cookie is first-party. Redis holds the job queue and rate-limit counters. The worker indexes uploads and sends the hourly study reminders.

## RAG flow
```mermaid
flowchart TD
  U[Upload / link / text / YouTube] --> V[Validate, encrypt, store]
  V --> X[Extract text: headings, tables, page numbers]
  X --> C[Chunk 180 words at headings]
  C --> M[Embed with bge-small]
  M --> D[(document_chunks + vectors)]
  Q[Question] --> RW[Rewrite follow-ups]
  RW --> S[Vector search + keyword rule, only the user's and shared documents]
  D --> S
  S --> T{Evidence over the bar?}
  T -- no --> NF[Not found]
  T -- yes --> L[LLM answers only from passages]
  L --> Z[Answer with citations: chapter, page or timestamp]
```

## Adaptive loop
```mermaid
flowchart LR
  DT[Diagnostic test] --> LV[Topic levels]
  LV --> QZ[Quiz at the topic's level]
  QZ --> SC[Score and topic progress]
  SC -->|80%+ harder, under 50% easier| LV
  SC --> WK[Weak-topic detector]
  WK --> CM[Course map re-routes]
  WK --> MD[Mood-aware lighter steps]
  SC --> SR[Spaced reminders and slip tests]
  SR --> SC
```

## Deployment
```mermaid
flowchart LR
  V[Vercel: Next.js] --> RA[Render: API container]
  RA --> NP[(Neon / Supabase / Render Postgres + pgvector)]
  RA --> RR[(Render Redis)]
  RW[Render worker] --> RR
  RW --> NP
  RA --> GQ[Groq]
```
Locally, `docker-compose.yml` runs the same pieces on one machine.

## Code layout
`backend/app/api/routes` (thin routes) → `services` (business rules) → `models` (SQLAlchemy). `schemas` holds the Pydantic types. `frontend/app` pages, `components` UI, `lib/api.ts` API client, `lib/features.ts` feature registry.
