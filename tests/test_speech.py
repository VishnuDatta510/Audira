from fastapi.testclient import TestClient
from app.core.config import settings
from app.main import app
from app.services.speech import cartesia_speech, clear_cache

client = TestClient(app)
PAYLOAD = {
    "candidate_name": "Ada",
    "role": "Engineer",
    "job_description": "Build Python API services and collaborate with a team.",
    "resume": "Built two Python web projects.",
    "preparation_goal": "Practice concise answers.",
    "difficulty": "medium",
}
WAV = b"RIFF" + b"\x00" * 32


def test_speech_follows_the_question_on_screen(monkeypatch):
    spoken: list[str] = []

    def fake(text: str) -> bytes:
        spoken.append(text)
        return WAV

    monkeypatch.setattr("app.api.routes.cartesia_speech", fake)
    session_id = client.post("/api/sessions", json=PAYLOAD).json()["session_id"]
    started = client.post(f"/api/sessions/{session_id}/section", json={"section": "fundamentals"}).json()
    audio = client.get(f"/api/sessions/{session_id}/speech")
    assert audio.status_code == 200
    assert audio.headers["content-type"].startswith("audio/wav")
    assert audio.content == WAV
    assert audio.headers["x-question-index"] == "0"
    assert spoken == [started["question"]]

    client.post(f"/api/sessions/{session_id}/answer", json={"answer": "A process has its own memory; threads share it."})
    nxt = client.get(f"/api/sessions/{session_id}/speech")
    assert nxt.status_code == 200
    assert nxt.headers["x-question-index"] == "1"
    assert spoken[1] != spoken[0]


def test_missing_voice_is_unavailable(monkeypatch):
    monkeypatch.setattr("app.api.routes.cartesia_speech", lambda text: None)
    session_id = client.post("/api/sessions", json=PAYLOAD).json()["session_id"]
    client.post(f"/api/sessions/{session_id}/section", json={"section": "project"})
    audio = client.get(f"/api/sessions/{session_id}/speech")
    assert audio.status_code == 503


def test_unknown_session_has_no_speech():
    assert client.get("/api/sessions/missing/speech").status_code == 404


def test_coding_round_is_not_spoken(monkeypatch):
    called: list[str] = []
    monkeypatch.setattr("app.api.routes.cartesia_speech", lambda text: called.append(text) or WAV)
    session_id = client.post("/api/sessions", json=PAYLOAD).json()["session_id"]
    started = client.post(f"/api/sessions/{session_id}/dsa/start", json={})
    assert started.status_code == 200
    audio = client.get(f"/api/sessions/{session_id}/speech")
    assert audio.status_code == 409
    assert called == []


def test_cartesia_caches_and_rejects_a_missing_key(monkeypatch):
    clear_cache()
    calls = {"n": 0}

    def fake(transcript: str, key: str) -> bytes:
        calls["n"] += 1
        assert key == "test-key"
        assert transcript == "Hello there"
        return WAV

    monkeypatch.setattr("app.services.speech._request_wav", fake)
    monkeypatch.setattr(settings, "cartesia_api_key", "test-key")
    assert cartesia_speech("Hello   there") == WAV
    assert cartesia_speech("Hello there") == WAV
    assert calls["n"] == 1

    monkeypatch.setattr(settings, "cartesia_api_key", "")
    assert cartesia_speech("Hello there") is None
    clear_cache()
