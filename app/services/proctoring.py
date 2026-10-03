from dataclasses import dataclass, field
from io import BytesIO
from typing import Any
from PIL import Image, ImageStat
from app.core.config import settings


WARNING_EVENTS = {"tab_hidden", "fullscreen_exit", "face_missing", "multiple_people", "suspicious_gaze", "suspicious_lip_movement", "suspicious_phone", "camera_unavailable"}


@dataclass
class CameraCheck:
    lighting: str
    warning: str | None = None


@dataclass
class VisionAnalysis:
    """Best-effort observations; never makes identity, emotion, or intent claims."""
    available: bool
    backend: str
    observations: list[dict[str, Any]] = field(default_factory=list)
    note: str = ""


def check_lighting(uploaded_image) -> CameraCheck:
    image = Image.open(uploaded_image).convert("L")
    brightness = ImageStat.Stat(image).mean[0]
    if brightness < settings.proctor_min_brightness:
        return CameraCheck("too dark", "low_light")
    if brightness > settings.proctor_max_brightness:
        return CameraCheck("too bright")
    return CameraCheck("good")


def add_warning(session, event_type: str, details: str) -> dict:
    event = {"type": event_type, "details": details, "observed_at": "during session"}
    session.proctor_events.append(event)
    if event_type in WARNING_EVENTS:
        session.warnings += 1
    if session.warnings >= settings.proctor_warning_limit:
        session.disqualified = True
    return {"warnings": session.warnings, "warning_limit": settings.proctor_warning_limit, "disqualified": session.disqualified, "event": event}


def record_observation(session, event_type: str, details: str) -> dict:
    return add_warning(session, event_type, details)


def rising_edge(session, key: str, active: bool) -> bool:
    """True only on the transition into an active episode.

    A face that stays missing, or a gaze that stays off-screen, must not add a
    new warning on every camera poll.
    """
    previous = session.vision_latches.get(key, False)
    session.vision_latches[key] = active
    return active and not previous


def analyse_image(image_bytes: bytes) -> VisionAnalysis:
    """Optional MediaPipe face count, falling back safely to a lighting check."""
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception:
        return VisionAnalysis(False, "none", note="Frame could not be decoded.")
    brightness = ImageStat.Stat(image.convert("L")).mean[0]
    lighting = "too_dark" if brightness < settings.proctor_min_brightness else "too_bright" if brightness > settings.proctor_max_brightness else "good"
    observations: list[dict[str, Any]] = [{"type": "lighting", "value": lighting, "brightness": round(brightness, 1)}]
    try:
        import mediapipe as mp
        import numpy as np
        detector = mp.solutions.face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.5)
        result = detector.process(np.asarray(image))
        count = len(result.detections or [])
        observations += [{"type": "face_visible", "value": count > 0}, {"type": "people_count", "value": count}]
        detector.close()
        return VisionAnalysis(True, "mediapipe_face_detection", observations, "Face presence/count only; gaze and mouth need time-series browser analysis.")
    except (ImportError, AttributeError, RuntimeError) as exc:
        return VisionAnalysis(False, "lighting_only", observations, f"Optional MediaPipe unavailable: {type(exc).__name__}.")
