"""Interviewer postings and the candidate link that opens them."""
from fastapi import APIRouter, Depends, Header, HTTPException

from app.api.deps import optional_user, require_admin, require_user
from app.domain.schemas import CreateInterviewRequest, JoinInterviewRequest
from app.api.routes import dsa_seconds_left
from app.core.config import settings
from app.services.attempts import attempt_row, attempt_status, ranked
from app.services.conversation import progress
from app.services.interview_postings import admin_view, candidate_view, prepare_interview, start_attempt
from app.services.repository import repository
from app.services.session_store import session_from_saved, store

router = APIRouter(prefix="/api")


def _owned_or_404(interview_id: str, email: str) -> dict:
    interview = repository.get_interview(interview_id)
    if not interview or interview.get("created_by_email") != email:
        raise HTTPException(404, "Interview not found")
    return interview


@router.get("/admin/interviews")
def list_interviews(admin: dict = Depends(require_admin)):
    interviews = sorted(repository.list_interviews(admin["email"]), key=lambda item: item.get("created_at") or "", reverse=True)
    return [admin_view(item, repository.count_attempts(item["id"])) for item in interviews]


@router.post("/admin/interviews")
def create_interview(request: CreateInterviewRequest, admin: dict = Depends(require_admin)):
    interview = prepare_interview(admin, request.model_dump())
    return admin_view(interview, 0)


@router.get("/admin/interviews/{interview_id}")
def get_interview(interview_id: str, admin: dict = Depends(require_admin)):
    interview = _owned_or_404(interview_id, admin["email"])
    return admin_view(interview, repository.count_attempts(interview_id))


@router.get("/admin/interviews/{interview_id}/attempts")
def list_attempts(interview_id: str, admin: dict = Depends(require_admin)):
    _owned_or_404(interview_id, admin["email"])
    return ranked([attempt_row(item) for item in repository.sessions_for_interview(interview_id)])


@router.get("/admin/interviews/{interview_id}/attempts/{session_id}/live")
def live_attempt(interview_id: str, session_id: str, admin: dict = Depends(require_admin)):
    """What is happening in one attempt right now. The recruiter's page polls this every few seconds."""
    _owned_or_404(interview_id, admin["email"])
    # Read the saved copy, not this worker's cache, so another worker's answers show up too.
    saved = repository.load_session(session_id)
    session = session_from_saved(saved) if saved else store.get(session_id)
    if not session or session.profile.get("interview_id") != interview_id:
        raise HTTPException(404, "Attempt not found")
    return live_view(session)


def live_view(session) -> dict:
    transcript = []
    for section, state in session.conversation.items():
        for turn in state.get("turns", []):
            assessment = turn.get("assessment") or {}
            transcript.append({
                "section": section,
                "kind": turn.get("kind"),
                "topic": state["topics"][turn["topic"]]["skill"],
                "question": turn["question"],
                "answer": turn.get("answer"),
                "skipped": bool(turn.get("skipped")),
                "score": assessment.get("score"),
                "signal": assessment.get("signal"),
            })
        if state.get("closing"):
            transcript.append({"section": section, "kind": "wrap_up", "topic": "", "question": state["closing"], "answer": "", "skipped": False, "score": None, "signal": None})
    dsa = None
    if session.dsa:
        evaluation = session.dsa.get("evaluation") or {}
        dsa = {
            "title": session.dsa.get("title"),
            "language": session.dsa.get("language"),
            "submitted": bool(session.dsa.get("submitted")),
            "seconds_left": 0 if session.dsa.get("submitted") else dsa_seconds_left(session.dsa),
            "tests_passed": evaluation.get("tests_passed"),
            "tests_total": evaluation.get("tests_total"),
        }
    profile = session.profile
    return {
        "session_id": session.id,
        "candidate_name": profile.get("candidate_name") or "Candidate",
        "candidate_email": profile.get("candidate_email") or "",
        "role": profile.get("role") or "",
        "status": attempt_status(session.sections, session.disqualified),
        "sections": session.sections,
        "active_section": session.active_section,
        "progress": progress(session),
        "started_at": session.created_at,
        "transcript": transcript,
        "dsa": dsa,
        "round_scores": session.round_scores,
        "observations": [
            {"type": event.get("type"), "details": event.get("details", ""), "observed_at": event.get("observed_at")}
            for event in session.proctor_events
            if event.get("type") != "vision_check"
        ],
        "warnings": session.warnings,
        "warning_limit": settings.proctor_warning_limit,
        "disqualified": session.disqualified,
    }


@router.get("/interviews/{token}")
def public_interview(token: str, authorization: str | None = Header(default=None)):
    interview = repository.interview_by_token(token)
    if not interview:
        raise HTTPException(404, "Interview link not found")
    view = candidate_view(interview)
    user = optional_user(authorization)
    earlier = repository.attempt_for(interview["id"], user["email"]) if user and user["role"] == "candidate" else None
    view["my_session_id"] = earlier["id"] if earlier else None
    view["signed_in"] = user is not None
    return view


@router.post("/interviews/{token}/sessions")
def join_interview(token: str, request: JoinInterviewRequest, user: dict = Depends(require_user)):
    if user["role"] == "admin":
        raise HTTPException(403, "Interviewer accounts cannot take an interview. Sign in with a candidate account to try the link.")
    session = start_attempt(user, token, request.resume)
    if session is None:
        raise HTTPException(404, "Interview link not found")
    return {"session_id": session.id, "sections": session.sections}
