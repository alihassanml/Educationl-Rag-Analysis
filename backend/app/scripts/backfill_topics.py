"""Find the topics of documents that were uploaded before topic extraction existed.

Only ready documents with no topics yet are processed, so the script is safe to run again.
Usage (from backend/):
  .venv/bin/python -m app.scripts.backfill_topics [--email you@example.com] [--all]
  --all  also redo documents that already have topics
"""

import argparse

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.db.session import get_engine
from app.models.document import STATUS_READY, Document
from app.models.quiz import DocumentTopic
from app.models.user import User
from app.services import topic_service
from app.services.groq_service import get_groq_service


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", help="only this user's documents")
    parser.add_argument(
        "--all", action="store_true", help="redo documents that already have topics"
    )
    args = parser.parse_args()
    llm = get_groq_service()
    with Session(get_engine()) as db:
        stmt = select(Document).where(Document.status == STATUS_READY)
        if not args.all:
            stmt = stmt.where(~exists().where(DocumentTopic.document_id == Document.id))
        if args.email:
            stmt = stmt.join(User, User.id == Document.user_id).where(
                User.email == args.email.strip().lower()
            )
        documents = db.scalars(stmt.order_by(Document.created_at)).all()
        for document in documents:
            topic_service.extract_safely(db, llm, document)
            count = len(
                db.scalars(
                    select(DocumentTopic.topic_id).where(DocumentTopic.document_id == document.id)
                ).all()
            )
            print(f"{count:>3} topics  {document.title}")
    print(f"Processed {len(documents)} documents")


if __name__ == "__main__":
    main()
