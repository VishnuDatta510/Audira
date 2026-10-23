"""Hiring teams: the workspace, its members and the invite links that add people to it."""
from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.auth_routes import _too_many
from app.api.deps import client_address, require_owner, require_user, require_viewer
from app.domain.schemas import InviteRequest, MemberRoleRequest, WorkspaceNameRequest
from app.services.auth import new_workspace_made, new_workspace_wait
from app.services.repository import repository

router = APIRouter(prefix="/api")


def _invite_view(invite: dict) -> dict:
    return {
        "id": invite["id"],
        "email": invite["email"],
        "role": invite["role"],
        "invited_by_name": invite["invited_by_name"],
        "created_at": invite["created_at"].isoformat(),
        "expires_at": invite["expires_at"].isoformat(),
    }


def _member_view(member: dict) -> dict:
    return {"name": member["name"], "email": member["email"], "role": member["role"], "joined_at": member["joined_at"].isoformat()}


def _other_owner(workspace_id: str, email: str) -> bool:
    return any(m["role"] == "owner" and m["email"] != email for m in repository.members(workspace_id))


def _member_or_404(workspace_id: str, email: str) -> dict:
    found = next((m for m in repository.members(workspace_id) if m["email"] == email.lower()), None)
    if not found:
        raise HTTPException(404, "Member not found")
    return found


@router.get("/workspace")
def get_workspace(member: dict = Depends(require_viewer)):
    workspace = member["workspace"]
    owner = workspace["role"] == "owner"
    return {
        **workspace,
        "members": [_member_view(m) for m in repository.members(workspace["id"])],
        # Only owners can invite, so only they see who is waiting.
        "invites": [_invite_view(i) for i in repository.invites(workspace["id"])] if owner else [],
    }


@router.post("/workspace")
def create_workspace(request: WorkspaceNameRequest, http: Request, user: dict = Depends(require_user)):
    """A signed-in person with no team starts one and owns it."""
    if user["workspace"]:
        raise HTTPException(409, f"You are already in {user['workspace']['name']}.")
    address = client_address(http)
    wait = new_workspace_wait(address)
    if wait:
        raise _too_many(wait)
    new_workspace_made(address)
    try:
        repository.create_workspace(request.name, user["email"])
    except ValueError as exc:
        raise HTTPException(409, "You are already in a workspace.") from exc
    return repository.public_user(user)


@router.post("/workspace/name")
def rename_workspace(request: WorkspaceNameRequest, member: dict = Depends(require_owner)):
    repository.rename_workspace(member["workspace"]["id"], request.name)
    return {"name": request.name}


@router.post("/workspace/invites")
def create_invite(request: InviteRequest, member: dict = Depends(require_owner)):
    """The link holds the only copy of the token. It is shown once, here."""
    workspace_id = member["workspace"]["id"]
    if any(m["email"] == request.email for m in repository.members(workspace_id)):
        raise HTTPException(409, f"{request.email} is already on the team.")
    invite, token = repository.create_invite(workspace_id, request.email, request.role, member)
    return {**_invite_view(invite), "token": token}


@router.delete("/workspace/invites/{invite_id}")
def revoke_invite(invite_id: str, member: dict = Depends(require_owner)):
    if not repository.delete_invite(member["workspace"]["id"], invite_id):
        raise HTTPException(404, "Invite not found")
    return {"revoked": True}


@router.post("/workspace/members/{email}/role")
def change_role(email: str, request: MemberRoleRequest, member: dict = Depends(require_owner)):
    workspace_id = member["workspace"]["id"]
    target = _member_or_404(workspace_id, email)
    if target["role"] == "owner" and request.role != "owner" and not _other_owner(workspace_id, target["email"]):
        raise HTTPException(409, "A workspace needs at least one owner. Make someone else an owner first.")
    repository.set_member_role(workspace_id, target["email"], request.role)
    return {"email": target["email"], "role": request.role}


@router.delete("/workspace/members/{email}")
def remove_member(email: str, member: dict = Depends(require_viewer)):
    """Owners remove anyone. Everyone else can only remove themselves, which is leaving."""
    workspace = member["workspace"]
    target = _member_or_404(workspace["id"], email)
    if target["email"] != member["email"] and workspace["role"] != "owner":
        raise HTTPException(403, f"This needs the owner role in {workspace['name']}.")
    if target["role"] == "owner" and not _other_owner(workspace["id"], target["email"]):
        raise HTTPException(409, "A workspace needs at least one owner. Make someone else an owner first.")
    repository.remove_member(workspace["id"], target["email"])
    return {"removed": True}


@router.get("/invites/{token}")
def preview_invite(token: str):
    """What the invite page shows before anyone signs in."""
    invite = repository.invite_by_token(token)
    workspace = repository.get_workspace(invite["workspace_id"]) if invite else None
    if not workspace:
        raise HTTPException(404, "This invite link is invalid or has expired.")
    return {
        "workspace_name": workspace["name"],
        "email": invite["email"],
        "role": invite["role"],
        "invited_by_name": invite["invited_by_name"],
        "expires_at": invite["expires_at"].isoformat(),
    }


@router.post("/invites/{token}/accept")
def accept_invite(token: str, user: dict = Depends(require_user)):
    invite = repository.invite_by_token(token)
    if not invite:
        raise HTTPException(404, "This invite link is invalid or has expired.")
    if invite["email"] != user["email"]:
        raise HTTPException(403, f"This invite is for {invite['email']}. Sign in with that email to accept it.")
    if user["workspace"]:
        raise HTTPException(409, f"You are already in {user['workspace']['name']}. Leave it before joining another team.")
    invite = repository.take_invite(token)
    if not invite:
        raise HTTPException(404, "This invite link is invalid or has expired.")
    try:
        repository.add_member(invite["workspace_id"], user["email"], invite["role"])
    except ValueError as exc:
        raise HTTPException(409, "You are already in a workspace.") from exc
    return repository.public_user(user)
