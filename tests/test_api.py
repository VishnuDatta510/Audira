from fastapi.testclient import TestClient
from app.main import app
from tests import solutions

client = TestClient(app)
PAYLOAD = {"candidate_name": "Ada", "role": "Engineer", "job_description": "Build Python API services and collaborate with a team.", "resume": "Built two Python web projects.", "preparation_goal": "Practice concise answers.", "difficulty": "medium"}


def test_health_reports_storage():
    response = client.get("/health")
    body = response.json()
    assert body["mongodb"] in {"connected", "memory", "unavailable"}
    assert body["ok"] is (body["mongodb"] != "unavailable")
    assert response.status_code == (200 if body["ok"] else 503)


def test_full_interview_flow():
    started = client.post("/api/sessions", json=PAYLOAD)
    assert started.status_code == 200
    session_id = started.json()["session_id"]
    answer = client.post(f"/api/sessions/{session_id}/answer", json={"answer": "I built an API and improved response time."})
    assert answer.status_code == 200
    dsa = client.post(f"/api/sessions/{session_id}/dsa/start", json={"difficulty": "easy", "duration_minutes": 5})
    assert dsa.status_code == 200
    assert dsa.json()["problem"]["slug"] == "two-sum"
    submitted = client.post(f"/api/sessions/{session_id}/dsa/submit", json={"code": solutions.PYTHON["two-sum"], "language": "python"})
    assert submitted.status_code == 200
    assert submitted.json()["all_passed"] is True
    report = client.get(f"/api/sessions/{session_id}/report")
    assert report.status_code == 200
    body = report.json()
    assert body["dsa_result"]["submitted"] is True
    assert body["summary"].startswith("The candidate") and body["gaps"] and body["follow_up_questions"]
    assert "next_steps" not in body
    assert body["overall_score"] == body["round_scores"]["dsa"] == submitted.json()["evaluation"]["score"]


def test_sections_track_progress_and_resume():
    session_id = client.post("/api/sessions", json=PAYLOAD).json()["session_id"]
    summary = client.get(f"/api/sessions/{session_id}").json()
    assert summary["sections"] == {"dsa": "not_started", "project": "not_started", "fundamentals": "not_started"}

    first = client.post(f"/api/sessions/{session_id}/section", json={"section": "fundamentals"}).json()
    client.post(f"/api/sessions/{session_id}/answer", json={"answer": "A process has its own memory; threads share it."})
    resumed = client.post(f"/api/sessions/{session_id}/section", json={"section": "fundamentals"}).json()
    assert resumed["question_number"] == 2 and resumed["question"] != first["question"]

    while True:
        result = client.post(f"/api/sessions/{session_id}/answer", json={"answer": "A detailed answer."}).json()
        if result["complete"]:
            break
    summary = client.get(f"/api/sessions/{session_id}").json()
    assert summary["sections"]["fundamentals"] == "completed"
    assert "fundamentals" in summary["round_scores"]

    assert client.post(f"/api/sessions/{session_id}/sections/project/skip").json()["sections"]["project"] == "skipped"


def test_dsa_start_resumes_same_problem_and_timer():
    session_id = client.post("/api/sessions", json=PAYLOAD).json()["session_id"]
    first = client.post(f"/api/sessions/{session_id}/dsa/start", json={}).json()
    again = client.post(f"/api/sessions/{session_id}/dsa/start", json={}).json()
    assert first["problem_slug"] == again["problem_slug"] == "longest-substring-without-repeating-characters"
    assert again["ends_in_seconds"] <= first["ends_in_seconds"]


def test_document_extraction():
    response = client.post("/api/documents/extract", files={"file": ("resume.txt", b"Built a React task manager.", "text/plain")})
    assert response.status_code == 200
    assert response.json()["text"] == "Built a React task manager."
