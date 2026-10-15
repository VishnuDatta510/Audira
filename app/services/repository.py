"""MongoDB persistence with an in-memory fallback for local demos."""
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

from app.core.config import settings

logger = logging.getLogger(__name__)
SESSION_IDLE = timedelta(days=7)
SESSION_LIFETIME = timedelta(days=30)
SESSION_TOUCH_EVERY = timedelta(hours=1)
INVITE_LIFETIME = timedelta(days=7)


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Repository:
    def __init__(self):
        self.memory_users: dict[str, dict] = {}
        self.memory_auth_sessions: dict[str, dict] = {}
        self.memory_sessions: dict[str, dict] = {}
        self.memory_interviews: dict[str, dict] = {}
        self.memory_workspaces: dict[str, dict] = {}
        self.memory_members: dict[str, dict] = {}
        self.memory_invites: dict[str, dict] = {}
        self.memory_evidence: dict[str, bytes] = {}
        self.db = None
        self.connection_error: str | None = None
        if settings.mongodb_uri:
            try:
                database_name = settings.mongodb_database.strip().replace(" ", "_")
                client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=10000, tz_aware=True)
                client.admin.command("ping")
                self.db = client[database_name]
                self._ensure_collections()
            except Exception as exc:
                # Keep the demo/test application usable when Atlas DNS or credentials are unavailable.
                self.connection_error = str(exc)
                self.db = None
                logger.warning("MongoDB unavailable, using in-memory storage: %s", exc)

    def _ensure_collections(self) -> None:
        existing = set(self.db.list_collection_names())
        for name in ("users", "auth_sessions", "sessions", "interviews", "workspaces", "members", "invites", "evidence"):
            if name not in existing:
                self.db.create_collection(name)
        self.db.users.create_index("email", unique=True)
        # Sign-in tokens used to live on the user. They are no longer accepted.
        self.db.users.update_many(
            {"$or": [{"token_hashes": {"$exists": True}}, {"token_hash": {"$exists": True}}]},
            {"$unset": {"token_hashes": "", "token_hash": ""}},
        )
        self.db.auth_sessions.create_index("token_hash", unique=True)
        self.db.auth_sessions.create_index("email")
        self.db.auth_sessions.create_index("expires_at", expireAfterSeconds=0)
        self.db.sessions.create_index("id", unique=True)
        self.db.sessions.create_index("profile.interview_id")
        self.db.interviews.create_index("id", unique=True)
        self.db.interviews.create_index("token", unique=True)
        self.db.interviews.create_index("workspace_id")
        self.db.workspaces.create_index("id", unique=True)
        # One workspace per person for now. Dropping this index is most of what several would take.
        self.db.members.create_index("email", unique=True)
        self.db.members.create_index("workspace_id")
        self.db.invites.create_index("token_hash", unique=True)
        self.db.invites.create_index([("workspace_id", 1), ("email", 1)], unique=True)
        self.db.invites.create_index("expires_at", expireAfterSeconds=0)
        self.db.evidence.create_index([("session_id", 1), ("event_id", 1)], unique=True)
        self._move_admins_into_workspaces()

    def _move_admins_into_workspaces(self) -> None:
        """Interviewers used to be users with role "admin". Each becomes the owner of a workspace that keeps their interviews.

        Safe to run on every start: someone who already has a workspace is left alone.
        """
        for user in self.db.users.find({"role": "admin"}):
            if not self.db.members.find_one({"email": user["email"]}):
                self.create_workspace(f"{user['name']}'s workspace", user["email"])
            workspace_id = self.db.members.find_one({"email": user["email"]})["workspace_id"]
            self.db.interviews.update_many(
                {"created_by_email": user["email"], "workspace_id": {"$exists": False}}, {"$set": {"workspace_id": workspace_id}}
            )
        self.db.users.update_many({"role": {"$exists": True}}, {"$unset": {"role": ""}})

    def public_user(self, user: dict) -> dict:
        return {"name": user["name"], "email": user["email"], "workspace": self.workspace_for(user["email"])}

    def find_user(self, email: str) -> dict | None:
        if self.db is not None:
            return self._strip(self.db.users.find_one({"email": email}))
        return self.memory_users.get(email)

    def create_user(self, name: str, email: str, password_hash: str) -> dict:
        user = {
            "name": name,
            "email": email,
            "password_hash": password_hash,
            "created_at": _now().isoformat(),
        }
        if self.db is not None:
            # The unique index is the real guard: two sign-ups at once both pass a find-first check.
            try:
                self.db.users.insert_one(dict(user))
            except DuplicateKeyError as exc:
                raise ValueError("Email already exists") from exc
        else:
            if email in self.memory_users:
                raise ValueError("Email already exists")
            self.memory_users[email] = user
        return user

    def set_password_hash(self, email: str, password_hash: str) -> None:
        if self.db is not None:
            self.db.users.update_one({"email": email}, {"$set": {"password_hash": password_hash}})
        else:
            self.memory_users[email]["password_hash"] = password_hash

    def create_auth_session(self, email: str) -> str:
        """A new sign-in. Other devices stay signed in. Only the token's hash is stored."""
        token = secrets.token_urlsafe(32)
        now = _now()
        doc = {"token_hash": _digest(token), "email": email, "created_at": now, "last_used_at": now, "expires_at": now + SESSION_LIFETIME}
        if self.db is not None:
            self.db.auth_sessions.insert_one(dict(doc))
        else:
            self.memory_auth_sessions[doc["token_hash"]] = doc
        return token

    def user_from_token(self, token: str) -> dict | None:
        digest = _digest(token)
        now = _now()
        if self.db is not None:
            found = self.db.auth_sessions.find_one({"token_hash": digest})
        else:
            found = self.memory_auth_sessions.get(digest)
        if not found:
            return None
        if found["expires_at"] <= now or found["last_used_at"] + SESSION_IDLE <= now:
            self.revoke_auth_session(token)
            return None
        if now - found["last_used_at"] >= SESSION_TOUCH_EVERY:
            if self.db is not None:
                self.db.auth_sessions.update_one({"token_hash": digest}, {"$set": {"last_used_at": now}})
            else:
                found["last_used_at"] = now
        user = self.find_user(found["email"])
        return self.public_user(user) if user else None

    def revoke_auth_session(self, token: str) -> None:
        if self.db is not None:
            self.db.auth_sessions.delete_one({"token_hash": _digest(token)})
        else:
            self.memory_auth_sessions.pop(_digest(token), None)

    def revoke_auth_sessions(self, email: str, keep_token: str | None = None) -> None:
        """Sign the user out everywhere, except the device holding `keep_token`."""
        keep = _digest(keep_token) if keep_token else None
        if self.db is not None:
            self.db.auth_sessions.delete_many({"email": email, "token_hash": {"$ne": keep}})
            return
        for digest in [d for d, s in self.memory_auth_sessions.items() if s["email"] == email and d != keep]:
            del self.memory_auth_sessions[digest]

    def save_session(self, session) -> None:
        data = {
            "id": session.id,
            "profile": session.profile,
            "answers": session.answers,
            "questions": session.questions,
            "current_question": session.current_question,
            "proctor_events": session.proctor_events,
            "warnings": session.warnings,
            "disqualified": session.disqualified,
            "vision_latches": session.vision_latches,
            "last_vision_at": session.last_vision_at,
            "round_index": session.round_index,
            "round_scores": session.round_scores,
            "dsa": session.dsa,
            "sections": session.sections,
            "active_section": session.active_section,
            "conversation": session.conversation,
            "report_cache": session.report_cache,
            "created_at": session.created_at,
        }
        if self.db is not None:
            self.db.sessions.update_one({"id": session.id}, {"$set": data}, upsert=True)
        else:
            self.memory_sessions[session.id] = data

    @staticmethod
    def _strip(doc: dict | None) -> dict | None:
        if not doc:
            return None
        clean = dict(doc)
        clean.pop("_id", None)
        return clean

    def load_session(self, session_id: str) -> dict | None:
        if self.db is not None:
            return self._strip(self.db.sessions.find_one({"id": session_id}))
        return self.memory_sessions.get(session_id)

    def save_evidence(self, session_id: str, event_id: str, jpeg: bytes) -> None:
        """Stills live apart from the session so the session document stays small."""
        if self.db is not None:
            self.db.evidence.update_one({"session_id": session_id, "event_id": event_id}, {"$set": {"jpeg": jpeg}}, upsert=True)
        else:
            self.memory_evidence[f"{session_id}:{event_id}"] = jpeg

    def load_evidence(self, session_id: str, event_id: str) -> bytes | None:
        if self.db is not None:
            doc = self.db.evidence.find_one({"session_id": session_id, "event_id": event_id})
            return bytes(doc["jpeg"]) if doc else None
        return self.memory_evidence.get(f"{session_id}:{event_id}")

    def insert_interview(self, doc: dict) -> dict:
        if self.db is not None:
            self.db.interviews.insert_one(dict(doc))
        else:
            self.memory_interviews[doc["id"]] = doc
        return doc

    def get_interview(self, interview_id: str) -> dict | None:
        if self.db is not None:
            return self._strip(self.db.interviews.find_one({"id": interview_id}))
        return self.memory_interviews.get(interview_id)

    def interview_by_token(self, token: str) -> dict | None:
        if self.db is not None:
            return self._strip(self.db.interviews.find_one({"token": token}))
        return next((item for item in self.memory_interviews.values() if item.get("token") == token), None)

    def list_interviews(self, workspace_id: str) -> list[dict]:
        if self.db is not None:
            return [self._strip(item) for item in self.db.interviews.find({"workspace_id": workspace_id})]
        return [item for item in self.memory_interviews.values() if item.get("workspace_id") == workspace_id]

    def sessions_for_interview(self, interview_id: str) -> list[dict]:
        if self.db is not None:
            return [self._strip(item) for item in self.db.sessions.find({"profile.interview_id": interview_id})]
        return [item for item in self.memory_sessions.values() if (item.get("profile") or {}).get("interview_id") == interview_id]

    def attempt_for(self, interview_id: str, email: str) -> dict | None:
        """The candidate's earlier attempt at this interview, if any."""
        if self.db is not None:
            return self._strip(self.db.sessions.find_one({"profile.interview_id": interview_id, "profile.candidate_email": email}))
        return next(
            (item for item in self.sessions_for_interview(interview_id) if (item.get("profile") or {}).get("candidate_email") == email),
            None,
        )

    def count_attempts(self, interview_id: str) -> int:
        return len(self.sessions_for_interview(interview_id))

    # Workspaces: a hiring team. Members hold a role in one; invites bring new members in.

    def create_workspace(self, name: str, owner_email: str) -> dict:
        workspace = {"id": str(uuid4()), "name": name, "created_by_email": owner_email, "created_at": _now()}
        if self.db is not None:
            self.db.workspaces.insert_one(dict(workspace))
        else:
            self.memory_workspaces[workspace["id"]] = workspace
        self.add_member(workspace["id"], owner_email, "owner")
        return workspace

    def rename_workspace(self, workspace_id: str, name: str) -> None:
        if self.db is not None:
            self.db.workspaces.update_one({"id": workspace_id}, {"$set": {"name": name}})
        else:
            self.memory_workspaces[workspace_id]["name"] = name

    def get_workspace(self, workspace_id: str) -> dict | None:
        if self.db is not None:
            return self._strip(self.db.workspaces.find_one({"id": workspace_id}))
        return self.memory_workspaces.get(workspace_id)

    def workspace_for(self, email: str) -> dict | None:
        """The caller's workspace and their role in it, or None for someone who is not on a hiring team."""
        if self.db is not None:
            member = self.db.members.find_one({"email": email})
            workspace = self.db.workspaces.find_one({"id": member["workspace_id"]}) if member else None
        else:
            member = self.memory_members.get(email)
            workspace = self.memory_workspaces.get(member["workspace_id"]) if member else None
        if not workspace:
            return None
        return {"id": workspace["id"], "name": workspace["name"], "role": member["role"]}

    def add_member(self, workspace_id: str, email: str, role: str) -> None:
        doc = {"workspace_id": workspace_id, "email": email, "role": role, "joined_at": _now()}
        if self.db is not None:
            try:
                self.db.members.insert_one(dict(doc))
            except DuplicateKeyError as exc:
                raise ValueError("Already in a workspace") from exc
        else:
            if email in self.memory_members:
                raise ValueError("Already in a workspace")
            self.memory_members[email] = doc

    def members(self, workspace_id: str) -> list[dict]:
        if self.db is not None:
            found = [self._strip(m) for m in self.db.members.find({"workspace_id": workspace_id})]
            names = {u["email"]: u["name"] for u in self.db.users.find({"email": {"$in": [m["email"] for m in found]}}, {"email": 1, "name": 1})}
        else:
            found = [m for m in self.memory_members.values() if m["workspace_id"] == workspace_id]
            names = {email: user["name"] for email, user in self.memory_users.items()}
        return [{**m, "name": names.get(m["email"], m["email"])} for m in sorted(found, key=lambda m: m["joined_at"])]

    def set_member_role(self, workspace_id: str, email: str, role: str) -> None:
        if self.db is not None:
            self.db.members.update_one({"workspace_id": workspace_id, "email": email}, {"$set": {"role": role}})
        else:
            self.memory_members[email]["role"] = role

    def remove_member(self, workspace_id: str, email: str) -> None:
        if self.db is not None:
            self.db.members.delete_one({"workspace_id": workspace_id, "email": email})
        elif (self.memory_members.get(email) or {}).get("workspace_id") == workspace_id:
            del self.memory_members[email]

    def create_invite(self, workspace_id: str, email: str, role: str, invited_by: dict) -> tuple[dict, str]:
        """A new invite link. Inviting the same email again replaces the old link. Only the token's hash is stored."""
        token = secrets.token_urlsafe(32)
        now = _now()
        doc = {
            "id": str(uuid4()),
            "workspace_id": workspace_id,
            "email": email,
            "role": role,
            "token_hash": _digest(token),
            "invited_by_email": invited_by["email"],
            "invited_by_name": invited_by["name"],
            "created_at": now,
            "expires_at": now + INVITE_LIFETIME,
        }
        if self.db is not None:
            self.db.invites.delete_many({"workspace_id": workspace_id, "email": email})
            self.db.invites.insert_one(dict(doc))
        else:
            self.memory_invites = {h: i for h, i in self.memory_invites.items() if (i["workspace_id"], i["email"]) != (workspace_id, email)}
            self.memory_invites[doc["token_hash"]] = doc
        return doc, token

    def invites(self, workspace_id: str) -> list[dict]:
        now = _now()
        if self.db is not None:
            found = [self._strip(i) for i in self.db.invites.find({"workspace_id": workspace_id, "expires_at": {"$gt": now}})]
        else:
            found = [i for i in self.memory_invites.values() if i["workspace_id"] == workspace_id and i["expires_at"] > now]
        return sorted(found, key=lambda i: i["created_at"], reverse=True)

    def invite_by_token(self, token: str) -> dict | None:
        """The live invite behind a link. Mongo's TTL sweep runs about once a minute, so expiry is checked here too."""
        if self.db is not None:
            found = self._strip(self.db.invites.find_one({"token_hash": _digest(token)}))
        else:
            found = self.memory_invites.get(_digest(token))
        return found if found and found["expires_at"] > _now() else None

    def take_invite(self, token: str) -> dict | None:
        """Use up an invite. Two accepts at once cannot both get it: the delete happens once."""
        digest = _digest(token)
        if self.db is not None:
            found = self._strip(self.db.invites.find_one_and_delete({"token_hash": digest, "expires_at": {"$gt": _now()}}))
        else:
            found = self.memory_invites.pop(digest, None)
        return found if found and found["expires_at"] > _now() else None

    def delete_invite(self, workspace_id: str, invite_id: str) -> bool:
        if self.db is not None:
            return self.db.invites.delete_one({"workspace_id": workspace_id, "id": invite_id}).deleted_count == 1
        for digest, invite in list(self.memory_invites.items()):
            if invite["workspace_id"] == workspace_id and invite["id"] == invite_id:
                del self.memory_invites[digest]
                return True
        return False

    def coding_problem_by_slug(self, slug: str) -> dict | None:
        if self.db is not None:
            doc = self.db.interviews.find_one({"coding_problem.slug": slug}, {"coding_problem": 1})
            return (doc or {}).get("coding_problem")
        for item in self.memory_interviews.values():
            problem = item.get("coding_problem") or {}
            if problem.get("slug") == slug:
                return problem
        return None


repository = Repository()
