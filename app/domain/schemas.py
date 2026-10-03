from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ProctorEventType(str, Enum):
    tab_hidden = "tab_hidden"
    fullscreen_exit = "fullscreen_exit"
    face_missing = "face_missing"
    multiple_people = "multiple_people"
    low_light = "low_light"
    suspicious_gaze = "suspicious_gaze"
    suspicious_lip_movement = "suspicious_lip_movement"
    suspicious_phone = "suspicious_phone"
    camera_unavailable = "camera_unavailable"


class StartSessionRequest(BaseModel):
    candidate_name: str = Field(min_length=1, max_length=100)
    role: str = Field(min_length=2, max_length=200)
    job_description: str = Field(min_length=30, max_length=8000)
    resume: str = Field(min_length=10, max_length=8000)
    preparation_goal: str = Field(min_length=5, max_length=1000)
    difficulty: str = Field(default="medium", pattern="^(easy|medium|hard)$")
    dsa_enabled: bool = True
    dsa_duration_minutes: int = Field(default=20, ge=5, le=90)
    project_question_count: int = Field(default=3, ge=3, le=5)
    fundamentals_question_count: int = Field(default=3, ge=3, le=5)
    interview_focus: str = Field(default="general technical assessment", max_length=1000)


class AnswerRequest(BaseModel):
    answer: str = Field(default="", max_length=8000)
    skipped: bool = False

    @model_validator(mode="after")
    def answer_unless_skipped(self):
        if self.skipped:
            self.answer = ""
            return self
        if not self.answer.strip():
            raise ValueError("Answer is required unless the question is skipped")
        return self


class SectionStartRequest(BaseModel):
    section: str = Field(pattern="^(project|fundamentals|dsa)$")


class DSAStartRequest(BaseModel):
    """Omitted fields fall back to the session profile."""
    difficulty: str | None = Field(default=None, pattern="^(easy|medium|hard)$")
    duration_minutes: int | None = Field(default=None, ge=5, le=90)


class DSAAnswerRequest(BaseModel):
    code: str = Field(min_length=1, max_length=50000)
    language: str = Field(default="python", max_length=20)


class RunCodeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=50000)
    language: str = Field(max_length=20)
    custom_input: str | None = Field(default=None, max_length=200000)


class SubmitCodeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=50000)
    language: str = Field(max_length=20)


class ProctorEventRequest(BaseModel):
    event_type: ProctorEventType
    details: str = Field(default="", max_length=300)


class VisionObservationRequest(BaseModel):
    """Client-side vision output; an observation, never a cheating verdict."""
    face_visible: bool | None = None
    people_count: int | None = Field(default=None, ge=0, le=10)
    lighting: str | None = Field(default=None, pattern="^(good|too_dark|too_bright)$")
    gaze_away_seconds: float | None = Field(default=None, ge=0, le=300)
    mouth_motion_seconds: float | None = Field(default=None, ge=0, le=300)
    source: str = Field(default="client_vision", max_length=60)


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    role: Literal["candidate", "admin"] = "candidate"
    admin_access_code: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class CreateInterviewRequest(BaseModel):
    role: str = Field(min_length=2, max_length=200)
    job_description: str = Field(min_length=30, max_length=8000)
    interview_focus: str = Field(min_length=5, max_length=1000)
    difficulty: str = Field(default="medium", pattern="^(easy|medium|hard)$")
    dsa_enabled: bool = True
    dsa_duration_minutes: int = Field(default=20, ge=5, le=90)
    project_question_count: int = Field(default=3, ge=3, le=5)
    fundamentals_question_count: int = Field(default=3, ge=3, le=5)


class JoinInterviewRequest(BaseModel):
    resume: str = Field(min_length=10, max_length=8000)
