"""Sign-in checks for interviewer and candidate routes."""
import secrets

from fastapi import Header, HTTPException

from app.core.config import settings
from app.services.repository import repository


def access_code_ok(given: str) -> bool:
    expected = settings.admin_access_code
    if not expected or len(given) != len(expected):
        return False
    return secrets.compare_digest(given, expected)


def user_from_authorization(authorization: str | None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in to continue")
    token = authorization.split(" ", 1)[1].strip()
    user = repository.user_from_token(token)
    if not user:
        raise HTTPException(401, "Sign in to continue")
    return user


def require_user(authorization: str | None = Header(default=None)) -> dict:
    return user_from_authorization(authorization)


def optional_user(authorization: str | None) -> dict | None:
    """The signed-in user, or None for an anonymous or expired token."""
    try:
        return user_from_authorization(authorization)
    except HTTPException:
        return None


def require_admin(authorization: str | None = Header(default=None)) -> dict:
    user = user_from_authorization(authorization)
    if user["role"] != "admin":
        raise HTTPException(403, "This action is for interviewer accounts")
    return user
