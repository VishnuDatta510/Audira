"""Accounts: sign up, sign in, sign out and password changes."""
import math

from fastapi import APIRouter, Header, HTTPException

from app.api.deps import access_code_ok, bearer_token, user_from_authorization
from app.domain.schemas import ChangePasswordRequest, LoginRequest, RegisterRequest
from app.services.auth import access_code_attempts, hash_password, needs_rehash, password_problem, sign_in_attempts, verify_password
from app.services.repository import repository

router = APIRouter(prefix="/api/auth")


def _too_many(wait_seconds: int) -> HTTPException:
    minutes = math.ceil(wait_seconds / 60)
    return HTTPException(
        429,
        f"Too many attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
        headers={"Retry-After": str(wait_seconds)},
    )


def _signed_in(user: dict) -> dict:
    return {**repository.public_user(user), "token": repository.create_auth_session(user["email"])}


@router.post("/register")
def register(request: RegisterRequest):
    if request.role == "admin":
        wait = access_code_attempts.take("admin")
        if wait:
            raise _too_many(wait)
        if not access_code_ok(request.admin_access_code):
            raise HTTPException(403, "Interviewer signup needs the access code from ADMIN_ACCESS_CODE")
    problem = password_problem(request.password, request.email)
    if problem:
        raise HTTPException(422, problem)
    try:
        user = repository.create_user(request.name, request.email, hash_password(request.password), request.role)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return _signed_in(user)


@router.post("/login")
def login(request: LoginRequest):
    wait = sign_in_attempts.take(request.email)
    if wait:
        raise _too_many(wait)
    user = repository.find_user(request.email)
    if not verify_password(request.password, user["password_hash"] if user else None):
        raise HTTPException(401, "Invalid email or password")
    sign_in_attempts.clear(request.email)
    if needs_rehash(user["password_hash"]):
        repository.set_password_hash(user["email"], hash_password(request.password))
    return _signed_in(user)


@router.get("/me")
def me(authorization: str | None = Header(default=None)):
    return user_from_authorization(authorization)


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    """Ends this device's session. Safe to call with an expired or missing token."""
    token = bearer_token(authorization)
    if token:
        repository.revoke_auth_session(token)
    return {"signed_out": True}


@router.post("/logout-all")
def logout_all(authorization: str | None = Header(default=None)):
    user = user_from_authorization(authorization)
    repository.revoke_auth_sessions(user["email"])
    return {"signed_out": True}


@router.post("/password")
def change_password(request: ChangePasswordRequest, authorization: str | None = Header(default=None)):
    """Keeps this device signed in and signs out every other one.

    A wrong current password is 403, not 401: the client treats 401 as "signed out".
    """
    user = user_from_authorization(authorization)
    email = user["email"]
    wait = sign_in_attempts.take(email)
    if wait:
        raise _too_many(wait)
    stored = repository.find_user(email)
    if not stored or not verify_password(request.current_password, stored["password_hash"]):
        raise HTTPException(403, "Current password is incorrect")
    sign_in_attempts.clear(email)
    problem = password_problem(request.new_password, email)
    if problem:
        raise HTTPException(422, problem)
    repository.set_password_hash(email, hash_password(request.new_password))
    repository.revoke_auth_sessions(email, keep_token=bearer_token(authorization))
    return {"changed": True}
