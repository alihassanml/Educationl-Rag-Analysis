@echo off
rem Starts the EduRAG backend (FastAPI, :8000), the background worker (needs Redis) and the
rem frontend (Next.js, :3000).
rem First run also creates the venv, installs dependencies, and applies migrations.
setlocal
set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "PY=%BACKEND%\.venv\Scripts"

echo ==^> Backend setup
cd /d "%BACKEND%"
if not exist .venv ( python -m venv .venv || goto :fail )
"%PY%\pip" install -q -r requirements-dev.txt || goto :fail

if not exist .env (
  copy .env.example .env >nul
  "%PY%\python" -c "import re,secrets,pathlib; p=pathlib.Path('.env'); p.write_text(re.sub(r'(?m)^SECRET_KEY=.*$', 'SECRET_KEY='+secrets.token_urlsafe(48), p.read_text()))"
  echo Created backend\.env with a new SECRET_KEY. Edit DATABASE_URL if your Postgres user or password differ.
  echo Set GROQ_API_KEY and GROQ_MODEL in backend\.env to enable answers and quizzes.
)
"%PY%\alembic" upgrade head || goto :fail

echo ==^> Frontend setup
cd /d "%FRONTEND%"
if not exist node_modules ( call npm install || goto :fail )
if not exist .env.local copy .env.example .env.local >nul

echo ==^> Starting servers in separate windows
start "EduRAG Backend" /d "%BACKEND%" "%PY%\uvicorn" app.main:app --reload --port 8000
where redis-cli >nul 2>nul && redis-cli ping 2>nul | find "PONG" >nul
if errorlevel 1 (
  echo Redis is not running, so the Evaluation Lab worker was not started. Install and start Redis to use it.
) else (
  start "EduRAG Worker" /d "%BACKEND%" "%PY%\arq" app.workers.settings.WorkerSettings
)
start "EduRAG Frontend" /d "%FRONTEND%" cmd /k npm run dev
echo Frontend: http://localhost:3000   API health: http://localhost:8000/api/v1/health
exit /b 0

:fail
echo Setup failed. See the messages above.
exit /b 1
