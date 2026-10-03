"""MongoDB persistence with an in-memory fallback for local demos."""
import hashlib
import logging
import os
import secrets
from datetime import datetime, timezone

from pymongo import MongoClient

from app.core.config import settings

logger = logging.getLogger(__name__)
MAX_TOKENS = 10


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    value = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"{salt.hex()}${value.hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt, _ = stored.split("$", 1)
    return password_hash(password, bytes.fromhex(salt)) == stored


class Repository:
    def __init__(self):
        self.memory_users: dict[str, dict] = {}
        self.memory_sessions: dict[str, dict] = {}
        self.memory_interviews: dict[str, dict] = {}
        self.db = None
        self.connection_error: str | None = None
        if settings.mongodb_uri:
            try:
                database_name = settings.mongodb_database.strip().replace(" ", "_")
                client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=10000)
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
        for name in ("users", "sessions", "interviews"):
            if name not in existing:
                self.db.create_collection(name)
        self.db.users.create_index("email", unique=True)
        self.db.sessions.create_index("id", unique=True)
        self.db.sessions.create_index("profile.interview_id")
        self.db.interviews.create_index("id", unique=True)
        self.db.interviews.create_index("token", unique=True)

    def _public_user(self, user: dict, token: str) -> dict:
        return {"name": user["name"], "email": user["email"], "role": user.get("role") or "candidate", "token": token}

    def _issue_token(self, email: str) -> str:
        """Add a sign-in token. Earlier ones stay valid, so a second device does not sign out the first."""
        token = secrets.token_urlsafe(32)
        digest = hashlib.sha256(token.encode()).hexdigest()
        if self.db is not None:
            self.db.users.update_one({"email": email}, {"$push": {"token_hashes": {"$each": [digest], "$slice": -MAX_TOKENS}}})
        else:
            user = self.memory_users[email]
            user["token_hashes"] = (user.get("token_hashes", []) + [digest])[-MAX_TOKENS:]
        return token

    def create_user(self, name: str, email: str, password: str, role: str = "candidate") -> dict:
        if role not in {"candidate", "admin"}:
            raise ValueError("Unknown role")
        user = {
            "name": name,
            "email": email.lower(),
            "password_hash": password_hash(password),
            "role": role,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if self.db is not None:
            if self.db.users.find_one({"email": user["email"]}):
                raise ValueError("Email already exists")
            self.db.users.insert_one(dict(user))
        else:
            if user["email"] in self.memory_users:
                raise ValueError("Email already exists")
            self.memory_users[user["email"]] = user
        return self._public_user(user, self._issue_token(user["email"]))

    def authenticate(self, email: str, password: str) -> dict | None:
        email = email.lower()
        user = self.db.users.find_one({"email": email}) if self.db is not None else self.memory_users.get(email)
        if user and verify_password(password, user["password_hash"]):
            return self._public_user(user, self._issue_token(email))
        return None

    def user_from_token(self, token: str) -> dict | None:
        digest = hashlib.sha256(token.encode()).hexdigest()
        if self.db is not None:
            # token_hash is the single-token field older accounts still carry.
            user = self.db.users.find_one({"$or": [{"token_hashes": digest}, {"token_hash": digest}]})
        else:
            user = next((item for item in self.memory_users.values() if digest in item.get("token_hashes", [])), None)
        if not user:
            return None
        return {"name": user["name"], "email": user["email"], "role": user.get("role") or "candidate"}

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
