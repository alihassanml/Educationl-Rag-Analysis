"""Fixed-window rate limits counted in Redis, used as route dependencies.

A limit is a setting (requests per window); 0 or RATE_LIMIT_ENABLED=false turns it off. Reads
(GET) are never counted. When Redis cannot be reached the request is let through: a dead cache
must not lock every student out, and the same Redis already backs the worker.
"""

import logging
from collections.abc import Callable
from typing import Protocol

import redis
from fastapi import Request

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import decode_access_token

logger = logging.getLogger("app.rate_limit")
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class Counter(Protocol):
    def hit(self, key: str, window_seconds: int) -> int:
        """Count one request in the window and return how many there have been."""
        ...


class RedisCounter:
    def __init__(self) -> None:
        self._client: redis.Redis | None = None

    def hit(self, key: str, window_seconds: int) -> int:
        if self._client is None:
            self._client = redis.Redis.from_url(
                get_settings().redis_url, socket_connect_timeout=1, socket_timeout=1
            )
        count = int(self._client.incr(key))
        if count == 1:
            self._client.expire(key, window_seconds)
        return count


_counter: Counter = RedisCounter()


def set_counter(counter: Counter) -> None:
    """Swap the backing store (tests use an in-memory one)."""
    global _counter
    _counter = counter


def _client_id(request: Request, per_user: bool) -> str:
    if per_user:
        token = request.cookies.get(get_settings().cookie_name)
        user_id = decode_access_token(token) if token else None
        if user_id:
            return f"user:{user_id}"
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return f"ip:{forwarded or (request.client.host if request.client else 'unknown')}"


def rate_limit(
    name: str, setting: str, window_seconds: int, *, per_user: bool = False
) -> Callable[[Request], None]:
    """A dependency that allows `setting` requests per window, then answers 429."""

    def check(request: Request) -> None:
        settings = get_settings()
        limit = getattr(settings, setting)
        if not settings.rate_limit_enabled or limit <= 0 or request.method in _SAFE_METHODS:
            return
        key = f"ratelimit:{name}:{_client_id(request, per_user)}"
        try:
            count = _counter.hit(key, window_seconds)
        except Exception:  # Redis down or slow: fail open
            logger.warning("Rate limit store unavailable; letting the request through")
            return
        if count > limit:
            raise AppError(429, "rate_limited", "Too many requests. Please wait a moment.")

    return check


login_limit = rate_limit("login", "rate_limit_login", 60)
register_limit = rate_limit("register", "rate_limit_register", 3600)
llm_limit = rate_limit("llm", "rate_limit_llm", 60, per_user=True)
peer_limit = rate_limit("peer", "rate_limit_peer", 3600, per_user=True)
