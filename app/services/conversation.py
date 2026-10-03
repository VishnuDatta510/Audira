"""Session bookkeeping for the conversational rounds (project and fundamentals).

Each round's live state sits in session.conversation[section]. session.questions
mirrors every line the interviewer has said in the active round, so the speech
endpoint keeps reading session.questions[session.current_question].

Budgets keep the conversation finite: a round has at most two turns per planned
topic plus EXTRA_TURNS, a topic gets at most MAX_FOLLOW_UPS follow-ups, and the
interviewer can chase at most MAX_PROBES things the candidate brought up.
"""
from __future__ import annotations

from app.services import interviewer
from app.services.agent import AgentUnavailable
from app.services.session_store import store

CONVERSATIONAL_SECTIONS = ("project", "fundamentals")
MAX_FOLLOW_UPS = 2
MAX_PROBES = 2
EXTRA_TURNS = 2
FALLBACK_CLOSING = "That covers everything I wanted to ask in this round. Thanks for walking me through it."
SKIPPED_ASSESSMENT = {
    "score": None,
    "signal": "skipped",
    "strength": "The candidate skipped this follow-up.",
    "improvement": "Not scored. Their other answers on this topic still count.",
    "role_relevance": "",
}


class SkipNotAllowed(Exception):
    """The current question is not a follow-up, so it cannot be skipped."""


def _history(state: dict) -> list[dict]:
    return [
        {
            "question": t["question"],
            "answer": "" if t.get("skipped") else t["answer"],
            "topic": state["topics"][t["topic"]]["skill"],
            "skipped": bool(t.get("skipped")),
        }
        for t in state["turns"]
        if t["answer"] is not None
    ]


def _current_skill(state: dict) -> str:
    return state["topics"][state["current"]]["skill"]


def _earlier_coverage(session, section: str) -> list[str]:
    seen: list[str] = []
    for name, state in session.conversation.items():
        if name == section:
            continue
        for topic in state["topics"]:
            if topic["status"] in {"covered", "current"} and topic["skill"] not in seen:
                seen.append(topic["skill"])
        for mention in state["mentions"]:
            if mention not in seen:
                seen.append(mention)
    return seen[:12]


def _activate(session, section: str, state: dict) -> dict:
    """Point the session's question cursor at this round's unanswered line."""
    session.questions = [t["question"] for t in state["turns"]]
    session.current_question = len(session.questions) - 1
    session.active_section = section
    return {
        "section": section,
        "question": state["turns"][-1]["question"],
        "question_number": len(state["turns"]),
        "total_questions": state["max_turns"],
        "topic": _current_skill(state),
        "kind": state["turns"][-1]["kind"],
        "history": _history(state),
    }


def start(session, section: str) -> dict:
    state = session.conversation.get(section)
    if state and session.sections.get(section) == "in_progress" and state["closing"] is None:
        return _activate(session, section, state)

    count = int(session.profile.get(f"{section}_question_count", 3))
    plan = interviewer.plan_round(session.profile, section, count, _earlier_coverage(session, section))
    topics = [{**topic, "status": "upcoming", "origin": "plan", "level": None, "note": ""} for topic in plan["topics"]]
    topics[0]["status"] = "current"
    state = {
        "topics": topics,
        "current": 0,
        "follow_ups": 0,
        "probes": 0,
        "max_turns": len(topics) * 2 + EXTRA_TURNS,
        "turns": [{"topic": 0, "kind": "opening", "question": plan["opening"], "answer": None, "assessment": None}],
        "mentions": [],
        "closing": None,
        "verdict": None,
    }
    session.conversation[section] = state
    session.sections[section] = "in_progress"
    return _activate(session, section, state)


def _has_upcoming(state: dict) -> bool:
    return any(t["status"] == "upcoming" for t in state["topics"])


def _moves_after_skip(state: dict, turns_left: int) -> tuple[str, ...]:
    """A skipped follow-up ends that thread. The interviewer moves on or closes."""
    if turns_left > 0 and _has_upcoming(state):
        return ("next_topic",)
    return ("wrap_up",)


def _fallback_skip_reply(state: dict, move: str) -> str:
    if move == "wrap_up":
        return f"That's fine, we'll leave that one. {FALLBACK_CLOSING}"
    upcoming = next(topic for topic in state["topics"] if topic["status"] == "upcoming")
    angle = str(upcoming.get("angle") or "").strip()
    bridge = f"That's fine, we'll leave that one. Let's talk about {upcoming['skill']}."
    return f"{bridge} {angle}".strip() if angle else bridge


def _allowed(state: dict, turns_left: int) -> tuple[str, ...]:
    if turns_left <= 0:
        return ("wrap_up",)
    allowed: list[str] = []
    if state["follow_ups"] < MAX_FOLLOW_UPS:
        allowed.append("follow_up")
    if state["probes"] < MAX_PROBES:
        allowed.append("probe_mention")
    allowed.append("next_topic" if _has_upcoming(state) else "wrap_up")
    return tuple(allowed)


def _next_move(decision: str, allowed: tuple[str, ...], state: dict) -> str:
    """The model's choice, bent back inside the budget when it strays."""
    if allowed == ("wrap_up",) or decision == "wrap_up":
        return "wrap_up"
    if decision == "next_topic" and _has_upcoming(state):
        return "next_topic"
    if decision in ("probe_mention", "next_topic") and state["probes"] < MAX_PROBES:
        return "probe_mention"
    return "follow_up"


