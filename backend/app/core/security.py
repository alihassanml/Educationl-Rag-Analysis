from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

_hasher = PasswordHash.recommended()
_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _hasher.verify(password, password_hash)


def create_access_token(user_id: UUID, role: str = "student") -> str:
    """The role is informational for the client; every request still reads it from the database."""
    settings = get_settings()
    expires = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    claims = {"sub": str(user_id), "role": role, "exp": expires}
    return jwt.encode(claims, settings.secret_key, _ALGORITHM)


def decode_access_token(token: str) -> UUID | None:
    """Return the user id from a valid, unexpired token, otherwise None."""
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=[_ALGORITHM])
        return UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
