"""Accounts: sign up, sign in, sign out and password changes."""
import math

from fastapi import APIRouter, Header, HTTPException, Request

from app.api.deps import bearer_token, client_address, user_from_authorization
from app.domain.schemas import ChangePasswordRequest, LoginRequest, RegisterRequest
from app.services.auth import (
    hash_password,
    needs_rehash,
    new_workspace_made,
    new_workspace_wait,
    password_problem,
    sign_in_failed,
    sign_in_succeeded,
    sign_in_wait,
    verify_password,
)
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
def register(request: RegisterRequest, http: Request):
    """A candidate account, or with `workspace_name` a hiring team's first account, which owns the new workspace."""
    address = client_address(http)
    if request.workspace_name:
        wait = new_workspace_wait(address)
        if wait:
            raise _too_many(wait)
    problem = password_problem(request.password, request.email)
    if problem:
        raise HTTPException(422, problem)
    try:
        user = repository.create_user(request.name, request.email, hash_password(request.password))
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    if request.workspace_name:
        new_workspace_made(address)
        repository.create_workspace(request.workspace_name, user["email"])
    return _signed_in(user)


@router.post("/login")
def login(request: LoginRequest, http: Request):
    address = client_address(http)
    wait = sign_in_wait(request.email, address)
    if wait:
        raise _too_many(wait)
    user = repository.find_user(request.email)
    if not verify_password(request.password, user["password_hash"] if user else None):
        sign_in_failed(request.email, address)
        raise HTTPException(401, "Invalid email or password")
    sign_in_succeeded(request.email, address)
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
def change_password(request: ChangePasswordRequest, http: Request, authorization: str | None = Header(default=None)):
    """Keeps this device signed in and signs out every other one.

    A wrong current password is 403, not 401: the client treats 401 as "signed out".
    """
    user = user_from_authorization(authorization)
    email = user["email"]
    address = client_address(http)
    wait = sign_in_wait(email, address)
    if wait:
        raise _too_many(wait)
    stored = repository.find_user(email)
    if not stored or not verify_password(request.current_password, stored["password_hash"]):
        sign_in_failed(email, address)
        raise HTTPException(403, "Current password is incorrect")
    sign_in_succeeded(email, address)
    problem = password_problem(request.new_password, email)
    if problem:
        raise HTTPException(422, problem)
    repository.set_password_hash(email, hash_password(request.new_password))
    repository.revoke_auth_sessions(email, keep_token=bearer_token(authorization))
    return {"changed": True}
