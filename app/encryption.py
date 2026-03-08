"""Fernet encryption for wearable tokens at rest."""

import json
import base64
import hashlib
from cryptography.fernet import Fernet
from . import config


def _get_fernet() -> Fernet | None:
    key = config.ENCRYPTION_KEY
    if not key:
        return None
    # Derive a valid 32-byte Fernet key from the env var
    derived = hashlib.sha256(key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(derived))


def encrypt_value(plaintext: str) -> str:
    f = _get_fernet()
    if not f:
        return plaintext  # No encryption key configured
    return f.encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    f = _get_fernet()
    if not f:
        return ciphertext
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except Exception:
        # Likely plaintext (not yet encrypted) — return as-is
        return ciphertext


def migrate_tokens_file():
    """One-time: encrypt any plaintext tokens in whoop_tokens.json."""
    f = _get_fernet()
    if not f or not config.WHOOP_TOKENS_FILE.exists():
        return
    with open(config.WHOOP_TOKENS_FILE) as fh:
        tokens = json.load(fh)
    changed = False
    for user_key, data in tokens.items():
        for field in ("access_token", "refresh_token"):
            val = data.get(field, "")
            if val and not val.startswith("gAAAAA"):  # Fernet tokens start with gAAAAA
                data[field] = encrypt_value(val)
                changed = True
    if changed:
        with open(config.WHOOP_TOKENS_FILE, "w") as fh:
            json.dump(tokens, fh, indent=2)
