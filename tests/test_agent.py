import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.problems import PROBLEMS
from app.services.agent import AgentUnavailable, agent
from app.services.assessment import evaluate_dsa_submission
from app.services.session_store import store
from tests.test_api import PAYLOAD

client = TestClient(app)
PROFILE = {"role": "Engineer", "job_description": "Build APIs.", "resume": "Built APIs.", "preparation_goal": "Practice.", "difficulty": "medium"}


def replies(monkeypatch, *texts):
    queue = list(texts)
    monkeypatch.setattr(agent, "_chat", lambda *args: queue.pop(0))
    return queue


def test_json_inside_a_code_fence_is_parsed(monkeypatch):
    replies(monkeypatch, 'Sure!\n```json\n{"score": "88", "strength": "a", "improvement": "b"}\n```')
    assert agent.critique("Q?", "A", PROFILE)["score"] == 88


def test_bad_reply_is_retried_once(monkeypatch):
    left = replies(monkeypatch, "not json", '{"questions": ["1. What did you build first?", "Why that stack over others?"]}')
    assert agent.project_questions(PROFILE, 2) == ["What did you build first?", "Why that stack over others?"]
    assert left == []


def test_two_bad_replies_raise(monkeypatch):
    replies(monkeypatch, "nope", '{"score": "high"}')
    with pytest.raises(AgentUnavailable):
        agent.critique("Q?", "A", PROFILE)


def test_scores_are_clamped(monkeypatch):
    replies(monkeypatch, '{"score": 140, "strength": "a", "improvement": "b"}')
    assert agent.critique("Q?", "A", PROFILE)["score"] == 100


def test_brief_accepts_a_sentence_where_a_list_was_asked(monkeypatch):
    replies(monkeypatch, '{"summary": "Fits well.", "key_requirements": "Python APIs", "resume_highlights": [], "gaps_to_probe": null}')
    brief = agent.read_profile(PROFILE)
    assert brief["key_requirements"] == ["Python APIs"] and brief["gaps_to_probe"] == []


def test_missing_api_key_is_a_clear_503(monkeypatch):
    def unavailable(*args):
        raise AgentUnavailable("HUGGINGFACE_API_KEY is not set")

    monkeypatch.setattr(agent, "_chat", unavailable)
    response = client.post("/api/sessions", json=PAYLOAD)
    assert response.status_code == 503
    assert "HUGGINGFACE_API_KEY" in response.json()["detail"]


def test_session_stores_the_agent_brief():
    session_id = client.post("/api/sessions", json=PAYLOAD).json()["session_id"]
    assert store.get(session_id).profile["agent_brief"]["summary"]


def test_report_is_written_once_until_something_changes(monkeypatch):
    session_id = client.post("/api/sessions", json=PAYLOAD).json()["session_id"]
    client.post(f"/api/sessions/{session_id}/answer", json={"answer": "An answer."})
    calls = []
    original = agent._chat
    monkeypatch.setattr(agent, "_chat", lambda *args: calls.append(args[1]) or original(*args))
    client.get(f"/api/sessions/{session_id}/report")
    client.get(f"/api/sessions/{session_id}/report")
    assert len(calls) == 1
    client.post(f"/api/sessions/{session_id}/answer", json={"answer": "Another answer."})
    client.get(f"/api/sessions/{session_id}/report")
    assert len(calls) == 3


def test_empty_report_does_not_call_the_agent(monkeypatch):
    session_id = client.post("/api/sessions", json=PAYLOAD).json()["session_id"]
    monkeypatch.setattr(agent, "_chat", lambda *args: pytest.fail("agent should not be called"))
    assert client.get(f"/api/sessions/{session_id}/report").json()["overall_score"] == 0


def test_coding_review_falls_back_when_agent_is_down(monkeypatch):
    def unavailable(*args):
        raise AgentUnavailable("down")

    monkeypatch.setattr(agent, "_chat", unavailable)
    problem = PROBLEMS["two-sum"]
    judged = {"passed": 7, "total": 7, "all_passed": True, "compile_error": None, "results": []}
    evaluation = evaluate_dsa_submission("seen = {}\nfor i in range(3): pass", problem, judged, "python")
    assert evaluation["reviewer"] == "heuristic" and evaluation["score"] == 100


def test_coding_review_uses_the_agent():
    problem = PROBLEMS["two-sum"]
    judged = {"passed": 5, "total": 7, "all_passed": False, "compile_error": None, "results": [{"status": "wrong_answer", "passed": False}]}
    evaluation = evaluate_dsa_submission("code", problem, judged, "python")
    assert evaluation["reviewer"] == "agent" and evaluation["likely_approach"] == "hash map"
    assert evaluation["score"] == round(5 / 7 * 85) + 5
