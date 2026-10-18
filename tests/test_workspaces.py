import uuid
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.repository import repository

client = TestClient(app)
PASSWORD = "correct-horse-1"
POSTING = {
    "role": "Backend Engineer",
    "job_description": "Build Python API services, design data models, and review code with the team.",
    "interview_focus": "Prioritize API design and data structures.",
    "difficulty": "medium",
    "dsa_enabled": False,
    "dsa_duration_minutes": 20,
    "project_question_count": 3,
    "fundamentals_question_count": 3,
}


@pytest.fixture(autouse=True)
def memory_db(monkeypatch):
    monkeypatch.setattr(repository, "db", None)
    for store in (repository.memory_users, repository.memory_auth_sessions, repository.memory_interviews,
                  repository.memory_workspaces, repository.memory_members, repository.memory_invites):
        store.clear()


def _auth(user: dict) -> dict:
    return {"Authorization": f"Bearer {user['token']}"}


def _signup(name: str, workspace: str | None = None) -> dict:
    body = {"name": name, "email": f"{name.lower()}-{uuid.uuid4().hex[:6]}@example.com", "password": PASSWORD}
    if workspace:
        body["workspace_name"] = workspace
    response = client.post("/api/auth/register", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def _invite(owner: dict, email: str, role: str = "recruiter") -> str:
    response = client.post("/api/workspace/invites", json={"email": email, "role": role}, headers=_auth(owner))
    assert response.status_code == 200, response.text
    return response.json()["token"]


def _join(owner: dict, name: str, role: str = "recruiter") -> dict:
    person = _signup(name)
    token = _invite(owner, person["email"], role)
    accepted = client.post(f"/api/invites/{token}/accept", headers=_auth(person))
    assert accepted.status_code == 200, accepted.text
    return {**accepted.json(), "token": person["token"]}


def test_hiring_signup_owns_a_workspace_and_candidates_have_none():
    owner = _signup("Ada", "Acme")
    assert owner["workspace"]["name"] == "Acme" and owner["workspace"]["role"] == "owner"
    assert _signup("Grace")["workspace"] is None


def test_signed_in_candidate_can_start_a_workspace_once():
    person = _signup("Grace")
    made = client.post("/api/workspace", json={"name": "Hopper Labs"}, headers=_auth(person))
    assert made.status_code == 200 and made.json()["workspace"]["role"] == "owner"
    assert client.post("/api/workspace", json={"name": "Second"}, headers=_auth(person)).status_code == 409


def test_invite_is_hashed_tied_to_its_email_and_single_use():
    owner = _signup("Ada", "Acme")
    invited = _signup("Grace")
    other = _signup("Linus")
    token = _invite(owner, invited["email"])
    assert token not in str(repository.memory_invites)

    preview = client.get(f"/api/invites/{token}").json()
    assert preview["workspace_name"] == "Acme" and preview["email"] == invited["email"] and preview["role"] == "recruiter"

    assert client.post(f"/api/invites/{token}/accept", headers=_auth(other)).status_code == 403
    accepted = client.post(f"/api/invites/{token}/accept", headers=_auth(invited))
    assert accepted.json()["workspace"]["name"] == "Acme"
    assert client.post(f"/api/invites/{token}/accept", headers=_auth(invited)).status_code == 404
    assert client.get(f"/api/invites/{token}").status_code == 404


def test_reinviting_replaces_the_old_link_and_expired_links_fail():
    owner = _signup("Ada", "Acme")
    invited = _signup("Grace")
    first = _invite(owner, invited["email"])
    second = _invite(owner, invited["email"])
    assert client.get(f"/api/invites/{first}").status_code == 404
    next(iter(repository.memory_invites.values()))["expires_at"] -= timedelta(days=8)
    assert client.post(f"/api/invites/{second}/accept", headers=_auth(invited)).status_code == 404


def test_owner_sees_and_revokes_invites_but_others_cannot():
    owner = _signup("Ada", "Acme")
    recruiter = _join(owner, "Grace")
    _invite(owner, "pending@example.com", "viewer")
    team = client.get("/api/workspace", headers=_auth(owner)).json()
    assert [m["role"] for m in team["members"]] == ["owner", "recruiter"]
    assert team["invites"][0]["email"] == "pending@example.com" and "token_hash" not in team["invites"][0]
    assert client.get("/api/workspace", headers=_auth(recruiter)).json()["invites"] == []
    assert client.post("/api/workspace/invites", json={"email": "x@example.com"}, headers=_auth(recruiter)).status_code == 403
    assert client.post("/api/workspace/invites", json={"email": recruiter["email"]}, headers=_auth(owner)).status_code == 409
    invite_id = team["invites"][0]["id"]
    assert client.delete(f"/api/workspace/invites/{invite_id}", headers=_auth(recruiter)).status_code == 403
    assert client.delete(f"/api/workspace/invites/{invite_id}", headers=_auth(owner)).status_code == 200
    assert client.get("/api/workspace", headers=_auth(owner)).json()["invites"] == []


def test_viewers_read_but_cannot_create_and_role_changes_apply_at_once():
    owner = _signup("Ada", "Acme")
    viewer = _join(owner, "Grace", "viewer")
    posting = client.post("/api/admin/interviews", json=POSTING, headers=_auth(owner)).json()
    assert client.get(f"/api/admin/interviews/{posting['id']}", headers=_auth(viewer)).status_code == 200
    assert client.post("/api/admin/interviews", json=POSTING, headers=_auth(viewer)).status_code == 403
    client.post(f"/api/workspace/members/{viewer['email']}/role", json={"role": "recruiter"}, headers=_auth(owner))
    assert client.post("/api/admin/interviews", json=POSTING, headers=_auth(viewer)).status_code == 200
    assert len(client.get("/api/admin/interviews", headers=_auth(owner)).json()) == 2


def test_another_teams_interviews_look_missing():
    acme = _signup("Ada", "Acme")
    rival = _signup("Linus", "Rival")
    posting = client.post("/api/admin/interviews", json=POSTING, headers=_auth(acme)).json()
    assert client.get("/api/admin/interviews", headers=_auth(rival)).json() == []
    assert client.get(f"/api/admin/interviews/{posting['id']}", headers=_auth(rival)).status_code == 404
    assert client.get(f"/api/admin/interviews/{posting['id']}/attempts", headers=_auth(rival)).status_code == 404


def test_the_team_cannot_take_its_own_interview_but_another_team_can():
    acme = _signup("Ada", "Acme")
    rival = _signup("Linus", "Rival")
    posting = client.post("/api/admin/interviews", json=POSTING, headers=_auth(acme)).json()
    body = {"resume": "Built two Python web APIs and wrote tests.", "preparation_goal": "Explain trade-offs clearly."}
    assert client.get(f"/api/interviews/{posting['token']}", headers=_auth(acme)).json()["on_team"] is True
    assert client.post(f"/api/interviews/{posting['token']}/sessions", json=body, headers=_auth(acme)).status_code == 403
    assert client.post(f"/api/interviews/{posting['token']}/sessions", json=body, headers=_auth(rival)).status_code == 200


def test_the_last_owner_cannot_leave_or_be_demoted():
    owner = _signup("Ada", "Acme")
    recruiter = _join(owner, "Grace")
    assert client.post(f"/api/workspace/members/{owner['email']}/role", json={"role": "viewer"}, headers=_auth(owner)).status_code == 409
    assert client.delete(f"/api/workspace/members/{owner['email']}", headers=_auth(owner)).status_code == 409
    assert client.delete(f"/api/workspace/members/{owner['email']}", headers=_auth(recruiter)).status_code == 403

    client.post(f"/api/workspace/members/{recruiter['email']}/role", json={"role": "owner"}, headers=_auth(owner))
    assert client.delete(f"/api/workspace/members/{owner['email']}", headers=_auth(owner)).status_code == 200
    assert client.get("/api/auth/me", headers=_auth(owner)).json()["workspace"] is None


def test_removed_member_loses_access_on_the_next_request():
    owner = _signup("Ada", "Acme")
    recruiter = _join(owner, "Grace")
    assert client.get("/api/admin/interviews", headers=_auth(recruiter)).status_code == 200
    assert client.delete(f"/api/workspace/members/{recruiter['email']}", headers=_auth(owner)).status_code == 200
    assert client.get("/api/admin/interviews", headers=_auth(recruiter)).status_code == 403