def _move_to(state: dict, index: int) -> None:
    state["topics"][state["current"]]["status"] = "covered"
    state["topics"][index]["status"] = "current"
    state["current"] = index
    state["follow_ups"] = 0


def _apply_move(state: dict, move: str, result: dict) -> None:
    if move == "follow_up":
        state["follow_ups"] += 1
    elif move == "next_topic":
        _move_to(state, next(i for i, t in enumerate(state["topics"]) if t["status"] == "upcoming"))
    elif move == "probe_mention":
        name = result["new_topic"] or (result["mentions"][0] if result["mentions"] else "Something they mentioned")
        known = next((i for i, t in enumerate(state["topics"]) if t["skill"].strip().lower() == name.strip().lower()), None)
        if known is None:
            state["topics"].insert(state["current"] + 1, {
                "skill": name, "why": "The candidate brought this up.", "angle": "", "status": "upcoming",
                "origin": "mention", "level": None, "note": "",
            })
            state["probes"] += 1
            _move_to(state, state["current"] + 1)
        elif known == state["current"]:
            # Probing the topic already under discussion is a follow-up, not a second copy of it.
            state["follow_ups"] += 1
        else:
            _move_to(state, known)


def _close(session, section: str, state: dict) -> None:
    state["topics"][state["current"]]["status"] = "covered"
    try:
        verdict = interviewer.rate_round(session.profile, section, state)
        verdict["rated_by"] = "agent"
        score = round(sum(s["rating"] for s in verdict["skills"]) / len(verdict["skills"]))
    except AgentUnavailable:
        scores = [
            t["assessment"]["score"]
            for t in state["turns"]
            if t.get("assessment") and isinstance(t["assessment"].get("score"), (int, float))
        ]
        verdict = {"skills": [], "summary": "", "rated_by": "answer_average"}
        score = round(sum(scores) / len(scores)) if scores else 0
    state["verdict"] = verdict
    session.round_scores[section] = score
    session.sections[section] = "completed"
    session.active_section = None


def respond(session, answer: str, skipped: bool = False) -> dict:
    section = session.active_section
    state = session.conversation[section]
    turn = state["turns"][-1]
    if skipped and turn["kind"] != "follow_up":
        raise SkipNotAllowed("Only a follow-up question can be skipped")
    turns_left = state["max_turns"] - len(state["turns"])
    allowed = _moves_after_skip(state, turns_left) if skipped else _allowed(state, turns_left)
    result = interviewer.next_turn(session.profile, section, state, answer, allowed, turns_left, skipped=skipped)
    if skipped:
        result["assessment"] = dict(SKIPPED_ASSESSMENT)
        if result["decision"] not in allowed:
            result["decision"] = allowed[0]
            result["reply"] = _fallback_skip_reply(state, result["decision"])

    turn["answer"] = "" if skipped else answer
    turn["skipped"] = skipped
    turn["assessment"] = result["assessment"]
    topic = state["topics"][state["current"]]
    if result["topic_level"] and not skipped:
        topic["level"], topic["note"] = result["topic_level"], result["topic_note"]
    if not skipped:
        state["mentions"].extend(m for m in result["mentions"] if m not in state["mentions"])
    session.answers.append({
        "section": section,
        "question": turn["question"],
        "answer": "" if skipped else answer,
        "skipped": skipped,
        "feedback": result["assessment"],
        "topic": topic["skill"],
        "kind": turn["kind"],
        "submitted_at": store.now(),
    })

    move = result["decision"] if skipped else _next_move(result["decision"], allowed, state)
    session.current_question += 1
    if move == "wrap_up":
        state["closing"] = result["reply"] if result["decision"] == "wrap_up" else FALLBACK_CLOSING
        _close(session, section, state)
        return {
            "feedback": result["assessment"],
            "next_question": None,
            "question_number": len(state["turns"]),
            "total_questions": state["max_turns"],
            "complete": True,
            "closing": state["closing"],
            "topic": topic["skill"],
            "kind": move,
        }

    _apply_move(state, move, result)
    state["turns"].append({"topic": state["current"], "kind": move, "question": result["reply"], "answer": None, "assessment": None})
    session.questions.append(result["reply"])
    return {
        "feedback": result["assessment"],
        "next_question": result["reply"],
        "question_number": len(state["turns"]),
        "total_questions": state["max_turns"],
        "complete": False,
        "closing": None,
        "topic": _current_skill(state),
        "kind": move,
    }


def progress(session) -> dict | None:
    state = session.conversation.get(session.active_section or "")
    if not state or state["closing"] is not None:
        return None
    return {
        "section": session.active_section,
        "question_number": len(state["turns"]),
        "total_questions": state["max_turns"],
        "topic": _current_skill(state),
    }


def verdicts(session) -> dict[str, dict]:
    """Per-skill ratings for every closed round, for the report."""
    return {
        section: {**state["verdict"], "topics": [
            {"skill": t["skill"], "origin": t["origin"], "level": t["level"], "note": t["note"]}
            for t in state["topics"] if t["status"] == "covered"
        ]}
        for section, state in session.conversation.items()
        if state.get("verdict")
    }
