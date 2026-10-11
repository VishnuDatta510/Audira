"""Sign-in checks for interviewer and candidate routes."""
import secrets

from fastapi import Header, HTTPException, Request

from app.core.config import settings
from app.services.repository import repository


def access_code_ok(given: str) -> bool:
    expected = settings.admin_access_code
    if not expected or len(given) != len(expected):
        return False
    return secrets.compare_digest(given, expected)


def client_address(request: Request) -> str:
    """Best guess at who is calling, for rate limits only.

    Cloudflare in front of Render sets CF-Connecting-IP itself. Render puts the client first in
    X-Forwarded-For but keeps whatever the client sent, so it can be forged. The limits that use
    this always have a per-account backstop, so a forged address only escapes the per-address part.
    """
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return request.headers.get("cf-connecting-ip") or forwarded or (request.client.host if request.client else "unknown")


def bearer_token(authorization: str | None) -> str | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization.split(" ", 1)[1].strip() or None


def user_from_authorization(authorization: str | None) -> dict:
    token = bearer_token(authorization)
    if not token:
        raise HTTPException(401, "Sign in to continue")
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
