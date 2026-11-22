"""Rebuild the passages of every ready document from its stored file.

Run after changing how text is read or chunked, so old uploads get the same quality as new ones.
This also fills in the chapter / section title of every passage (used in citations) for documents
uploaded before section titles existed.
Usage (from backend/): .venv/bin/python -m app.scripts.reindex_documents [--email you@example.com]
"""

import argparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_engine
from app.models.document import STATUS_READY, Document
from app.models.user import User
from app.services import document_service
from app.services.embedding_service import get_embedder


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", help="only this user's documents")
    args = parser.parse_args()
    embedder = get_embedder()
    with Session(get_engine()) as db:
        stmt = select(Document).where(Document.status == STATUS_READY)
        if args.email:
            stmt = stmt.join(User, User.id == Document.user_id).where(
                User.email == args.email.strip().lower()
            )
        documents = db.scalars(stmt.order_by(Document.created_at)).all()
        for document in documents:
            document_service.reindex(db, embedder, document)
            print(f"{document.status:<8} {document.title}")
    print(f"Re-indexed {len(documents)} documents")


if __name__ == "__main__":
    main()
