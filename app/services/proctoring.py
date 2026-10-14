from datetime import datetime, timedelta, timezone
from io import BytesIO
from uuid import uuid4
from PIL import Image
from app.core.config import settings


# How much each warning counts toward the limit. A phone or a second person is
# stronger evidence than a glance away, so it uses up more of the limit.
WARNING_WEIGHTS = {
    "tab_hidden": 1,
    "fullscreen_exit": 1,
    "face_missing": 1,
    "suspicious_gaze": 1,
    "camera_unavailable": 1,
    "multiple_people": 2,
    "suspicious_phone": 2,
    "monitoring_lost": 2,
}
WARNING_EVENTS = set(WARNING_WEIGHTS)
MAX_EVIDENCE = 24
EVIDENCE_SIZE = (320, 240)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def add_warning(session, event_type: str, details: str, source: str | None = None) -> dict:
    """Record an observation. Only WARNING_EVENTS count toward the limit; the rest are for review."""
    weight = WARNING_WEIGHTS.get(event_type, 0)
    event = {
        "id": uuid4().hex[:12],
        "type": event_type,
        "details": details,
        "observed_at": _now().isoformat(),
        "section": session.active_section,
        "weight": weight,
    }
    if source:
        event["source"] = source
    session.proctor_events.append(event)
    session.warnings += weight
    if session.warnings >= settings.proctor_warning_limit:
        session.disqualified = True
    return {"warnings": session.warnings, "warning_limit": settings.proctor_warning_limit, "disqualified": session.disqualified, "event": event}


def record_observation(session, event_type: str, details: str, source: str | None = None) -> dict:
    return add_warning(session, event_type, details, source)


def rising_edge(session, key: str, active: bool) -> bool:
    """True only on the transition into an active episode.

    A face that stays missing, or a gaze that stays off-screen, must not add a
    new warning on every camera poll.
    """
    previous = session.vision_latches.get(key, False)
    session.vision_latches[key] = active
    return active and not previous


def check_heartbeat(session) -> dict | None:
    """Count one warning when the coding round runs without camera reports.

    The browser posts an observation every few seconds. Silence means the page
    was frozen, the script was stopped, or the tab was closed mid-round, and the
    server would otherwise never hear about it.
    """
    dsa = session.dsa
    if session.disqualified or session.active_section != "dsa" or not dsa or dsa.get("submitted"):
        return None
    started = datetime.fromisoformat(dsa["started_at"])
    ends = started + timedelta(minutes=dsa["duration_minutes"])
    last = datetime.fromisoformat(session.last_vision_at) if session.last_vision_at else started
    silent = (min(_now(), ends) - max(last, started)).total_seconds()
    if not rising_edge(session, "monitoring_lost", silent >= settings.proctor_heartbeat_seconds):
        return None
    return add_warning(session, "monitoring_lost", f"No camera reports for {int(silent)} seconds during the coding round.")


def note_vision(session) -> None:
    session.last_vision_at = _now().isoformat()
    session.vision_latches["monitoring_lost"] = False


def evidence_jpeg(raw: bytes) -> bytes:
    """Re-encode an uploaded still so only a small, plain JPEG is stored."""
    image = Image.open(BytesIO(raw))
    image.verify()
    image = Image.open(BytesIO(raw)).convert("RGB")
    image.thumbnail(EVIDENCE_SIZE)
    out = BytesIO()
    image.save(out, "JPEG", quality=70)
    return out.getvalue()
