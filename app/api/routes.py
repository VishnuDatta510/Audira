import threading
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Header, HTTPException, UploadFile, WebSocket
from fastapi.responses import Response
from app.core.config import settings
from app.domain.schemas import AnswerRequest, DSAAnswerRequest, DSAStartRequest, ProctorEventRequest, StartSessionRequest, RegisterRequest, LoginRequest, VisionObservationRequest, SectionStartRequest
from app.api.code_routes import execute, public_problem
from app.api.deps import access_code_ok, require_admin, user_from_authorization
from app.problems import problem_for_difficulty
from app.services.prepared_problems import problem_for_session
from app.services.assessment import evaluate_dsa_submission
from app.services.code_runner import judge
from app.services.documents import extract_text_from_bytes
from app.services.repository import repository
from app.services.agent import agent
from app.services import conversation
from app.services.conversation import CONVERSATIONAL_SECTIONS
from app.services.proctoring import WARNING_EVENTS, record_observation, rising_edge
from app.services.report import build_report
from app.services.session_store import SECTIONS, store
from app.services.listen import bridge_listen
from app.services.speech import cartesia_speech
from app.workflows.interview_graph import interview_graph

router = APIRouter(prefix="/api")
MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
_section_guard = threading.Lock()
_section_locks: dict[str, threading.Lock] = {}


def _lock_for(session_id: str) -> threading.Lock:
    """One start at a time per session, so a double-click cannot generate two question sets."""
    with _section_guard:
        lock = _section_locks.get(session_id)
        if lock is None:
            lock = threading.Lock()
            _section_locks[session_id] = lock
        return lock


@router.get("/config")
def config():
    return {"agent_model": agent.model, "proctor_warning_limit": settings.proctor_warning_limit, "proctor_face_absence_seconds": settings.proctor_face_absence_seconds, "proctor_mouth_review_seconds": settings.proctor_mouth_review_seconds, "code_runner": settings.code_runner}


@router.post("/documents/extract")
async def extract_document(file: UploadFile):
    raw = await file.read()
    if len(raw) > MAX_DOCUMENT_BYTES:
        raise HTTPException(413, "Documents must be 5 MB or smaller")
    try:
        text = extract_text_from_bytes(file.filename or "upload.txt", raw).strip()
    except Exception as exc:
        raise HTTPException(422, f"Could not read {file.filename}: {exc}") from exc
    return {"file_name": file.filename, "text": text, "characters": len(text)}


@router.post("/auth/register")
def register(request: RegisterRequest):
    if request.role == "admin" and not access_code_ok(request.admin_access_code):
        raise HTTPException(403, "Interviewer signup needs the access code from ADMIN_ACCESS_CODE")
    try:
        return repository.create_user(request.name, request.email, request.password, request.role)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc

@router.post("/auth/login")
def login(request: LoginRequest):
    user = repository.authenticate(request.email, request.password)
    if not user: raise HTTPException(401, "Invalid email or password")
    return user


def session_or_404(session_id: str):
    session = store.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return session


def recruiter_session(session) -> bool:
    """Opened from a recruiter's link. Scores and written feedback on it are for the recruiter only."""
    return bool(session.profile.get("interview_id"))


def candidate_session(session_id: str, authorization: str | None):
    """The session, when the caller is the candidate taking it. Practice sessions have no owner."""
    session = session_or_404(session_id)
    if recruiter_session(session):
        user = user_from_authorization(authorization)
        if user["email"] != session.profile.get("candidate_email"):
            raise HTTPException(403, "This interview belongs to another candidate")
    return session


def recruiter_or_403(session, authorization: str | None) -> None:
    """Only the interviewer who published the link may read an attempt's report."""
    if not recruiter_session(session):
        return
    admin = require_admin(authorization)
    interview = repository.get_interview(session.profile["interview_id"])
    if not interview or interview.get("created_by_email") != admin["email"]:
        raise HTTPException(404, "Session not found")


def dsa_for_candidate(session, dsa: dict) -> dict:
    if not recruiter_session(session):
        return dsa
    return {key: value for key, value in dsa.items() if key != "evaluation"}


def ensure_active(session):
    if session.disqualified:
        raise HTTPException(403, "Session has been disqualified after the warning limit was reached")


