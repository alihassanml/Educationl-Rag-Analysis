# Security

What EduRAG protects, how, and what it does **not** protect.

## Stored files: AES-256-GCM
- Every upload (PDF, pasted text, web page text, YouTube transcript) is encrypted before it touches disk by `backend/app/services/file_store.py` (`save_encrypted`, `read_decrypted`). Nothing else writes to the upload folder.
- File layout: 1 version byte, a 12-byte random nonce, then ciphertext + 16-byte GCM tag. GCM is authenticated: a wrong key, a changed byte or a cut file fails to decrypt instead of returning garbage.
- The key is `FILE_ENCRYPTION_KEY` (base64, 32 bytes). In production (`APP_ENV=production`) the server **refuses to start** without it, or with a key of the wrong length.
- `documents.encryption_key_id` records which key encrypted each file. To rotate: set a new `FILE_ENCRYPTION_KEY` with a new `FILE_ENCRYPTION_KEY_ID`, and move the old key to `FILE_ENCRYPTION_PREVIOUS_KEYS=id:base64key`. Old files still open; new files use the new key.
- Decrypted bytes live only in memory (PDFs are opened from bytes). No clear temporary copy is written.
- Existing files: `python -m app.scripts.encrypt_existing_files --dry-run`, then without `--dry-run`. It is safe to run twice and to resume after a crash.
- **Back up the key.** A lost key means the uploaded files cannot be recovered (the indexed text in the database still works).

## What is not encrypted by the application (honest limits)
- **Chunk text and embeddings in PostgreSQL are not application-encrypted.** Search needs them readable (vector similarity and full-text search). Protect them with the database host's encryption at rest (Render, Neon, Supabase and AWS RDS all offer it) and by restricting database access.
- The LLM provider (Groq) receives the retrieved passages and the question for each answer. Do not upload material you may not send to that provider.
- Chat messages and scores are stored in plain form in PostgreSQL, protected by per-user ownership checks, not by encryption.

## Accounts and sessions
- Passwords are hashed with **Argon2** (`pwdlib`). Only the hash is stored.
- Login returns a JWT in an **httpOnly cookie** (`SameSite=Lax`, `Secure` when `COOKIE_SECURE=true`), so page scripts cannot read it.
- State-changing requests are rejected when their `Origin` is not in `CORS_ORIGINS` (CSRF defence).
- Roles: Student, Teacher, Admin. Teacher-only and admin-only routes check the role on the server.

## Privacy between users
- Every query filters by `user_id`, or by explicit class membership for material a teacher shared. A document, chat or score of another user answers 404.
- Peer Match shares only a display name, and only between opted-in students with the same weak topic. Class-wide figures for teachers appear only when at least `CLASS_MIN_STUDENTS_FOR_AGGREGATES` students have practised a topic.

## Abuse limits
- **Rate limits** (`backend/app/core/rate_limit.py`, Redis fixed windows): login 10/min per IP, registration 5/hour per IP, model-backed requests 30/min per user, peer challenges 20/hour per user. All configurable (`RATE_LIMIT_*`); 0 turns one off. If Redis is down, requests are let through (fail open) and a warning is logged.
- **Upload limits:** PDF signature check, size limit (`MAX_UPLOAD_MB`), text-length limits.
- **SSRF guard:** the web-link import (`source_service.py`) resolves the address first and refuses private, loopback and link-local targets, and re-checks every redirect.
- **Prompt injection:** retrieved passages are passed to the model as untrusted data, citations are built only from retrieval results, and a citation marker that is not among the sources is dropped.

## Browser headers
`frontend/next.config.ts` sends `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (microphone only for the Viva bot) and `Strict-Transport-Security`. The CSP allows inline scripts because Next.js needs them; a nonce-based policy would be the next hardening step.

## Dependency audit
Run `pip-audit -r backend/requirements.txt` and `npm audit` before a release. See `docs/test-report.md` for the result at the time of writing.
