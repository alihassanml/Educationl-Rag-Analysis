from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User

DbSession = Annotated[Session, Depends(get_db)]

_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def require_trusted_origin(request: Request) -> None:
    """CSRF defence for cookie auth: reject state-changing requests from other origins."""
    if request.method in _SAFE_METHODS:
        return
    origin = request.headers.get("origin")
    if origin is not None and origin not in get_settings().cors_origins:
        raise AppError(403, "untrusted_origin", "Request origin is not allowed")


def get_current_user(request: Request, db: DbSession) -> User:
    token = request.cookies.get(get_settings().cookie_name)
    user_id = decode_access_token(token) if token else None
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise AppError(401, "not_authenticated", "Please sign in to continue")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
