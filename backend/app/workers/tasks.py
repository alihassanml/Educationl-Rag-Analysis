"""ARQ job functions. Each job opens its own database session; nothing is shared with the API."""

import asyncio
import logging
import uuid
from typing import Any

from sqlalchemy.orm import sessionmaker

from app.db.session import get_engine
from app.evaluation.runner import execute_run
from app.services.embedding_service import get_embedder

logger = logging.getLogger("app.workers")


def _execute(run_id: uuid.UUID) -> None:
    with sessionmaker(bind=get_engine(), expire_on_commit=False)() as db:
        execute_run(db, get_embedder(), run_id)


async def run_eval_job(ctx: dict[str, Any], run_id: str) -> None:
    try:
        parsed = uuid.UUID(run_id)
    except ValueError:
        logger.warning("run_eval_job received a malformed run id")
        return
    # Retrieval and embedding are blocking calls, so keep them off the worker's event loop.
    await asyncio.to_thread(_execute, parsed)
