"""AES-256-GCM encryption for message bodies.

Messages are encrypted before being stored in the database and decrypted on
read. The key never leaves the server and is never sent to clients.

Ciphertext format (all base64url, joined by "."):
    <12-byte nonce> . <16-byte GCM tag> . <ciphertext>

If CHAT_ENCRYPTION_KEY is not set (dev mode), messages are stored as plaintext
with a "plain:" prefix so the code path is always the same.
"""
from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings

_PLAIN_PREFIX = "plain:"


def _key() -> bytes | None:
    raw = settings.CHAT_ENCRYPTION_KEY.strip()
    if not raw:
        return None
    try:
        key = bytes.fromhex(raw)
    except ValueError:
        key = raw.encode()
    if len(key) not in (16, 24, 32):
        raise RuntimeError(
            "CHAT_ENCRYPTION_KEY must be a 32-, 48-, or 64-hex-character string "
            "(16, 24, or 32 bytes for AES-128/192/256)."
        )
    return key


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "==")  # padding-tolerant


def encrypt(plaintext: str) -> str:
    """Encrypt a message body. Returns a storable string."""
    key = _key()
    if key is None:
        # No key configured — store as plaintext (dev/test only).
        return _PLAIN_PREFIX + plaintext

    nonce = os.urandom(12)          # 96-bit nonce for GCM
    aesgcm = AESGCM(key)
    ct_with_tag = aesgcm.encrypt(nonce, plaintext.encode(), None)
    # GCM appends the 16-byte tag at the end of the ciphertext.
    ciphertext = ct_with_tag[:-16]
    tag = ct_with_tag[-16:]
    return f"{_b64(nonce)}.{_b64(tag)}.{_b64(ciphertext)}"


def decrypt(stored: str) -> str:
    """Decrypt a stored message body. Returns plaintext."""
    if stored.startswith(_PLAIN_PREFIX):
        return stored[len(_PLAIN_PREFIX):]

    key = _key()
    if key is None:
        # Key removed after messages were encrypted — can't decrypt.
        return "[encrypted message — key not configured]"

    try:
        nonce_b64, tag_b64, ct_b64 = stored.split(".", 2)
        nonce = _unb64(nonce_b64)
        tag = _unb64(tag_b64)
        ciphertext = _unb64(ct_b64)
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(nonce, ciphertext + tag, None)
        return plaintext.decode()
    except Exception:  # noqa: BLE001
        return "[message could not be decrypted]"
