#!/usr/bin/env bash
# Starts the EduRAG backend (FastAPI, :8000) and frontend (Next.js, :3000).
# First run also creates the venv, installs dependencies, and applies migrations.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PY="$BACKEND/.venv/bin"

echo "==> Backend setup"
cd "$BACKEND"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
"$PY/pip" install -q -r requirements-dev.txt

if [ ! -f .env ]; then
  cp .env.example .env
  SECRET="$("$PY/python" -c 'import secrets; print(secrets.token_urlsafe(48))')"
  sed -i.bak "s#^SECRET_KEY=.*#SECRET_KEY=$SECRET#" .env && rm -f .env.bak
  echo "Created backend/.env with a new SECRET_KEY. Edit DATABASE_URL if your Postgres user or password differ."
  echo "Set GROQ_API_KEY and GROQ_MODEL in backend/.env to enable answers and quizzes."
fi

DB_NAME="$(sed -n 's#^DATABASE_URL=.*/\([^/?]*\).*#\1#p' .env | head -n1)"
if command -v createdb >/dev/null 2>&1 && [ -n "$DB_NAME" ]; then
  createdb "$DB_NAME" 2>/dev/null || true
fi
"$PY/alembic" upgrade head

echo "==> Frontend setup"
cd "$FRONTEND"
[ -d node_modules ] || npm install
[ -f .env.local ] || cp .env.example .env.local

echo "==> Starting servers (Ctrl+C stops both)"
cd "$BACKEND"
"$PY/uvicorn" app.main:app --reload --port 8000 &
BACKEND_PID=$!
trap 'kill "$BACKEND_PID" 2>/dev/null || true' EXIT INT TERM

cd "$FRONTEND"
echo "Frontend: http://localhost:3000   API health: http://localhost:8000/api/v1/health"
npm run dev
