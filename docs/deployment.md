# Deployment

Three ways to run EduRAG: local (no Docker), Docker Compose, and Render + Vercel.

## Required environment variables
| Variable | Meaning |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://user:pass@host:5432/db` (needs the `vector` extension) |
| `REDIS_URL` | Redis for the worker, rate limits |
| `SECRET_KEY` | JWT signing key: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `FILE_ENCRYPTION_KEY` | AES-256 key: `python -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"`. **Keep a backup.** |
| `GROQ_API_KEY`, `GROQ_MODEL` | The LLM (backend only) |
| `CORS_ORIGINS` | The site's public address, e.g. `https://edurag.vercel.app` (also used for CSRF checks) |
| `COOKIE_SECURE` | `true` over HTTPS |
| `APP_ENV` | `production` makes the app refuse weak or missing secrets |

Frontend: `BACKEND_URL` (where the Next.js server reaches the API; used at build time for the rewrite). The browser always calls `/api/v1` on its own site, so the session cookie is first-party and no cross-site cookie settings are needed.

## 1. Docker Compose (local or any VM)
```bash
cp .env.example .env              # then fill in SECRET_KEY, FILE_ENCRYPTION_KEY, GROQ_API_KEY
docker compose up --build
```
Open http://localhost:3000. Services: `db` (pgvector/pgvector:pg16), `redis:7`, `backend` (runs `alembic upgrade head`, then uvicorn), `worker` (ARQ: indexing jobs and the hourly reminder cron), `frontend`. Volumes: `pgdata`, `uploads`. The embedding model is baked into the backend image at build time.

> Note: `docker compose` was written and reviewed but could not be run in the environment where this phase was built (Docker was not installed). Run it once on your machine and report anything that fails.

## 2. Render (API, worker, Redis) + Vercel (frontend)
1. **Database:** create a Postgres on Neon or Supabase (pgvector is available) or Render Postgres, then run `CREATE EXTENSION IF NOT EXISTS vector;`. Copy the connection string, changing the scheme to `postgresql+psycopg://`.
2. **Render:** New → Blueprint → select this repo (`render.yaml`). Fill the variables marked `sync: false`. The API container runs migrations on every start. The API indexes uploads itself (`PROCESS_DOCUMENTS_INLINE=true`) because a Render disk can belong to only one service; the worker runs the hourly reminder job.
3. **Vercel:** import the repo, set the root directory to `frontend`, and add the env var `BACKEND_URL=https://<your-api>.onrender.com`. Deploy.
4. Set the API's `CORS_ORIGINS` to the Vercel URL and redeploy the API.
5. Check `https://<your-api>/api/v1/health` and sign in on the Vercel site.

## First administrator
```bash
cd backend && .venv/bin/python -m app.scripts.make_admin you@example.com
# in Docker:  docker compose exec backend python -m app.scripts.make_admin you@example.com
```

## Existing installation: encrypt old files
```bash
python -m app.scripts.encrypt_existing_files --dry-run
python -m app.scripts.encrypt_existing_files
```

## Backups
- **Database:** `pg_dump -Fc "$DATABASE_URL_PLAIN" > edurag.dump` (or the provider's automatic backups). Restore with `pg_restore`.
- **Uploads:** copy the `uploads` volume/disk. The files are encrypted, so backups of them are safe to store, but they are useless without `FILE_ENCRYPTION_KEY`; back that up separately, somewhere else.
- If uploads are lost but the database survives, answers and quizzes keep working; only re-indexing needs the files.
