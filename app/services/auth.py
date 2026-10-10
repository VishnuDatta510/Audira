"""Password hashing, password rules and sign-in throttling."""
import hashlib
import hmac
import math
import threading
import time
from collections import deque

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

# OWASP's Argon2id baseline. Light enough for a 512 MB instance.
_hasher = PasswordHasher(time_cost=2, memory_cost=19 * 1024, parallelism=1)
_DUMMY_HASH = _hasher.hash("audira-unknown-account")

COMMON_PASSWORDS = frozenset({
    "password", "password1", "password12", "password123", "password!", "passw0rd", "p@ssw0rd", "p@ssword",
    "12345678", "123456789", "1234567890", "12341234", "87654321", "11111111", "00000000", "88888888",
    "qwerty12", "qwerty123", "qwertyui", "qwertyuiop", "1q2w3e4r", "q1w2e3r4", "1qaz2wsx", "zaq12wsx",
    "asdfghjk", "asdf1234", "abcd1234", "abc12345", "iloveyou", "sunshine", "princess", "football",
    "baseball", "superman", "starwars", "trustno1", "computer", "whatever", "welcome1", "welcome123",
    "letmein1", "admin123", "administrator", "changeme", "dragon12", "monkey12", "michael1", "jennifer",
    "audira123", "interview",
})


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def _scrypt_matches(password: str, stored: str) -> bool:
    """Accounts created before Argon2 store `salthex$hashhex` from scrypt."""
    salt, _, expected = stored.partition("$")
    try:
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1).hex()
    except ValueError:
        return False
    return hmac.compare_digest(actual, expected)


def verify_password(password: str, stored: str | None) -> bool:
    """Constant-time check. With no stored hash it still does the work, so timing hides unknown emails."""
    if not stored:
        try:
            _hasher.verify(_DUMMY_HASH, password)
        except VerificationError:
            pass
        return False
    if stored.startswith("$argon2"):
        try:
            return _hasher.verify(stored, password)
        except (VerificationError, InvalidHashError):
            return False
    return _scrypt_matches(password, stored)


def needs_rehash(stored: str) -> bool:
    return not stored.startswith("$argon2") or _hasher.check_needs_rehash(stored)


def password_problem(password: str, email: str) -> str | None:
    lowered = password.lower()
    if lowered in COMMON_PASSWORDS:
        return "That password is too common. Pick something harder to guess."
    if lowered in {email.lower(), email.lower().split("@")[0]}:
        return "Do not use your email as your password."
    return None


class Throttle:
    """At most `limit` attempts per key in a sliding window.

    ponytail: in-process counters, fine for one API instance. Move to Mongo or Redis when the API scales out.
    """

    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def take(self, key: str) -> int:
        """Record an attempt. Returns 0 when allowed, otherwise the seconds to wait."""
        with self._lock:
            now = time.monotonic()
            if len(self._hits) > 10_000:
                self._hits = {k: v for k, v in self._hits.items() if v[-1] > now - self.window}
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return max(1, math.ceil(hits[0] + self.window - now))
            hits.append(now)
            return 0

    def clear(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


sign_in_attempts = Throttle(limit=5, window_seconds=15 * 60)
access_code_attempts = Throttle(limit=20, window_seconds=60 * 60)