def dsa_seconds_left(dsa: dict) -> int:
    started = datetime.fromisoformat(dsa["started_at"])
    ends = started + timedelta(minutes=dsa["duration_minutes"])
    return max(0, int((ends - datetime.now(timezone.utc)).total_seconds()))


def session_summary(session) -> dict:
    profile = session.profile
    voice = conversation.progress(session) if session.sections.get(session.active_section or "") == "in_progress" else None
    for_recruiter = recruiter_session(session)
    dsa = None
    if session.dsa:
        dsa = {key: session.dsa.get(key) for key in ("problem_slug", "title", "difficulty", "duration_minutes", "submitted", "language", "evaluation")}
        dsa["seconds_left"] = 0 if session.dsa.get("submitted") else dsa_seconds_left(session.dsa)
        if for_recruiter:
            dsa["evaluation"] = None
    return {
        "session_id": session.id,
        "candidate_name": profile.get("candidate_name"),
        "role": profile.get("role"),
        "difficulty": profile.get("difficulty", "medium"),
        "dsa_duration_minutes": profile.get("dsa_duration_minutes", 20),
        "sections": session.sections,
        "active_section": session.active_section,
        "voice_progress": voice,
        "dsa": dsa,
        "warnings": session.warnings,
        "warning_limit": settings.proctor_warning_limit,
        "disqualified": session.disqualified,
        "warnings_log": [{"type": event.get("type"), "details": event.get("details", ""), "observed_at": event.get("observed_at")} for event in session.proctor_events if event.get("type") in WARNING_EVENTS],
        "round_scores": {} if for_recruiter else session.round_scores,
        "recruiter_session": for_recruiter,
        "created_at": session.created_at,
    }


@router.post("/sessions")
def start_session(request: StartSessionRequest):
    profile = request.model_dump()
    planned = interview_graph.invoke({"profile": profile, "brief": {}, "questions": []})
    profile["agent_brief"] = planned["brief"]
    session = store.create(profile, planned["questions"])
    questions = session.questions
    repository.save_session(session)
    return {"session_id": session.id, "question": questions[0], "question_number": 1, "total_questions": len(questions), "sections": session.sections}


@router.get("/sessions/{session_id}")
def get_session(session_id: str, authorization: str | None = Header(default=None)):
    return session_summary(candidate_session(session_id, authorization))


@router.get("/sessions/{session_id}/speech")
def question_speech(session_id: str):
    """WAV of the question currently on screen. The client cannot choose the spoken text."""
    session = session_or_404(session_id)
    ensure_active(session)
    if session.active_section == "dsa":
        raise HTTPException(409, "The coding round stays on screen and is not spoken")
    if session.current_question >= len(session.questions):
        raise HTTPException(409, "No question left to speak")
    question = session.questions[session.current_question].strip()
    if not question:
        raise HTTPException(409, "Question is empty")
    audio = cartesia_speech(question)
    if not audio:
        raise HTTPException(503, "Question voice is unavailable")
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store", "X-Question-Index": str(session.current_question)},
    )


@router.websocket("/sessions/{session_id}/listen")
async def listen(websocket: WebSocket, session_id: str):
    """Stream microphone PCM to Cartesia and return the running transcript."""
    await bridge_listen(websocket, session_id)


@router.post("/sessions/{session_id}/answer")
def submit_answer(session_id: str, request: AnswerRequest, authorization: str | None = Header(default=None)):
    session = candidate_session(session_id, authorization)
    ensure_active(session)
    if session.current_question >= len(session.questions):
        raise HTTPException(409, "Interview is already complete")
    section = session.active_section or "general"
    if section in CONVERSATIONAL_SECTIONS:
        with _lock_for(session_id):
            try:
                result = conversation.respond(session, request.answer, skipped=request.skipped)
            except conversation.SkipNotAllowed as exc:
                raise HTTPException(409, str(exc)) from exc
            repository.save_session(session)
        if recruiter_session(session):
            result["feedback"] = None
        return result
    question = session.questions[session.current_question]
    feedback = agent.critique(question, request.answer, session.profile, section)
    session.answers.append({"section": section, "question": question, "answer": request.answer, "feedback": feedback, "submitted_at": store.now()})
    session.current_question += 1
    next_question = session.questions[session.current_question] if session.current_question < len(session.questions) else None
    if next_question is None and section in SECTIONS:
        scores = [a["feedback"]["score"] for a in session.answers if a.get("section") == section]
        session.round_scores[section] = round(sum(scores) / len(scores))
        session.sections[section] = "completed"
        session.active_section = None
    repository.save_session(session)
    shown = None if recruiter_session(session) else feedback
    return {"feedback": shown, "next_question": next_question, "question_number": session.current_question + 1, "total_questions": len(session.questions), "complete": next_question is None}


