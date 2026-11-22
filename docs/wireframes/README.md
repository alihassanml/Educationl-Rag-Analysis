# Wireframes (page screenshots)

Screenshots of every page are taken from the running app with `frontend/e2e/review/capture.mjs`:

```bash
cd frontend
E2E_API_PORT=8031 E2E_WEB_PORT=3031 npx playwright test screenshots
```
(the files are written next to the script's output folder; copy them here). Pages: landing, login, register, tutor, history, library, classes, teacher, course map, quizzes, progress, exam predictor, peer match, viva bot, settings, evaluation.

Screenshots were **not regenerated** in this phase; the existing landing-page images are in `frontend/public/landing/`.
