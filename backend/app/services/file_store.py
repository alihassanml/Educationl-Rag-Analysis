"""Every stored upload goes through here, so encryption at rest lives in one place.

File layout (format version 1):
[1 byte: format version] [12 bytes: random nonce] [ciphertext + 16-byte GCM tag]

AES-256-GCM is authenticated: a changed byte, a wrong key or a truncated file fails to decrypt
instead of returning garbage. The format version is bound to the ciphertext as associated data.

Which key encrypted a file is recorded on `Document.encryption_key_id`. NULL means the file is
stored as plain bytes (written before encryption was switched on, or in a development setup with
no key), which is what lets `app.scripts.encrypt_existing_files` find the files still to encrypt.
Decrypted bytes only ever live in memory; nothing is written back to disk in the clear.
"""

import base64
import binascii
import io
import os
import tempfile
from pathlib import Path
from typing import BinaryIO

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings

FORMAT_VERSION = 1
_NONCE_BYTES = 12
_KEY_BYTES = 32  # AES-256


class FileStoreError(Exception):
    """A stored file could not be decrypted (wrong key, damaged or truncated file)."""


def _decode_key(value: str, label: str) -> bytes:
    try:
        key = base64.b64decode(value.strip(), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"{label} must be base64") from exc
    if len(key) != _KEY_BYTES:
        raise ValueError(f"{label} must decode to exactly {_KEY_BYTES} bytes (AES-256)")
    return key


def parse_keyring(current_id: str, current_key: str, previous: str) -> dict[str, bytes]:
    """All keys that can decrypt files: the current one plus any retired ones kept for rotation
    ("id:base64key,id:base64key"). Raises ValueError when a key is malformed."""
    ring: dict[str, bytes] = {}
    if current_key.strip():
        ring[current_id] = _decode_key(current_key, "FILE_ENCRYPTION_KEY")
    for part in (p for p in previous.split(",") if p.strip()):
        key_id, _, value = part.strip().partition(":")
        if not key_id or not value:
            raise ValueError("FILE_ENCRYPTION_PREVIOUS_KEYS must look like 'id:base64key,...'")
        ring[key_id] = _decode_key(value, f"previous key '{key_id}'")
    return ring


def encryption_enabled() -> bool:
    return bool(get_settings().file_encryption_key.strip())


def _keyring() -> dict[str, bytes]:
    s = get_settings()
    return parse_keyring(
        s.file_encryption_key_id, s.file_encryption_key, s.file_encryption_previous_keys
    )


def current_key() -> bytes:
    return _keyring()[get_settings().file_encryption_key_id]


def encrypt_bytes(data: bytes, key: bytes) -> bytes:
    nonce = os.urandom(_NONCE_BYTES)
    header = bytes([FORMAT_VERSION])
    return header + nonce + AESGCM(key).encrypt(nonce, data, header)


def decrypt_bytes(blob: bytes, key: bytes) -> bytes:
    if len(blob) < 1 + _NONCE_BYTES + 16 or blob[0] != FORMAT_VERSION:
        raise FileStoreError("The stored file is not in a known encrypted format")
    header, nonce, body = blob[:1], blob[1 : 1 + _NONCE_BYTES], blob[1 + _NONCE_BYTES :]
    try:
        return AESGCM(key).decrypt(nonce, body, header)
    except InvalidTag as exc:
        raise FileStoreError(
            "The stored file could not be decrypted (wrong key or damaged)"
        ) from exc


def _write_atomic(path: Path, data: bytes) -> None:
    """Write via a temporary file in the same folder, so a crash never leaves half a file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=".tmp-")
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(data)
        os.replace(tmp_name, path)
    except BaseException:
        Path(tmp_name).unlink(missing_ok=True)
        raise


def save_encrypted(path: Path, data: bytes) -> str | None:
    """Store `data` at `path`, encrypted with the current key. Returns the id of the key used, to
    keep on the Document, or None when no key is configured and the bytes were stored as they are
    (development only; production refuses to start without a key)."""
    if not encryption_enabled():
        _write_atomic(path, data)
        return None
    _write_atomic(path, encrypt_bytes(data, current_key()))
    return get_settings().file_encryption_key_id


def read_decrypted(path: Path, key_id: str | None) -> bytes:
    """The file's real contents. `key_id` is the Document's `encryption_key_id`; None = plain."""
    raw = path.read_bytes()
    if key_id is None:
        return raw
    key = _keyring().get(key_id)
    if key is None:
        raise FileStoreError(f"No key is configured for key id '{key_id}'")
    return decrypt_bytes(raw, key)


def open_decrypted(path: Path, key_id: str | None) -> BinaryIO:
    """The file's contents as an in-memory stream. Close it when done; no clear copy is on disk."""
    return io.BytesIO(read_decrypted(path, key_id))


def read_text(path: Path, key_id: str | None) -> str:
    return read_decrypted(path, key_id).decode("utf-8")


def delete(path: Path) -> None:
    path.unlink(missing_ok=True)
