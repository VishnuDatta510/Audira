import asyncio
import json
import queue

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.ink import SpokenTranscript
from app.services.listen import CODING_ROUND, DISQUALIFIED, KEY_MISSING, LISTEN_FAILED, SESSION_MISSING, cartesia_listen_url
from app.services.session_store import store

client = TestClient(app)
PAYLOAD = {
    "candidate_name": "Ada",
    "role": "Engineer",
    "job_description": "Build Python API services and collaborate with a team.",
    "resume": "Built two Python web projects.",
    "preparation_goal": "Practice concise answers.",
    "difficulty": "medium",
}


class FakeUpstream:
    def __init__(self) -> None:
        self.sent: list[bytes | str] = []
        self.closed = False
        self._queue: queue.Queue[str | None] = queue.Queue()

    async def send(self, data: bytes | str) -> None:
        self.sent.append(data)

    def push(self, payload: dict) -> None:
        self._queue.put(json.dumps(payload))

    def __aiter__(self):
        return self

    async def __anext__(self):
        loop = asyncio.get_running_loop()
        item = await loop.run_in_executor(None, self._queue.get)
        if item is None:
            raise StopAsyncIteration
        return item

    async def close(self) -> None:
        self.closed = True
        self._queue.put(None)


def _session() -> str:
    return client.post("/api/sessions", json=PAYLOAD).json()["session_id"]


def _patch_upstream(monkeypatch) -> dict:
    holder: dict[str, FakeUpstream] = {}

    async def connect(key: str) -> FakeUpstream:
        assert key == "test-key"
        upstream = FakeUpstream()
        holder["up"] = upstream
        return upstream

    monkeypatch.setattr("app.services.listen.connect_cartesia", connect)
    monkeypatch.setattr(settings, "cartesia_api_key", "test-key")
    return holder


def test_transcript_keeps_cartesia_spacing_across_turns():
    spoken = SpokenTranscript()
    assert spoken.apply({"type": "turn.update", "transcript": "I would"}) == "I would"
    assert spoken.apply({"type": "turn.eager_end", "transcript": "I would check"}) == "I would check"
    assert spoken.apply({"type": "turn.resume"}) is None
    assert spoken.text() == "I would check"
    assert spoken.apply({"type": "turn.end", "transcript": "Hello "}) == "Hello "
    assert spoken.apply({"type": "turn.update", "transcript": "there"}) == "Hello there"
    assert spoken.apply({"type": "turn.end", "transcript": "there."}) == "Hello there."
    assert spoken.apply({"type": "error"}) is None
    assert spoken.text() == "Hello there."


def test_listen_url_targets_ink():
    url = cartesia_listen_url()
    assert url.startswith("wss://api.cartesia.ai/stt/turns/websocket?")
    assert "model=ink-2" in url
    assert "encoding=pcm_s16le" in url
    assert "sample_rate=16000" in url
    assert "cartesia_version=2026-08-14" in url


def test_pause_keeps_the_socket_open_until_stop(monkeypatch):
    holder = _patch_upstream(monkeypatch)
    session_id = _session()
    client.post(f"/api/sessions/{session_id}/section", json={"section": "fundamentals"})

    with client.websocket_connect(f"/api/sessions/{session_id}/listen") as ws:
        assert ws.receive_json() == {"type": "ready"}
        holder["up"].push({"type": "turn.update", "transcript": "I would"})
        assert ws.receive_json() == {"type": "partial", "text": "I would"}
        holder["up"].push({"type": "turn.end", "transcript": "I would check the logs. "})
        assert ws.receive_json() == {"type": "partial", "text": "I would check the logs. "}
        assert holder["up"].closed is False
        holder["up"].push({"type": "turn.update", "transcript": "Then"})
        assert ws.receive_json() == {"type": "partial", "text": "I would check the logs. Then"}
        ws.send_bytes(b"\x01\x02")
        ws.send_text(json.dumps({"type": "stop"}))
        assert ws.receive_json() == {"type": "final", "text": "I would check the logs. Then"}

    assert b"\x01\x02" in holder["up"].sent
    assert holder["up"].closed is True


def test_cartesia_error_closes_without_a_final(monkeypatch):
    holder = _patch_upstream(monkeypatch)
    session_id = _session()
    with client.websocket_connect(f"/api/sessions/{session_id}/listen") as ws:
        assert ws.receive_json()["type"] == "ready"
        holder["up"].push({"type": "error", "message": "bad audio"})
        assert ws.receive_json() == {"type": "error", "message": LISTEN_FAILED}
    assert holder["up"].closed is True


def test_missing_key_does_not_connect(monkeypatch):
    called = {"n": 0}

    async def connect(key: str):
        called["n"] += 1
        raise AssertionError(key)

    monkeypatch.setattr("app.services.listen.connect_cartesia", connect)
    monkeypatch.setattr(settings, "cartesia_api_key", "")
    session_id = _session()
    with client.websocket_connect(f"/api/sessions/{session_id}/listen") as ws:
        assert ws.receive_json() == {"type": "error", "message": KEY_MISSING}
    assert called["n"] == 0


def test_unknown_session_is_rejected(monkeypatch):
    _patch_upstream(monkeypatch)
    with client.websocket_connect("/api/sessions/missing/listen") as ws:
        assert ws.receive_json() == {"type": "error", "message": SESSION_MISSING}


def test_disqualified_session_is_rejected(monkeypatch):
    _patch_upstream(monkeypatch)
    session_id = _session()
    store.get(session_id).disqualified = True
    with client.websocket_connect(f"/api/sessions/{session_id}/listen") as ws:
        assert ws.receive_json() == {"type": "error", "message": DISQUALIFIED}


def test_coding_round_is_not_transcribed(monkeypatch):
    holder = _patch_upstream(monkeypatch)
    session_id = _session()
    started = client.post(f"/api/sessions/{session_id}/dsa/start", json={})
    assert started.status_code == 200
    with client.websocket_connect(f"/api/sessions/{session_id}/listen") as ws:
        assert ws.receive_json() == {"type": "error", "message": CODING_ROUND}
    assert "up" not in holder
