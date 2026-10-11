from tests.test_interviews import POSTING, _auth, _register, client, memory_db  # noqa: F401  (memory_db is a fixture)


def test_recruiter_watches_an_attempt_live(memory_db):
    admin = _register("admin", "test-admin-code")
    posting = client.post("/api/admin/interviews", json=POSTING, headers=_auth(admin["token"])).json()
    student = _register("candidate")
    me = _auth(student["token"])
    session_id = client.post(f"/api/interviews/{posting['token']}/sessions", json={"resume": "Built Python APIs."}, headers=me).json()["session_id"]
    live_url = f"/api/admin/interviews/{posting['id']}/attempts/{session_id}/live"

    before = client.get(live_url, headers=_auth(admin["token"]))
    assert before.status_code == 200, before.text
    assert before.json()["status"] == "joined" and before.json()["transcript"] == []

    started = client.post(f"/api/sessions/{session_id}/section", json={"section": "fundamentals"}, headers=me)
    assert started.status_code == 200, started.text
    opening = started.json()["question"]
    client.post(f"/api/sessions/{session_id}/answer", json={"answer": "I built a billing API in FastAPI."}, headers=me)

    live = client.get(live_url, headers=_auth(admin["token"])).json()
    assert live["status"] == "in_progress" and live["active_section"] == "fundamentals"
    first, pending = live["transcript"]
    assert first["question"] == opening and first["answer"] == "I built a billing API in FastAPI." and first["score"] == 80
    assert pending["answer"] is None
    assert live["progress"]["question_number"] == 2

    assert client.get(live_url, headers=me).status_code == 403
    assert client.get(live_url, headers=_auth(_register("admin", "test-admin-code")["token"])).status_code == 404
    assert client.get(f"/api/admin/interviews/{posting['id']}/attempts/not-a-session/live", headers=_auth(admin["token"])).status_code == 404