@router.post("/sessions/{session_id}/section")
def start_section(session_id: str, request: SectionStartRequest, authorization: str | None = Header(default=None)):
    with _lock_for(session_id):
        return _start_section(session_id, request, authorization)


def _start_section(session_id: str, request: SectionStartRequest, authorization: str | None):
    session = candidate_session(session_id, authorization)
    ensure_active(session)
    if request.section == "dsa":
        return start_dsa(session_id, DSAStartRequest(), authorization)
    status = session.sections.get(request.section)
    if status in {"completed", "skipped"}:
        raise HTTPException(409, f"The {request.section} section is already {status}")
    started = conversation.start(session, request.section)
    repository.save_session(session)
    return started


@router.post("/sessions/{session_id}/sections/{section}/skip")
def skip_section(session_id: str, section: str, authorization: str | None = Header(default=None)):
    session = candidate_session(session_id, authorization)
    ensure_active(session)
    if section not in SECTIONS:
        raise HTTPException(404, "Unknown section")
    if recruiter_session(session):
        # The overall score averages finished rounds, so a skip would lift it.
        raise HTTPException(409, "The recruiter chose the rounds for this interview, so they cannot be skipped")
    if session.sections[section] != "not_started":
        raise HTTPException(409, "Only sections that have not started can be skipped")
    session.sections[section] = "skipped"
    repository.save_session(session)
    return session_summary(session)


@router.post("/sessions/{session_id}/end-early")
def end_early(session_id: str, authorization: str | None = Header(default=None)):
    """Candidate option to end the entire interview early."""
    session = candidate_session(session_id, authorization)
    with _lock_for(session_id):
        if session.active_section in CONVERSATIONAL_SECTIONS:
            state = session.conversation[session.active_section]
            if "closing" not in state:
                state["closing"] = conversation.FALLBACK_CLOSING
                conversation._close(session, session.active_section, state)
        for section in SECTIONS:
            if session.sections.get(section) in {"not_started", "in_progress"}:
                session.sections[section] = "skipped"
        session.active_section = None
        repository.save_session(session)
    return session_summary(session)


@router.post("/sessions/{session_id}/transcribe")
async def transcribe_answer(session_id: str, audio: UploadFile, authorization: str | None = Header(default=None)):
    candidate_session(session_id, authorization)
    text = agent.transcribe_audio(await audio.read())
    return {"transcript": text}


@router.post("/sessions/{session_id}/dsa/start")
def start_dsa(session_id: str, request: DSAStartRequest, authorization: str | None = Header(default=None)):
    session = candidate_session(session_id, authorization)
    ensure_active(session)
    status = session.sections.get("dsa")
    if status == "skipped":
        raise HTTPException(409, "The DSA section was skipped for this session")
    if not session.dsa:
        if session.profile.get("prepared_problem_slug"):
            problem = problem_for_session(session)
            if problem is None:
                raise HTTPException(409, "This interview has no coding problem ready")
        else:
            difficulty = request.difficulty or session.profile.get("difficulty", "medium")
            problem = problem_for_difficulty(difficulty)
        session.dsa = {
            "problem_slug": problem.slug,
            "title": problem.title,
            "difficulty": problem.difficulty,
            "started_at": store.now(),
            "duration_minutes": request.duration_minutes or session.profile.get("dsa_duration_minutes", 20),
            "submitted": False,
        }
        session.sections["dsa"] = "in_progress"
        session.active_section = "dsa"
        repository.save_session(session)
    else:
        problem = problem_for_session(session)
        if problem is None:
            raise HTTPException(409, "The coding problem for this attempt is no longer available")
    return {
        **dsa_for_candidate(session, session.dsa),
        "problem": public_problem(problem),
        "ends_in_seconds": 0 if session.dsa["submitted"] else dsa_seconds_left(session.dsa),
    }


