import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from dotenv import load_dotenv
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError

load_dotenv(Path(__file__).parent / ".env")

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY is missing from backend/.env")
if len(SECRET_KEY) < 32:
    raise RuntimeError("JWT_SECRET_KEY in backend/.env must be at least 32 characters long")

password_hasher = PasswordHash.recommended()

# Hash of a random password, used to make failed logins for unknown emails take as long
# as for real accounts (so timing doesn't reveal which emails are registered)
_DUMMY_HASH = password_hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        return password_hasher.verify(password, stored_hash)
    except UnknownHashError:
        # e.g. an old placeholder hash: treat as a wrong password, not a server error
        return False


def verify_password_dummy(password: str) -> None:
    password_hasher.verify(password, _DUMMY_HASH)


def create_access_token(user_id: int) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "exp": expires_at,
        # Unique token id, so a single token can be revoked on logout
        "jti": secrets.token_urlsafe(16),
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# Revoked token ids → their expiry time. In memory: fine for a single backend process,
# and entries only need to live until the token would have expired anyway.
_revoked: dict[str, float] = {}
_revoked_lock = threading.Lock()


def revoke_token(jti: str, expires_at: float) -> None:
    now = time.time()
    with _revoked_lock:
        for old in [k for k, exp in _revoked.items() if exp < now]:
            del _revoked[old]
        _revoked[jti] = float(expires_at)


def is_token_revoked(jti: str) -> bool:
    with _revoked_lock:
        return jti in _revoked
