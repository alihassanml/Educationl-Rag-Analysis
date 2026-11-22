"""ARQ job functions. Each job opens its own database session; nothing is shared with the API."""

import asyncio
import logging
import uuid
from typing import Any

from sqlalchemy.orm import sessionmaker

from app.db.session import get_engine
from app.evaluation.runner import execute_run
from app.models.document import STATUS_FAILED, STATUS_PROCESSING, Document
from app.services import document_service
from app.services.embedding_service import get_embedder
from app.services.groq_service import get_groq_service

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


def _process_document(document_id: uuid.UUID) -> None:
    with sessionmaker(bind=get_engine(), expire_on_commit=False)() as db:
        document = db.get(Document, document_id)
        if document is None or document.status != STATUS_PROCESSING:
            return  # deleted while it waited, or already handled
        try:
            document_service.process_stored(db, get_embedder(), document, get_groq_service())
        except Exception:
            # A document must never stay "processing" for ever: say it failed
            logger.exception("process_document_job crashed for %s", document_id)
            db.rollback()
            document.status = STATUS_FAILED
            document.error_message = "Processing failed. Please try uploading the file again."
            db.commit()


async def process_document_job(ctx: dict[str, Any], document_id: str) -> None:
    """Index an uploaded document: read it, chunk it, embed it and find its topics."""
    try:
        parsed = uuid.UUID(document_id)
    except ValueError:
        logger.warning("process_document_job received a malformed document id")
        return
    await asyncio.to_thread(_process_document, parsed)


def _send_due_reminders() -> int:
    from app.services import reminder_service

    with sessionmaker(bind=get_engine(), expire_on_commit=False)() as db:
        return reminder_service.send_due_reminders_job(db)


async def send_due_reminders_job(ctx: dict[str, Any]) -> None:
    """Hourly cron: find students with due spaced repetition reviews and notify them."""
    sent = await asyncio.to_thread(_send_due_reminders)
    logger.info("send_due_reminders_job sent %d reminder(s)", sent)
