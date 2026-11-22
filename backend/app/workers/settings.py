"""ARQ worker configuration. Start with: .venv/bin/arq app.workers.settings.WorkerSettings"""

import asyncio
from typing import Any

from arq.connections import RedisSettings
from arq.cron import cron

from app.core.config import get_settings
from app.services.embedding_service import get_embedder
from app.workers.tasks import process_document_job, run_eval_job, send_due_reminders_job


async def startup(ctx: dict[str, Any]) -> None:
    # Load the embedding model once, before any job runs. Concurrent first jobs would otherwise
    # each load their own copy, and the first run would pay the loading time.
    await asyncio.to_thread(get_embedder)


class WorkerSettings:
    functions = [run_eval_job, process_document_job, send_due_reminders_job]
    cron_jobs = [cron(send_due_reminders_job, minute=0)]
    on_startup = startup
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    job_timeout = 1800  # seconds; far longer than indexing a large PDF or an evaluation run
    max_tries = 1  # a failed run is marked failed and started again by hand, not retried silently
