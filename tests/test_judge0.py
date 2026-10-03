import base64

import pytest

from app.core.config import settings
from app.services.code_runner import LANGUAGES, RunnerUnavailable, language_catalog
from app.services.code_runner.judge0 import Judge0Executor


def b64(text: str) -> str:
    return base64.b64encode(text.encode()).decode()


class FakeJudge0(Judge0Executor):
    """Answers each submission with the next scripted result; the first poll is still processing."""

    def __init__(self, results: list[dict], **kwargs):
        super().__init__("https://ce.judge0.com", **kwargs)
        self.results = results
        self.submitted: list[dict] = []
        self.polls = 0

    def _request(self, path, payload=None):
        if payload is not None:
            start = len(self.submitted)
            self.submitted.extend(payload["submissions"])
            return [{"token": f"t{start + i}"} for i in range(len(payload["submissions"]))]
        self.polls += 1
        tokens = path.split("tokens=")[1].split(",")
        if self.polls == 1:
            return {"submissions": [{"status": {"id": 2, "description": "Processing"}} for _ in tokens]}
        return {"submissions": [self.results[int(t[1:])] for t in tokens]}


@pytest.fixture(autouse=True)
def fast_polls(monkeypatch):
    monkeypatch.setattr("app.services.code_runner.judge0.time.sleep", lambda _: None)


def accepted(stdout: str) -> dict:
    return {"status": {"id": 3, "description": "Accepted"}, "stdout": b64(stdout), "time": "0.012", "exit_code": 0}


def test_accepted_output_is_decoded_and_stdin_encoded():
    fake = FakeJudge0([accepted("✓ 42\n")])
    batch = fake.run_batch(LANGUAGES["python"], "print('✓', 42)", ["héllo\n"], 2.0)
    assert batch.executions[0].stdout == "✓ 42\n" and batch.executions[0].exit_code == 0
    assert batch.executions[0].duration_ms == 12
    sent = fake.submitted[0]
    assert sent["language_id"] == 109 and base64.b64decode(sent["stdin"]).decode() == "héllo\n"
    assert sent["cpu_time_limit"] == 5.0 and sent["wall_time_limit"] == 10.0 and "compiler_options" not in sent


def test_typescript_gets_a_modern_target():
    fake = FakeJudge0([accepted("")])
    fake.run_batch(LANGUAGES["typescript"], "console.log(1)", [""], 2.0)
    assert fake.submitted[0]["compiler_options"] == "--target es2020"


def test_statuses_map_to_the_judge_model():
    fake = FakeJudge0([
        {"status": {"id": 5, "description": "Time Limit Exceeded"}, "stdout": None, "time": "2.0"},
        {"status": {"id": 11, "description": "Runtime Error (NZEC)"}, "stderr": b64("Traceback"), "exit_code": 1, "time": "0.01"},
        {"status": {"id": 7, "description": "Runtime Error (SIGSEGV)"}, "time": "0.01"},
    ])
    tle, nzec, segv = fake.run_batch(LANGUAGES["python"], "x", ["", "", ""], 2.0).executions
    assert tle.timed_out and tle.exit_code is None
    assert nzec.exit_code == 1 and nzec.stderr == "Traceback"
    assert segv.exit_code == 1 and "SIGSEGV" in segv.stderr


def test_compile_error_stops_the_batch():
    fake = FakeJudge0([accepted(""), {"status": {"id": 6, "description": "Compilation Error"}, "compile_output": b64("Main.java:1: error")}])
    batch = fake.run_batch(LANGUAGES["java"], "broken", ["", ""], 2.0)
    assert batch.compile_error == "Main.java:1: error" and batch.executions == []


def test_internal_error_means_runner_unavailable():
    fake = FakeJudge0([{"status": {"id": 13, "description": "Internal Error"}}])
    with pytest.raises(RunnerUnavailable):
        fake.run_batch(LANGUAGES["python"], "x", [""], 2.0)


def test_more_than_twenty_tests_are_sent_in_chunks():
    fake = FakeJudge0([accepted(str(i)) for i in range(25)])
    batch = fake.run_batch(LANGUAGES["python"], "x", [""] * 25, 2.0)
    assert [e.stdout for e in batch.executions] == [str(i) for i in range(25)]


def test_auth_headers():
    assert "X-Auth-Token" not in Judge0Executor("https://ce.judge0.com")._headers()
    assert Judge0Executor("http://localhost:2358", "secret")._headers()["X-Auth-Token"] == "secret"
    rapid = Judge0Executor("https://judge0-ce.p.rapidapi.com", "key")._headers()
    assert rapid["X-RapidAPI-Key"] == "key" and rapid["X-RapidAPI-Host"] == "judge0-ce.p.rapidapi.com"


def test_every_language_is_runnable_on_judge0(monkeypatch):
    monkeypatch.setattr(settings, "code_runner", "judge0")
    catalog = language_catalog()
    assert all(lang["runnable"] and lang["runner"] == "judge0" for lang in catalog)
