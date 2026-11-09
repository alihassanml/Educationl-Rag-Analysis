from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.workers.queue import redis_available

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "unavailable"]


class ReadyResponse(HealthResponse):
    redis: Literal["ok", "unavailable"]


def _database_ok(db: Session) -> bool:
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return False
    return True


@router.get("/health", response_model=HealthResponse)
def health(response: Response, db: Annotated[Session, Depends(get_db)]) -> HealthResponse:
    if not _database_ok(db):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return HealthResponse(status="degraded", database="unavailable")
    return HealthResponse(status="ok", database="ok")


@router.get("/ready", response_model=ReadyResponse)
def ready(response: Response, db: Annotated[Session, Depends(get_db)]) -> ReadyResponse:
    database = "ok" if _database_ok(db) else "unavailable"
    redis_status = "ok" if redis_available() else "unavailable"
    healthy = database == "ok" and redis_status == "ok"
    if not healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadyResponse(
        status="ok" if healthy else "degraded", database=database, redis=redis_status
    )
