"""Encrypt the uploads that were stored before AES-256 encryption was switched on.

Safe to run again: documents that already carry a key id are skipped, and a file that is already
encrypted (a run that stopped between writing the file and saving the database) is only recorded.
Use --dry-run first to see what would change. Needs FILE_ENCRYPTION_KEY.
Usage (from backend/): .venv/bin/python -m app.scripts.encrypt_existing_files [--dry-run]
"""

import argparse
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_engine
from app.models.document import Document
from app.services import file_store


def encrypt_all(db: Session, *, dry_run: bool) -> dict[str, int]:
    settings = get_settings()
    if not file_store.encryption_enabled():
        raise SystemExit("FILE_ENCRYPTION_KEY is not set; there is nothing to encrypt with.")
    key = file_store.current_key()
    counts = {"encrypted": 0, "already_encrypted": 0, "missing": 0}
    pending = db.scalars(
        select(Document).where(Document.encryption_key_id.is_(None)).order_by(Document.created_at)
    ).all()
    for document in pending:
        path = Path(document.storage_path)
        if not path.is_file():
            counts["missing"] += 1
            print(f"missing   {document.id}  {path}")
            continue
        raw = path.read_bytes()
        try:
            file_store.decrypt_bytes(raw, key)
            already = True
        except file_store.FileStoreError:
            already = False
        if already:
            counts["already_encrypted"] += 1
        else:
            counts["encrypted"] += 1
            if not dry_run:
                file_store.save_encrypted(path, raw)
        print(f"{'already' if already else 'encrypt':<9} {document.id}  {document.title}")
        if not dry_run:
            document.encryption_key_id = settings.file_encryption_key_id
            db.commit()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run", action="store_true", help="list what would change, write nothing"
    )
    args = parser.parse_args()
    with Session(get_engine()) as db:
        counts = encrypt_all(db, dry_run=args.dry_run)
    label = "Would encrypt" if args.dry_run else "Encrypted"
    print(
        f"{label} {counts['encrypted']} files; {counts['already_encrypted']} were already "
        f"encrypted; {counts['missing']} files are missing on disk."
    )
    sys.exit(1 if counts["missing"] else 0)


if __name__ == "__main__":
    main()
