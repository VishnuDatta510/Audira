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


def test_a_phone_uses_two_warnings_and_a_glance_one():
    active = session_id()
    phone = client.post(f"/api/sessions/{active}/proctor-events", json={"event_type": "suspicious_phone", "details": "phone"}).json()
    assert phone["warnings"] == 2
    assert phone["event"]["weight"] == 2
    review = client.post(f"/api/sessions/{active}/proctor-events", json={"event_type": "second_screen", "details": "extended"}).json()
    assert review["warnings"] == 2
    assert review["event"]["weight"] == 0


def test_a_silent_coding_round_counts_once_as_lost_monitoring():
    from datetime import datetime, timedelta, timezone
    from app.services.session_store import store

    active = session_id()
    assert client.post(f"/api/sessions/{active}/dsa/start", json={}).status_code == 200
    observe(active)
    stored = store.get(active)
    stored.dsa["started_at"] = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
    stored.last_vision_at = (datetime.now(timezone.utc) - timedelta(seconds=45)).isoformat()
    first = client.get(f"/api/sessions/{active}").json()
    second = client.get(f"/api/sessions/{active}").json()
    assert first["warnings"] == second["warnings"] == 2
    assert [event["type"] for event in first["warnings_log"]] == ["monitoring_lost"]
    observe(active)
    assert client.get(f"/api/sessions/{active}").json()["warnings"] == 2


def test_voice_is_noted_in_the_coding_round_but_not_in_a_spoken_one():
    from app.services.session_store import store

    active = session_id()
    observe(active, voice_seconds=3, mouth_motion_seconds=0)
    stored = store.get(active)
    assert [event["type"] for event in stored.proctor_events] == ["voice_detected"]
    assert "someone else" in stored.proctor_events[0]["details"]
    assert stored.warnings == 0
    observe(active, voice_seconds=0)
    stored.active_section = "project"
    observe(active, voice_seconds=4, mouth_motion_seconds=4)
    assert len(stored.proctor_events) == 1


def test_a_still_is_stored_for_its_warning_and_served_back():
    import base64
    from io import BytesIO
    from PIL import Image

    active = session_id()
    event = client.post(f"/api/sessions/{active}/proctor-events", json={"event_type": "suspicious_phone", "details": "phone"}).json()["event"]
    still = BytesIO()
    Image.new("RGB", (640, 480), "gray").save(still, "JPEG")
    image = "data:image/jpeg;base64," + base64.b64encode(still.getvalue()).decode()
    assert client.post(f"/api/sessions/{active}/evidence", json={"event_id": event["id"], "image": image}).json() == {"recorded": True}
    served = client.get(f"/api/sessions/{active}/evidence/{event['id']}")
    assert served.status_code == 200
    assert Image.open(BytesIO(served.content)).size == (320, 240)
    bad = client.post(f"/api/sessions/{active}/evidence", json={"event_id": event["id"], "image": "bm90IGFuIGltYWdl"})
    assert bad.status_code == 422