@router.post("/sessions/{session_id}/dsa/submit")
def submit_dsa(session_id: str, request: DSAAnswerRequest, authorization: str | None = Header(default=None)):
    session = candidate_session(session_id, authorization)
    ensure_active(session)
    if not session.dsa:
        raise HTTPException(409, "Start a DSA assessment first")
    if session.dsa.get("submitted"):
        raise HTTPException(409, "This DSA question has already been submitted")
    problem = problem_for_session(session)
    if problem is None:
        raise HTTPException(409, "The coding problem for this attempt is no longer available")
    judged = execute(lambda: judge(problem, request.language, request.code, list(problem.tests)))
    evaluation = evaluate_dsa_submission(request.code, problem, judged, request.language)
    session.dsa.update({
        "submitted": True,
        "language": request.language,
        "code": request.code,
        "code_length": len(request.code),
        "late": dsa_seconds_left(session.dsa) == 0,
        "status": "Accepted" if judged["all_passed"] else "Needs work",
        "evaluation": evaluation,
    })
    session.round_scores["dsa"] = evaluation["score"]
    session.sections["dsa"] = "completed"
    if session.active_section == "dsa":
        session.active_section = None
    repository.save_session(session)
    shown = dsa_for_candidate(session, {k: v for k, v in session.dsa.items() if k != "code"})
    return {**judged, "evaluation": shown.get("evaluation"), "dsa": shown}


@router.post("/sessions/{session_id}/proctor-events")
def record_proctor_event(session_id: str, request: ProctorEventRequest, authorization: str | None = Header(default=None)):
    session = candidate_session(session_id, authorization)
    outcome = record_observation(session, request.event_type.value, request.details)
    outcome["event"]["observed_at"] = store.now()
    repository.save_session(session)
    return {"recorded": True, **outcome}


@router.post("/sessions/{session_id}/vision-observations")
def record_vision_observation(session_id: str, request: VisionObservationRequest, authorization: str | None = Header(default=None)):
    """Persist transparent signals; no signal is proof of malpractice.

    A condition that stays true across polls counts once. The warning can fire
    again only after the camera reports that the condition cleared.
    """
    session = candidate_session(session_id, authorization)
    outcomes = []
    if rising_edge(session, "face_missing", request.face_visible is False):
        outcomes.append(record_observation(session, "face_missing", "Face was not detected by the camera."))
    extra_people = request.people_count is not None and request.people_count > 1
    if rising_edge(session, "multiple_people", extra_people):
        outcomes.append(record_observation(session, "multiple_people", f"Camera detected {request.people_count} people."))
    poor_light = request.lighting in {"too_dark", "too_bright"}
    if rising_edge(session, "low_light", poor_light):
        outcomes.append(record_observation(session, "low_light", f"Lighting observation: {request.lighting}."))
    gaze_away = request.gaze_away_seconds is not None and request.gaze_away_seconds >= settings.proctor_face_absence_seconds
    if rising_edge(session, "suspicious_gaze", gaze_away):
        outcomes.append(record_observation(session, "suspicious_gaze", f"Off-screen gaze observed for {request.gaze_away_seconds:.1f} seconds."))
    mouth_active = request.mouth_motion_seconds is not None and request.mouth_motion_seconds >= settings.proctor_mouth_review_seconds
    recorded_mouth = False
    if rising_edge(session, "mouth_motion", mouth_active):
        session.proctor_events.append({"type": "mouth_motion", "details": f"Mouth motion observed for {request.mouth_motion_seconds:.1f} seconds; requires human review.", "observed_at": store.now(), "source": request.source})
        recorded_mouth = True
    for item in outcomes:
        item["event"]["observed_at"] = store.now()
        item["event"]["source"] = request.source
    repository.save_session(session)
    return {"recorded": True, "warnings": session.warnings, "warning_limit": settings.proctor_warning_limit, "disqualified": session.disqualified, "observations": outcomes}


@router.get("/sessions/{session_id}/report")
def report(session_id: str, authorization: str | None = Header(default=None)):
    session = session_or_404(session_id)
    recruiter_or_403(session, authorization)
    cached = session.report_cache
    built = build_report(session)
    if session.report_cache is not cached:
        repository.save_session(session)
    return built
