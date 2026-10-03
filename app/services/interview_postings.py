"""Interviewer postings: the agent prepares a link, candidates join it."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from uuid import uuid4

from app.api.code_routes import public_problem
from app.problems.dynamic import remember
from app.problems.serialize import problem_from_dict, problem_to_dict
from app.services.agent import agent
from app.services.document_text import normalize_document_text
from app.services.repository import repository
from app.services.session_store import store
from app.workflows.interview_graph import interview_graph


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _summary(doc: dict) -> str:
    return str((doc.get("agent_brief") or {}).get("summary") or "")


def candidate_view(doc: dict) -> dict:
    return {
        "token": doc["token"],
        "role": doc["role"],
        "job_description": normalize_document_text(doc["job_description"]),
        "difficulty": doc["difficulty"],
        "dsa_enabled": doc["dsa_enabled"],
        "dsa_duration_minutes": doc["dsa_duration_minutes"],
        "project_question_count": doc["project_question_count"],
        "fundamentals_question_count": doc["fundamentals_question_count"],
    }


def admin_view(doc: dict, attempt_count: int) -> dict:
    raw = doc.get("coding_problem")
    problem = remember(problem_from_dict(raw)) if raw else None
    return {
        **candidate_view(doc),
        # The recruiter's steer and the agent's brief say how the candidate will be probed.
        "interview_focus": doc["interview_focus"],
        "summary": _summary(doc),
        "id": doc["id"],
        "path": f"/i/{doc['token']}",
        "created_at": doc["created_at"],
        "attempt_count": attempt_count,
        "coding_problem": public_problem(problem) if problem else None,
    }


def prepare_interview(admin: dict, spec: dict) -> dict:
    spec = {**spec, "job_description": normalize_document_text(spec["job_description"])}
    profile = {
        "candidate_name": "the hiring panel",
        "role": spec["role"],
        "job_description": spec["job_description"],
        "resume": "No candidate yet. Prepare the interview from the job description and the interviewer's criteria.",
        "preparation_goal": spec["interview_focus"],
        "interview_focus": spec["interview_focus"],
        "difficulty": spec["difficulty"],
    }
    brief = agent.read_profile(profile)
    problem = agent.author_coding_problem({**profile, "agent_brief": brief}) if spec["dsa_enabled"] else None
    if problem:
        remember(problem)
    token = secrets.token_urlsafe(9)
    for _ in range(3):
        if repository.interview_by_token(token) is None:
            break
        token = secrets.token_urlsafe(9)
    doc = {
        "id": str(uuid4()),
        "token": token,
        "created_by_email": admin["email"],
        "created_by_name": admin["name"],
        "role": spec["role"],
        "job_description": spec["job_description"],
        "interview_focus": spec["interview_focus"],
        "difficulty": spec["difficulty"],
        "dsa_enabled": spec["dsa_enabled"],
        "dsa_duration_minutes": spec["dsa_duration_minutes"],
        "project_question_count": spec["project_question_count"],
        "fundamentals_question_count": spec["fundamentals_question_count"],
        "agent_brief": brief,
        "coding_problem": problem_to_dict(problem) if problem else None,
        "created_at": _now(),
    }
    repository.insert_interview(doc)
    return doc


def start_attempt(user: dict, token: str, resume: str):
    """One attempt per candidate per interview. Joining again returns the attempt already started."""
    interview = repository.interview_by_token(token)
    if interview is None:
        return None
    earlier = repository.attempt_for(interview["id"], user["email"])
    if earlier:
        found = store.get(earlier["id"])
        if found is not None:
            return found
    problem = remember(problem_from_dict(interview["coding_problem"])) if interview.get("coding_problem") else None
    profile = {
        "candidate_name": user["name"],
        "candidate_email": user["email"],
        "role": interview["role"],
        "job_description": normalize_document_text(interview["job_description"]),
        "resume": resume,
        "preparation_goal": interview["interview_focus"],
        "interview_focus": interview["interview_focus"],
        "difficulty": interview["difficulty"],
        "dsa_enabled": interview["dsa_enabled"],
        "dsa_duration_minutes": interview["dsa_duration_minutes"],
        "project_question_count": interview["project_question_count"],
        "fundamentals_question_count": interview["fundamentals_question_count"],
        "interview_id": interview["id"],
        "interview_token": interview["token"],
        "interviewer_brief": interview.get("agent_brief") or {},
    }
    if problem:
        profile["prepared_problem_slug"] = problem.slug
        profile["coding_problem_title"] = problem.title
    brief = agent.read_profile(profile)
    questions = agent.opening_questions({**profile, "agent_brief": brief})
    profile["agent_brief"] = brief
    session = store.create(profile, questions)
    repository.save_session(session)
    return session
