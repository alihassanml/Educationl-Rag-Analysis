# Phase 3 report — Teacher accounts, Peer Match, Viva Bot, Reminders and Slip Tests

## What was built
| Area | Where |
|---|---|
| Student/Teacher accounts, `display_name`, `require_teacher` | `models/user.py`, `api/deps.py`, `routes/auth.py` |
| Classes, join code, shared documents, teacher dashboard | `services/class_service.py`, `routes/classes.py`, `/classes`, `/teacher` |
| Peer Match (opt-in, matching, duels, block/report) | `services/peer_match_service.py`, `routes/peer_match.py`, `/peer-match` |
| Viva Bot (5 questions, follow-up, voice, rubric report) | `services/viva_service.py`, `routes/viva.py`, `/viva` |
| Reminders, slip tests, notifications | `services/reminder_service.py`, `services/notification_service.py`, hourly cron in `workers/settings.py` |

## Migrations
`e511` user roles, `e513` peer match, `e514` viva bot, `e515` notifications and reminders (plus the classes migrations from earlier commits).

## Endpoints
`/peer-match/{matches,challenges,block,blocks}`, `/viva/{transcribe,sessions}`, `/notifications`, `/reminders/{due-topics,slip-tests}`, `/classes`, `/teacher`.

## Environment variables
`PEER_CHALLENGE_*` (expiry, time limit, max pending, questions), `VIVA_*` (questions, time limit, Whisper model, progress weight), `SLIP_TEST_*`, reminder intervals. See `backend/.env.example`.

## Rules and choices made
- **Reminder time:** the student picks a local hour in Settings; it is stored in UTC. The hourly job sends in the first run at or after that hour, at most one a day.
- **Duel deadline:** an accepted duel expires at the time limit plus 30 seconds. Submitting after that returns `duel_expired`.
- **Report:** "Report and block" blocks the student in both directions; the reason is stored as `reported`.
- **Viva time limit:** comes from config (`VIVA_TIME_LIMIT_SECONDS`) and the page counts down from it. Typed answers have paste disabled; a spoken answer is shown as editable text so the student can confirm it before sending.
- **Viva weak points:** questions scoring under 3 of 6 are listed with their source page.
- **Email:** not built, by decision. Reminders are in-app only.

## Checks
- Backend: `ruff check app` clean, `pytest` 627 passed.
- Frontend: `tsc --noEmit` clean, `eslint` clean, `vitest` 320 passed.

## Manual test steps
1. Register two students and one teacher. The teacher creates a class and shares a PDF; both students join with the code and ask a question that cites it.
2. Both students turn on Peer Match in Settings and take quizzes to create a weak topic. Each sees the other by display name only. One sends a duel, the other accepts, both submit, both see the winner.
3. Open `/viva`, pick a topic, answer by voice and by typing, wait for the follow-up, finish, and read the report.
4. In Settings choose a reminder hour. After that hour, with a topic due, the bell shows one notification. Start the slip test from the dashboard card.

## Known limitations
- The viva time limit is enforced in the browser only, not on the server.
- Tab switches are logged and reported, not blocked.
- Email reminders are not implemented.
- The flows have been checked by automated tests, not yet by a full browser walk-through.
