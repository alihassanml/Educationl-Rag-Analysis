"""Background job queue (Redis through ARQ). Routes depend on `JobQueue`, never on ARQ directly."""

import asyncio
import logging
from typing import Protocol

import redis
from arq import create_pool
from arq.connections import RedisSettings
from redis.exceptions import RedisError

from app.core.config import get_settings
from app.core.errors import AppError

logger = logging.getLogger("app.workers")

CONNECT_TIMEOUT_SECONDS = 2


class JobQueue(Protocol):
    def enqueue(self, function: str, *args: str) -> None:
        """Queue a worker function. Raises AppError(503) when the queue cannot be reached."""
        ...


def _redis_settings() -> RedisSettings:
    settings = RedisSettings.from_dsn(get_settings().redis_url)
    settings.conn_timeout = CONNECT_TIMEOUT_SECONDS
    settings.conn_retries = 0  # fail fast: a dead queue should not hang the request
    return settings


class ArqJobQueue:
    def enqueue(self, function: str, *args: str) -> None:
        # Sync route handlers run in worker threads without an event loop, so asyncio.run is safe.
        try:
            asyncio.run(self._enqueue(function, args))
        except (OSError, RedisError, TimeoutError) as exc:
            logger.warning("Could not enqueue %s: %s", function, type(exc).__name__)
            raise AppError(
                503,
                "queue_unavailable",
                "The background service is not running. Please try again shortly",
            ) from exc

    @staticmethod
    async def _enqueue(function: str, args: tuple[str, ...]) -> None:
        pool = await create_pool(_redis_settings())
        try:
            await pool.enqueue_job(function, *args)
        finally:
            await pool.aclose()


def get_job_queue() -> JobQueue:
    return ArqJobQueue()


def redis_available() -> bool:
    try:
        client = redis.Redis.from_url(
            get_settings().redis_url,
            socket_connect_timeout=CONNECT_TIMEOUT_SECONDS,
            socket_timeout=CONNECT_TIMEOUT_SECONDS,
        )
        try:
            return bool(client.ping())
        finally:
            client.close()
    except (OSError, RedisError):
        return False
