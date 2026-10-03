from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.services import agent as agent_module
from app.services.agent import AgentUnavailable, InterviewAgent


class FakeClient:
    """Stands in for InferenceClient: replies with its name, or raises the queued errors first."""

    def __init__(self, name: str, errors: list[str] | None = None, content: str | None = None, reasoning: str | None = None) -> None:
        self.name = name
        self.errors = list(errors or [])
        self.content = content
        self.reasoning = reasoning
        self.calls = 0
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **_kwargs):
        self.calls += 1
        if self.errors:
            raise RuntimeError(self.errors.pop(0))
        text = f"answer from {self.name}" if self.content is None else self.content
        message = SimpleNamespace(content=text, reasoning=self.reasoning)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


def _agent(monkeypatch, *clients: FakeClient) -> InterviewAgent:
    fresh = InterviewAgent()
    monkeypatch.setattr(fresh, "_providers", lambda: [(c.name, f"{c.name}-model", c) for c in clients])
    return fresh


def _ask(agent: InterviewAgent) -> str:
    return agent._chat("system", "user", 10, 0.0)


def test_first_provider_answers_when_it_works(monkeypatch):
    qwen, gemini = FakeClient("huggingface"), FakeClient("gemini")
    agent = _agent(monkeypatch, qwen, gemini)
    assert _ask(agent) == "answer from huggingface"
    assert gemini.calls == 0 and agent.model == "huggingface-model"


def test_falls_through_in_priority_order_and_benches_the_failure(monkeypatch):
    qwen = FakeClient("huggingface", ["402 Payment Required: depleted your monthly included credits"])
    gemini = FakeClient("gemini", ["500 Internal Server Error"])
    groq = FakeClient("groq")
    agent = _agent(monkeypatch, qwen, gemini, groq)
    assert _ask(agent) == "answer from groq"
    assert agent.model == "groq-model"
    assert _ask(agent) == "answer from groq"
    assert (qwen.calls, gemini.calls, groq.calls) == (1, 1, 2)


def test_benched_provider_comes_back_after_its_time(monkeypatch):
    qwen = FakeClient("huggingface", ["402 Payment Required"])
    gemini = FakeClient("gemini")
    agent = _agent(monkeypatch, qwen, gemini)
    assert _ask(agent) == "answer from gemini"
    agent._benched_until["huggingface"] = 0.0
    assert _ask(agent) == "answer from huggingface"


def test_waits_out_a_short_rate_limit_when_everyone_is_limited(monkeypatch):
    sleeps: list[float] = []
    monkeypatch.setattr(agent_module.time, "sleep", sleeps.append)
    limited = "429 Too Many Requests. Please try again in 2s."
    gemini = FakeClient("gemini", [limited])
    groq = FakeClient("groq", [limited])
    agent = _agent(monkeypatch, gemini, groq)
    monkeypatch.setattr(agent_module.time, "monotonic", lambda: 1000.0 + len(sleeps) * 10)
    assert _ask(agent) == "answer from gemini"
    assert sleeps == [2.5]


def test_require_json_skips_prose_and_reads_reasoning(monkeypatch):
    prose = FakeClient("gemini", content="Here is the problem, described in sentences.")
    reasoned = FakeClient("groq", content="", reasoning='{"title": "Pair"}')
    agent = _agent(monkeypatch, prose, reasoned)
    assert agent._chat("system", "user", 10, 0.0, require_json=True) == '{"title": "Pair"}'
    assert prose.calls == 1 and reasoned.calls == 1 and agent.model == "groq-model"


def test_every_provider_failing_is_unavailable(monkeypatch):
    agent = _agent(monkeypatch, FakeClient("gemini", ["401 Unauthorized"]), FakeClient("groq", ["404 model_not_found"]))
    with pytest.raises(AgentUnavailable, match="gemini .*401.*groq .*404"):
        _ask(agent)


def test_provider_order_and_missing_keys_come_from_settings(monkeypatch):
    monkeypatch.setattr(settings, "agent_providers", "groq, gemini, huggingface")
    monkeypatch.setattr(settings, "groq_api_key", "g")
    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr(settings, "huggingface_api_key", "h")
    assert [name for name, _, _ in InterviewAgent()._providers()] == ["groq", "huggingface"]
