import hashlib
import os

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services import auth
from app.services.listen import KEY_MISSING
from app.services.repository import SESSION_IDLE, repository
from app.services.session_store import store

client = TestClient(app)
PASSWORD = "correct-horse-battery"
NEW_PASSWORD = "a-brand-new-secret"


@pytest.fixture(autouse=True)
def memory_db(monkeypatch):
    monkeypatch.setattr(repository, "db", None)
    monkeypatch.setattr(settings, "admin_access_code", "test-admin-code")
    repository.memory_users.clear()
    repository.memory_auth_sessions.clear()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register(email="ada@example.com", password=PASSWORD, role="candidate", code=""):
    return client.post("/api/auth/register", json={"name": "Ada Lovelace", "email": email, "password": password, "role": role, "admin_access_code": code})


def _login(email="ada@example.com", password=PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _me(token: str) -> int:
    return client.get("/api/auth/me", headers=_auth(token)).status_code


def test_passwords_are_stored_as_argon2id():
    assert _register().status_code == 200
    stored = repository.memory_users["ada@example.com"]["password_hash"]
    assert stored.startswith("$argon2id$") and PASSWORD not in stored


def test_tokens_are_stored_hashed():
    token = _register().json()["token"]
    assert token not in repository.memory_auth_sessions
    assert token not in str(repository.memory_auth_sessions)


def test_email_is_trimmed_and_lowercased():
    assert _register(email="  Ada@Example.COM ").json()["email"] == "ada@example.com"
    assert _login(email=" ADA@example.com").status_code == 200


def test_signup_rejects_weak_or_invalid_input():
    assert _register(email="not-an-email").status_code == 422
    assert _register(password="short").status_code == 422
    common = _register(password="Password123")
    assert common.status_code == 422 and "too common" in common.json()["detail"]
    assert _register(email="grace@example.com", password="grace@example.com").status_code == 422
    assert _register().status_code == 200
    assert _register().status_code == 409


def test_wrong_password_and_unknown_email_get_the_same_answer():
    _register()
    wrong = _login(password="wrong-password")
    unknown = _login(email="nobody@example.com")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_legacy_scrypt_password_signs_in_and_is_upgraded():
    salt = os.urandom(16)
    legacy = f"{salt.hex()}${hashlib.scrypt(PASSWORD.encode(), salt=salt, n=2**14, r=8, p=1).hex()}"
    repository.memory_users["old@example.com"] = {"name": "Old", "email": "old@example.com", "password_hash": legacy, "role": "candidate"}
    assert _login(email="old@example.com", password="wrong-password").status_code == 401
    assert _login(email="old@example.com").status_code == 200
    assert repository.memory_users["old@example.com"]["password_hash"].startswith("$argon2id$")
    assert _login(email="old@example.com").status_code == 200


def test_repeated_failures_are_throttled_and_success_resets_the_count():
    _register()
    for _ in range(4):
        assert _login(password="wrong-password").status_code == 401
    assert _login().status_code == 200
    for _ in range(5):
        assert _login(password="wrong-password").status_code == 401
    blocked = _login()
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0
    assert "Try again in 15 minutes" in blocked.json()["detail"]


def _from(address: str) -> dict:
    return {"CF-Connecting-IP": address}


def test_wrong_access_codes_are_capped_per_address(monkeypatch):
    monkeypatch.setattr(auth.code_guesses_from_address, "limit", 2)
    for i in range(2):
        response = client.post("/api/auth/register", headers=_from("203.0.113.9"), json={
            "name": "Guesser", "email": f"guess{i}@example.com", "password": PASSWORD, "role": "admin", "admin_access_code": "wrong",
        })
        assert response.status_code == 403
    real = {"name": "Real Recruiter", "email": "real@example.com", "password": PASSWORD, "role": "admin", "admin_access_code": "test-admin-code"}
    assert client.post("/api/auth/register", headers=_from("203.0.113.9"), json=real).status_code == 429
    # Someone else's wrong guesses do not stop a real interviewer signing up.
    assert client.post("/api/auth/register", headers=_from("198.51.100.7"), json=real).status_code == 200


def test_a_strangers_guesses_do_not_lock_out_the_owner():
    _register()
    for _ in range(5):
        assert client.post("/api/auth/login", headers=_from("203.0.113.9"), json={"email": "ada@example.com", "password": "wrong-password"}).status_code == 401
    assert client.post("/api/auth/login", headers=_from("203.0.113.9"), json={"email": "ada@example.com", "password": PASSWORD}).status_code == 429
    assert client.post("/api/auth/login", headers=_from("198.51.100.7"), json={"email": "ada@example.com", "password": PASSWORD}).status_code == 200


def test_one_address_cannot_try_many_accounts(monkeypatch):
    monkeypatch.setattr(auth.failed_from_address, "limit", 3)
    for i in range(3):
        assert client.post("/api/auth/login", headers=_from("203.0.113.9"), json={"email": f"user{i}@example.com", "password": "guess-123456"}).status_code == 401
    assert client.post("/api/auth/login", headers=_from("203.0.113.9"), json={"email": "user9@example.com", "password": "guess-123456"}).status_code == 429


def test_guesses_spread_over_many_addresses_are_still_capped(monkeypatch):
    monkeypatch.setattr(auth.failed_for_account, "limit", 3)
    _register()
    for i in range(3):
        assert client.post("/api/auth/login", headers=_from(f"203.0.113.{i}"), json={"email": "ada@example.com", "password": "wrong-password"}).status_code == 401
    assert client.post("/api/auth/login", headers=_from("203.0.113.99"), json={"email": "ada@example.com", "password": PASSWORD}).status_code == 429


def test_a_simultaneous_duplicate_signup_is_a_conflict_not_a_crash(monkeypatch):
    from pymongo.errors import DuplicateKeyError

    class Users:
        def find_one(self, _query):
            return None  # the other sign-up has not landed yet

        def insert_one(self, _doc):
            raise DuplicateKeyError("E11000 duplicate key error")

    class Db:
        users = Users()

    monkeypatch.setattr(repository, "db", Db())
    assert _register().status_code == 409


def test_me_logout_and_logout_all():
    first = _register().json()["token"]
    second = _login().json()["token"]
    assert client.get("/api/auth/me", headers=_auth(first)).json() == {"name": "Ada Lovelace", "email": "ada@example.com", "role": "candidate"}
    assert client.post("/api/auth/logout", headers=_auth(first)).status_code == 200
    assert _me(first) == 401
    assert _me(second) == 200
    third = _login().json()["token"]
    assert client.post("/api/auth/logout-all", headers=_auth(second)).status_code == 200
    assert _me(second) == 401 and _me(third) == 401
    assert client.post("/api/auth/logout").status_code == 200


def test_idle_and_expired_sessions_stop_working():
    idle = _register().json()["token"]
    next(iter(repository.memory_auth_sessions.values()))["last_used_at"] -= SESSION_IDLE
    assert _me(idle) == 401
    assert not repository.memory_auth_sessions

    expired = _login().json()["token"]
    session = next(iter(repository.memory_auth_sessions.values()))
    session["expires_at"] = session["created_at"]
    assert _me(expired) == 401


def test_changing_password_signs_out_other_devices():
    here = _register().json()["token"]
    there = _login().json()["token"]

    def change(current, new):
        return client.post("/api/auth/password", json={"current_password": current, "new_password": new}, headers=_auth(here))

    assert change("wrong-password", NEW_PASSWORD).status_code == 403
    assert change(PASSWORD, "password123").status_code == 422
    assert change(PASSWORD, NEW_PASSWORD).status_code == 200
    assert _me(here) == 200
    assert _me(there) == 401
    assert _login().status_code == 401
    assert _login(password=NEW_PASSWORD).status_code == 200


def test_speech_and_listen_belong_to_the_candidate(monkeypatch):
    monkeypatch.setattr("app.api.routes.cartesia_speech", lambda text: b"RIFF")
    monkeypatch.setattr(settings, "cartesia_api_key", "")
    owner = _register().json()["token"]
    other = _register(email="eve@example.com").json()["token"]
    session = store.create({"interview_id": "posting-1", "candidate_email": "ada@example.com", "candidate_name": "Ada"}, ["Tell me about a project?"])

    speech = f"/api/sessions/{session.id}/speech"
    assert client.get(speech).status_code == 401
    assert client.get(speech, headers=_auth(other)).status_code == 403
    assert client.get(speech, headers=_auth(owner)).status_code == 200

    listen = f"/api/sessions/{session.id}/listen"
    with client.websocket_connect(listen) as ws:
        assert ws.receive_json() == {"type": "error", "message": "Sign in to continue"}
    with client.websocket_connect(listen, subprotocols=["bearer", other]) as ws:
        assert ws.receive_json() == {"type": "error", "message": "This interview belongs to another candidate"}
    with client.websocket_connect(listen, subprotocols=["bearer", owner]) as ws:
        assert ws.accepted_subprotocol == "bearer"
        assert ws.receive_json() == {"type": "error", "message": KEY_MISSING}
