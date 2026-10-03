"""Final interview report for the recruiter: numbers from the session, words from the interview agent."""
from __future__ import annotations

from app.services.agent import agent
from app.services.conversation import verdicts

# Bump when the written report changes shape so older cached reports are rewritten.
REPORT_VERSION = 2


def _cache_key(session) -> str:
    dsa_done = bool(session.dsa and session.dsa.get("submitted"))
    return f"v{REPORT_VERSION}|{len(session.answers)}|{dsa_done}|{sorted(session.round_scores.items())}"


def _scored(answers: list[dict]) -> list[int]:
    """Answers the candidate actually gave. A skipped follow-up has no score."""
    return [a["feedback"]["score"] for a in answers if isinstance(a.get("feedback", {}).get("score"), (int, float))]


def _overall_score(session) -> int:
    if session.round_scores:
        return round(sum(session.round_scores.values()) / len(session.round_scores))
    scores = _scored(session.answers)
    return round(sum(scores) / len(scores)) if scores else 0


def _written_feedback(session) -> dict:
    if not session.answers and not (session.dsa and session.dsa.get("evaluation")):
        return {
            "summary": "The candidate has not completed a round yet, so there is nothing to assess.",
            "communication_assessment": {},
            "strengths": [],
            "gaps": [],
            "follow_up_questions": [],
        }
    key = _cache_key(session)
    cached = session.report_cache
    if cached and cached.get("key") == key:
        return cached["feedback"]
    feedback = agent.final_report(session.profile, session.answers, session.round_scores, session.dsa)
    session.report_cache = {"key": key, "feedback": feedback}
    return feedback


def build_report(session) -> dict:
    by_section: dict[str, list[dict]] = {}
    for answer in session.answers:
        by_section.setdefault(answer.get("section", "general"), []).append(answer)
    section_summaries = {}
    for section, items in by_section.items():
        scores = _scored(items)
        section_summaries[section] = {
            "answer_count": len(items),
            "average_score": round(sum(scores) / len(scores)) if scores else 0,
            "answers": items,
        }
    profile = session.profile
    return {
        "candidate_name": profile.get("candidate_name") or "Candidate",
        "candidate_email": profile.get("candidate_email") or "",
        "role": profile.get("role") or "",
        "interview_id": profile.get("interview_id"),
        "started_at": session.created_at,
        "sections": session.sections,
        "overall_score": _overall_score(session),
        **_written_feedback(session),
        "section_summaries": section_summaries,
        "integrity_observations": session.proctor_events,
        "warnings": session.warnings,
        "disqualified": session.disqualified,
        "round_scores": session.round_scores,
        "round_verdicts": verdicts(session),
        "dsa_result": session.dsa,
    }
