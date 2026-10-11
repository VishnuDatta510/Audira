"""The persona eval runs end to end against the offline fake agent."""
from fastapi.testclient import TestClient

from app.main import app
from app.services.agent import agent
from app.services.repository import repository
from evals import run_personas
from tests.conftest import scripted_reply


def test_persona_interview_produces_scores_and_a_summary(monkeypatch):
    def fake_chat(system: str, user: str, *args, **kwargs) -> str:
        if system in run_personas.PERSONAS.values():
            return "We batched the reconciliation queries with COPY into a staging table, which took the run from four hours to twenty minutes."
        return scripted_reply(system, user, *args, **kwargs)

    monkeypatch.setattr(agent, "_chat", fake_chat)
    monkeypatch.setattr(repository, "db", None)
    result = run_personas.interview(TestClient(app), "strong")

    assert result["overall"] > 0 and all(result["rounds"].values())
    assert result["turns"] == len(result["latencies"]) and result["follow_ups"] >= 1
    assert result["gaps"]
    table = run_personas.markdown([result, {**result, "persona": "bluffer"}], None, "fake")
    assert "| strong | **" in table and "Median interviewer turn" in table and "> " in table
