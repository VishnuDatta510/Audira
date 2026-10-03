from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import uuid4

SECTIONS = ("dsa", "project", "fundamentals")


def _default_sections() -> dict[str, str]:
    return {name: "not_started" for name in SECTIONS}


@dataclass
class Session:
    id: str
    profile: dict
    questions: list[str]
    current_question: int = 0
    answers: list[dict] = field(default_factory=list)
    proctor_events: list[dict] = field(default_factory=list)
    dsa: dict | None = None
    warnings: int = 0
    disqualified: bool = False
    vision_latches: dict[str, bool] = field(default_factory=dict)
    round_index: int = 0
    round_scores: dict = field(default_factory=dict)
    sections: dict[str, str] = field(default_factory=_default_sections)
    active_section: str | None = None
    conversation: dict[str, dict] = field(default_factory=dict)
    report_cache: dict | None = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SessionStore:
    def __init__(self) -> None:
        self.sessions: dict[str, Session] = {}

    def create(self, profile: dict, questions: list[str]) -> Session:
        session = Session(str(uuid4()), profile, questions)
        if not profile.get("dsa_enabled", True):
            session.sections["dsa"] = "skipped"
        self.sessions[session.id] = session
        return session

    def get(self, session_id: str) -> Session | None:
        found = self.sessions.get(session_id)
        if found is not None:
            return found
        # The API process keeps sessions in memory. A reload drops that copy
        # while Mongo still has it, which made proctor posts 404 and skipped warnings.
        from app.services.repository import repository

        saved = repository.load_session(session_id)
        if not saved:
            return None
        session = session_from_saved(saved)
        self.sessions[session.id] = session
        return session

    @staticmethod
    def now() -> str:
        return datetime.now(timezone.utc).isoformat()


def session_from_saved(data: dict) -> Session:
    questions, current_question = _questions_from_saved(data)
    sections = data.get("sections") or _default_sections()
    return Session(
        id=data["id"],
        profile=dict(data.get("profile") or {}),
        questions=questions,
        current_question=current_question,
        answers=list(data.get("answers") or []),
        proctor_events=list(data.get("proctor_events") or []),
        dsa=data.get("dsa"),
        warnings=int(data.get("warnings") or 0),
        disqualified=bool(data.get("disqualified")),
        vision_latches={str(key): bool(value) for key, value in (data.get("vision_latches") or {}).items()},
        round_index=int(data.get("round_index") or 0),
        round_scores=dict(data.get("round_scores") or {}),
        sections=dict(sections),
        active_section=data.get("active_section"),
        conversation=dict(data.get("conversation") or {}),
        report_cache=data.get("report_cache"),
        created_at=data.get("created_at") or datetime.now(timezone.utc).isoformat(),
    )


def _questions_from_saved(data: dict) -> tuple[list[str], int]:
    questions = [str(item) for item in data.get("questions") or [] if item]
    if questions:
        return questions, int(data.get("current_question") or 0)
    section = data.get("active_section")
    state = (data.get("conversation") or {}).get(section) if section else None
    turns = (state or {}).get("turns") or []
    questions = [str(turn["question"]) for turn in turns if turn.get("question")]
    if not questions:
        return [], 0
    return questions, len(questions) - 1


store = SessionStore()
