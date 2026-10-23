"""Sign-in checks for interviewer and candidate routes."""
from fastapi import Header, HTTPException, Request

from app.services.repository import repository

# Each role can do everything the ones before it can.
ROLES = ("viewer", "recruiter", "owner")


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


def member_with(minimum: str, authorization: str | None) -> dict:
    """The signed-in user, when they hold at least `minimum` in their workspace.

    The role is read on every request, not stored in the token, so a change or removal applies at once.
    """
    user = user_from_authorization(authorization)
    workspace = user["workspace"]
    if workspace is None:
        raise HTTPException(403, "This is for hiring teams. Create a workspace or accept an invite to one.")
    if ROLES.index(workspace["role"]) < ROLES.index(minimum):
        raise HTTPException(403, f"This needs the {minimum} role in {workspace['name']}.")
    return user


def require_viewer(authorization: str | None = Header(default=None)) -> dict:
    return member_with("viewer", authorization)


def require_recruiter(authorization: str | None = Header(default=None)) -> dict:
    return member_with("recruiter", authorization)


def require_owner(authorization: str | None = Header(default=None)) -> dict:
    return member_with("owner", authorization)


def interview_in_workspace_or_404(interview_id: str, member: dict) -> dict:
    """The interview, when it belongs to the caller's workspace. The workspace comes from the interview itself,
    never from the request, and another team's interview looks the same as a missing one."""
    interview = repository.get_interview(interview_id)
    if not interview or interview.get("workspace_id") != member["workspace"]["id"]:
        raise HTTPException(404, "Interview not found")
    return interview
