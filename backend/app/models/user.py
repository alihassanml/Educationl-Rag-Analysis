import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, false, func, true
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

ROLE_STUDENT = "student"
ROLE_TEACHER = "teacher"


def default_display_name(context) -> str:  # type: ignore[no-untyped-def]
    """For rows made without a name (scripts, tests): the part of the email before the @."""
    return str(context.get_current_parameters()["email"]).split("@")[0][:60]


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # student | teacher. Admin is a separate flag, not a role.
    role: Mapped[str] = mapped_column(String(10), default=ROLE_STUDENT, server_default=ROLE_STUDENT)
    # The only name other users ever see (never the email). New accounts must give one.
    display_name: Mapped[str] = mapped_column(String(60), default=default_display_name)
    # Lighter study steps (a short recap and an easy quiz) when recent answers show the student
    # is struggling. On by default; the student can turn it off in Settings.
    lighter_steps_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
