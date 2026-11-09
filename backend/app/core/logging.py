import logging
import time
import uuid

from fastapi import FastAPI, Request, Response


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def add_request_logging(app: FastAPI) -> None:
    logger = logging.getLogger("app.request")

    @app.middleware("http")
    async def log_requests(request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = uuid.uuid4().hex[:12]
        started = time.perf_counter()
        response: Response = await call_next(request)
        duration_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "%s %s -> %s in %.0fms [%s]",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            request_id,
        )
        return response
