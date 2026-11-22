import base64
import os

import pytest
from sqlalchemy import select

from app.core.config import Settings, get_settings
from app.models.document import Document
from app.scripts.encrypt_existing_files import encrypt_all
from app.services import document_service, file_store
from app.tests.conftest import FakeEmbedder
from app.tests.helpers import make_pdf, make_user, upload

TEXT = "Recursion is a method where a function calls itself. " * 4


def _key() -> str:
    return base64.b64encode(os.urandom(32)).decode()


def test_round_trip_and_wrong_key_fails(tmp_path) -> None:
    key = os.urandom(32)
    blob = file_store.encrypt_bytes(b"secret notes", key)
    assert b"secret notes" not in blob
    assert blob[0] == file_store.FORMAT_VERSION
    assert file_store.decrypt_bytes(blob, key) == b"secret notes"
    with pytest.raises(file_store.FileStoreError):
        file_store.decrypt_bytes(blob, os.urandom(32))


def test_nonce_is_random_per_file() -> None:
    key = os.urandom(32)
    assert file_store.encrypt_bytes(b"same", key) != file_store.encrypt_bytes(b"same", key)


def test_tampered_or_truncated_file_is_rejected() -> None:
    key = os.urandom(32)
    blob = bytearray(file_store.encrypt_bytes(b"hello world", key))
    blob[-1] ^= 1
    with pytest.raises(file_store.FileStoreError):
        file_store.decrypt_bytes(bytes(blob), key)
    with pytest.raises(file_store.FileStoreError):
        file_store.decrypt_bytes(b"\x01short", key)


def test_uploaded_pdf_is_unreadable_on_disk_but_works_in_the_app(
    auth_client, db, isolated_upload_dir
) -> None:
    pdf = make_pdf([TEXT])
    response = auth_client.post(
        "/api/v1/documents", files={"file": ("a.pdf", pdf, "application/pdf")}
    )
    assert response.status_code == 201
    assert response.json()["status"] == "ready"  # indexed from the decrypted bytes
    stored = next(isolated_upload_dir.rglob("*.pdf"))
    assert not stored.read_bytes().startswith(b"%PDF")
    assert b"Recursion" not in stored.read_bytes()
    document = db.scalar(select(Document))
    assert document.encryption_key_id == get_settings().file_encryption_key_id
    assert file_store.read_decrypted(stored, document.encryption_key_id) == pdf


def test_pasted_text_is_encrypted_and_can_be_reindexed(
    auth_client, db, isolated_upload_dir
) -> None:
    response = auth_client.post("/api/v1/documents/text", json={"title": "Notes", "text": TEXT})
    assert response.status_code == 201
    stored = next(isolated_upload_dir.rglob("*.txt"))
    assert b"Recursion" not in stored.read_bytes()
    document = db.scalar(select(Document))
    document_service.reindex(db, FakeEmbedder(), document)
    assert document.status == "ready"
    assert document_service.load_pages(document)[0].text.startswith("Recursion")


def test_unreadable_stored_file_marks_document_failed(auth_client, db, isolated_upload_dir) -> None:
    auth_client.post("/api/v1/documents/text", json={"title": "Notes", "text": TEXT})
    stored = next(isolated_upload_dir.rglob("*.txt"))
    stored.write_bytes(b"\x01" + os.urandom(60))  # damaged
    document = db.scalar(select(Document))
    document_service.reindex(db, FakeEmbedder(), document)
    assert document.status == "failed"


def test_without_a_key_files_stay_plain_and_have_no_key_id(
    auth_client, db, isolated_upload_dir, monkeypatch
) -> None:
    monkeypatch.setattr(get_settings(), "file_encryption_key", "")
    response = upload(auth_client, [TEXT])
    assert response.json()["status"] == "ready"
    stored = next(isolated_upload_dir.rglob("*.pdf"))
    assert stored.read_bytes().startswith(b"%PDF")
    assert db.scalar(select(Document)).encryption_key_id is None


def test_key_rotation_old_files_still_open(tmp_path, monkeypatch) -> None:
    settings = get_settings()
    old = _key()
    monkeypatch.setattr(settings, "file_encryption_key", old)
    monkeypatch.setattr(settings, "file_encryption_key_id", "v1")
    path = tmp_path / "f.bin"
    assert file_store.save_encrypted(path, b"data") == "v1"
    monkeypatch.setattr(settings, "file_encryption_key", _key())
    monkeypatch.setattr(settings, "file_encryption_key_id", "v2")
    monkeypatch.setattr(settings, "file_encryption_previous_keys", f"v1:{old}")
    assert file_store.read_decrypted(path, "v1") == b"data"
    assert file_store.save_encrypted(tmp_path / "g.bin", b"new") == "v2"
    monkeypatch.setattr(settings, "file_encryption_previous_keys", "")
    with pytest.raises(file_store.FileStoreError):
        file_store.read_decrypted(path, "v1")


def test_production_refuses_to_start_without_a_key() -> None:
    base = {"database_url": "postgresql+psycopg://x@localhost/x", "app_env": "production"}
    with pytest.raises(ValueError, match="FILE_ENCRYPTION_KEY"):
        Settings(**base, secret_key="a-real-secret", file_encryption_key="")
    with pytest.raises(ValueError, match="32 bytes"):
        Settings(**base, secret_key="a-real-secret", file_encryption_key="c2hvcnQ=")
    Settings(**base, secret_key="a-real-secret", file_encryption_key=_key())


def test_migration_script_encrypts_old_files_safely(
    db, tmp_path, isolated_upload_dir, monkeypatch
) -> None:
    user = make_user(db, "old@example.com", is_admin=False)
    monkeypatch.setattr(get_settings(), "file_encryption_key", "")  # the old, plain days
    path = isolated_upload_dir / "old.pdf"
    pdf = make_pdf([TEXT])
    isolated_upload_dir.mkdir(parents=True)
    path.write_bytes(pdf)
    document = document_service.create_and_process(
        db, FakeEmbedder(), user.id, filename="old.pdf", title="Old", path=path, size=len(pdf)
    )
    assert document.encryption_key_id is None
    monkeypatch.undo()  # key is back (the test key)
    monkeypatch.setattr(get_settings(), "upload_dir", isolated_upload_dir)

    counts = encrypt_all(db, dry_run=True)
    assert counts["encrypted"] == 1
    assert path.read_bytes() == pdf and document.encryption_key_id is None  # dry run wrote nothing

    assert encrypt_all(db, dry_run=False)["encrypted"] == 1
    db.refresh(document)
    assert document.encryption_key_id == get_settings().file_encryption_key_id
    assert not path.read_bytes().startswith(b"%PDF")
    assert file_store.read_decrypted(path, document.encryption_key_id) == pdf
    assert encrypt_all(db, dry_run=False)["encrypted"] == 0  # idempotent

    # A run that stopped after writing the file but before saving the database
    document.encryption_key_id = None
    db.commit()
    counts = encrypt_all(db, dry_run=False)
    assert counts == {"encrypted": 0, "already_encrypted": 1, "missing": 0}
    assert file_store.read_decrypted(path, document.encryption_key_id) == pdf
