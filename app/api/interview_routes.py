"""Interviewer postings and the candidate link that opens them."""
from fastapi import APIRouter, Depends, Header, HTTPException

from app.api.deps import optional_user, require_admin, require_user
from app.domain.schemas import CreateInterviewRequest, JoinInterviewRequest
from app.services.attempts import attempt_row, ranked
from app.services.interview_postings import admin_view, candidate_view, prepare_interview, start_attempt
from app.services.repository import repository

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
