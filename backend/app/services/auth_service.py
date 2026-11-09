from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import hash_password, verify_password
from app.models.user import User

# Hash checked when the email is unknown so both failures take similar time.
_DUMMY_HASH = hash_password("not-a-real-password")


def register(db: Session, email: str, password: str) -> User:
    if db.scalar(select(User).where(User.email == email)):
        raise AppError(409, "email_taken", "An account with this email already exists")
    user = User(email=email, password_hash=hash_password(password))
    db.add(user)
    db.commit()
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        verify_password(password, _DUMMY_HASH)
    elif verify_password(password, user.password_hash):
        return user
    raise AppError(401, "invalid_credentials", "Invalid email or password")
