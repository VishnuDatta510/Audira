"""Scoreboard rows for one interviewer posting. Words stay on the full report."""
from __future__ import annotations

ROUND_KEYS = ("dsa", "project", "fundamentals")


def _status(sections: dict, disqualified: bool) -> str:
    if disqualified:
        return "stopped"
    values = list(sections.values()) or ["not_started"]
    if all(value in {"completed", "skipped"} for value in values):
        return "finished"
    if any(value != "not_started" for value in values):
        return "in_progress"
    return "joined"


def _overall(scores: dict) -> int | None:
    values = [scores[key] for key in ROUND_KEYS if key in scores]
    if not values:
        return None
    return round(sum(values) / len(values))


def attempt_row(saved: dict) -> dict:
    profile = saved.get("profile") or {}
    scores = saved.get("round_scores") or {}
    overall = _overall(scores)
    return {
        "session_id": saved.get("id"),
        "name": profile.get("candidate_name") or "Candidate",
        "email": profile.get("candidate_email") or "",
        "status": _status(saved.get("sections") or {}, bool(saved.get("disqualified"))),
        "scores": {key: scores.get(key) for key in ROUND_KEYS},
        "overall_score": overall,
        "started_at": saved.get("created_at"),
        "warnings": saved.get("warnings", 0),
    }


def ranked(rows: list[dict]) -> list[dict]:
    ordered = sorted(rows, key=lambda row: (row["overall_score"] is None, -(row["overall_score"] or 0), row["name"]))
    return [{**row, "rank": index + 1} for index, row in enumerate(ordered)]
