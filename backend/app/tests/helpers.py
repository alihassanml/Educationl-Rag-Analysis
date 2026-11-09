import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.document import Document
from app.models.user import User
from app.services import document_service
from app.tests.conftest import FakeEmbedder, FakeGroq, make_pdf, register, upload

__all__ = [
    "FakeEmbedder",
    "FakeGroq",
    "add_document",
    "make_pdf",
    "make_user",
    "register",
    "upload",
]


def make_user(db: Session, email: str = "admin@example.com", is_admin: bool = True) -> User:
    user = User(email=email, password_hash=hash_password("password123"), is_admin=is_admin)
    db.add(user)
    db.commit()
    return user


def add_document(db: Session, user: User, title: str, pages: list[str], tmp: Path) -> Document:
    """Store and index a small PDF for `user` with the fake embedder."""
    path = tmp / f"{uuid.uuid4().hex}.pdf"
    path.write_bytes(make_pdf(pages))
    document = document_service.create_and_process(
        db,
        FakeEmbedder(),
        user.id,
        filename=f"{title}.pdf",
        title=title,
        path=path,
        size=path.stat().st_size,
    )
    assert document.status == "ready"
    return document
