"""MongoDB persistence with an in-memory fallback for local demos."""
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

from app.core.config import settings

logger = logging.getLogger(__name__)
SESSION_IDLE = timedelta(days=7)
SESSION_LIFETIME = timedelta(days=30)
SESSION_TOUCH_EVERY = timedelta(hours=1)


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
        for name in ("users", "auth_sessions", "sessions", "interviews"):
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

    @staticmethod
    def public_user(user: dict) -> dict:
        return {"name": user["name"], "email": user["email"], "role": user.get("role") or "candidate"}

    def find_user(self, email: str) -> dict | None:
        if self.db is not None:
            return self._strip(self.db.users.find_one({"email": email}))
        return self.memory_users.get(email)

    def create_user(self, name: str, email: str, password_hash: str, role: str = "candidate") -> dict:
        if role not in {"candidate", "admin"}:
            raise ValueError("Unknown role")
        user = {
            "name": name,
            "email": email,
            "password_hash": password_hash,
            "role": role,
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

    def list_interviews(self, email: str) -> list[dict]:
        if self.db is not None:
            return [self._strip(item) for item in self.db.interviews.find({"created_by_email": email})]
        return [item for item in self.memory_interviews.values() if item.get("created_by_email") == email]

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
