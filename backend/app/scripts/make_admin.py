"""Give an existing user access to administrator areas such as the Evaluation Lab.

Usage (from backend/): .venv/bin/python -m app.scripts.make_admin you@example.com
"""

import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_engine
from app.models.user import User


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m app.scripts.make_admin <email>")
    email = sys.argv[1].strip().lower()
    with Session(get_engine()) as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            raise SystemExit(f"No user with email {email}. Register the account first")
        user.is_admin = True
        db.commit()
    print(f"{email} is now an administrator")


if __name__ == "__main__":
    main()
