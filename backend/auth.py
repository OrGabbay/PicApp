from typing import Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jwt.exceptions import InvalidTokenError
from sqlalchemy.orm import Session

import models
from database import get_db
from security import SECRET_KEY, ALGORITHM, is_token_revoked

bearer_scheme = HTTPBearer(auto_error=False)


def _auth_error() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _decode(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"require": ["sub", "exp", "jti"]},
        )
        int(payload["sub"])
    except (InvalidTokenError, ValueError, TypeError):
        raise _auth_error()
    if is_token_revoked(payload["jti"]):
        raise _auth_error()
    return payload


def get_token_payload(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """The verified claims of the request's token (401 if missing, invalid or revoked)."""
    if credentials is None:
        raise _auth_error()
    return _decode(credentials.credentials)


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Optional[models.User]:
    """Returns the logged-in user, or None for guests. A token that is present but invalid,
    expired or revoked is still rejected, so the client can tell the user their session ended."""
    if credentials is None:
        return None

    payload = _decode(credentials.credentials)
    user = db.get(models.User, int(payload["sub"]))

    if user is None:
        raise _auth_error()

    return user


def get_current_user(
    user: Optional[models.User] = Depends(get_optional_user),
) -> models.User:
    if user is None:
        raise _auth_error()
    return user
