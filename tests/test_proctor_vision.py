from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
PAYLOAD = {
    "candidate_name": "Ada",
    "role": "Engineer",
    "job_description": "Build Python API services and collaborate with a team.",
    "resume": "Built two Python web projects.",
    "preparation_goal": "Practice concise answers.",
    "difficulty": "medium",
}


def session_id() -> str:
    started = client.post("/api/sessions", json=PAYLOAD)
    assert started.status_code == 200
    return started.json()["session_id"]


def observe(active_session: str, **overrides):
    body = {"face_visible": True, "people_count": 1, "lighting": "good", "gaze_away_seconds": 0, "mouth_motion_seconds": 0, "source": "test"}
    body.update(overrides)
    response = client.post(f"/api/sessions/{active_session}/vision-observations", json=body)
    assert response.status_code == 200
    return response.json()


def test_continuous_gaze_counts_once_until_the_candidate_looks_back():
    active = session_id()
    first = observe(active, gaze_away_seconds=12)
    second = observe(active, gaze_away_seconds=14)
    assert first["warnings"] == 1
    assert second["warnings"] == 1
    assert second["disqualified"] is False
    observe(active, gaze_away_seconds=0)
    third = observe(active, gaze_away_seconds=11)
    assert third["warnings"] == 2


def test_gaze_under_the_threshold_does_not_warn():
    active = session_id()
    result = observe(active, gaze_away_seconds=9.5)
    assert result["warnings"] == 0


def test_face_missing_counts_once_per_absence():
    active = session_id()
    first = observe(active, face_visible=False, people_count=0)
    second = observe(active, face_visible=False, people_count=0)
    assert first["warnings"] == second["warnings"] == 1
    observe(active, face_visible=True, people_count=1)
    third = observe(active, face_visible=False, people_count=0)
    assert third["warnings"] == 2


def test_warnings_continue_after_the_in_memory_session_is_dropped():
    from app.services.session_store import store

    active = session_id()
    for expected in range(1, 6):
        store.sessions.pop(active, None)
        observe(active, gaze_away_seconds=0)
        result = observe(active, gaze_away_seconds=12)
        assert result["warnings"] == expected
        assert result["disqualified"] is (expected == 5)
    summary = client.get(f"/api/sessions/{active}")
    assert summary.status_code == 200
    assert summary.json()["disqualified"] is True
    assert summary.json()["warnings"] == 5


def test_quiet_frames_and_short_mouth_motion_are_not_stored():
    from app.services.session_store import store

    active = session_id()
    observe(active)
    observe(active, mouth_motion_seconds=0.4)
    stored = store.get(active)
    assert stored is not None
    assert stored.proctor_events == []
    observe(active, mouth_motion_seconds=2)
    observe(active, mouth_motion_seconds=3)
    assert [event["type"] for event in stored.proctor_events] == ["mouth_motion"]
    assert stored.warnings == 0
