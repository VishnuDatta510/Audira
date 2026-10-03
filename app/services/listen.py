"""Bridge one browser microphone socket to Cartesia Ink.

The browser never sees the API key. A pause finalizes a Cartesia turn and the
socket stays open. The candidate's stop message is what ends listening.
"""

import asyncio
import json
import logging
from urllib.parse import urlencode

import websockets
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect, WebSocketState

from app.core.config import settings
from app.services.ink import SpokenTranscript
from app.services.session_store import store

logger = logging.getLogger(__name__)

CARTESIA_LISTEN_URL = "wss://api.cartesia.ai/stt/turns/websocket"
CARTESIA_STT_MODEL = "ink-2"
CARTESIA_STT_VERSION = "2026-08-14"
CARTESIA_SAMPLE_RATE = "16000"

SESSION_MISSING = "This interview could not be found. Reload and try again."
DISQUALIFIED = "Session has been disqualified after the warning limit was reached"
CODING_ROUND = "The coding round stays on screen and is not spoken"
KEY_MISSING = "Voice answers need a Cartesia key. You can still type."
LISTEN_FAILED = "Listening failed. Try again, or type your answer."
UNREACHABLE = "Could not reach the listener. Try again, or type your answer."


def cartesia_listen_url() -> str:
    query = urlencode(
        {
            "model": CARTESIA_STT_MODEL,
            "encoding": "pcm_s16le",
            "sample_rate": CARTESIA_SAMPLE_RATE,
            "cartesia_version": CARTESIA_STT_VERSION,
        }
    )
    return f"{CARTESIA_LISTEN_URL}?{query}"


def listen_block(session_id: str) -> str | None:
    """Why this session cannot be transcribed, or None when listening may start."""
    session = store.get(session_id)
    if session is None:
        return SESSION_MISSING
    if session.disqualified:
        return DISQUALIFIED
    if session.active_section == "dsa":
        return CODING_ROUND
    if not settings.cartesia_api_key.strip():
        return KEY_MISSING
    return None


async def connect_cartesia(key: str):
    return await websockets.connect(
        cartesia_listen_url(),
        additional_headers={
            "Authorization": f"Bearer {key}",
            "Cartesia-Version": CARTESIA_STT_VERSION,
        },
        open_timeout=10,
    )


def _is_stop(text: str) -> bool:
    try:
        body = json.loads(text)
    except json.JSONDecodeError:
        return False
    return isinstance(body, dict) and body.get("type") == "stop"


def _decode(raw: object) -> str | None:
    if isinstance(raw, str):
        return raw
    if isinstance(raw, (bytes, bytearray)):
        return bytes(raw).decode("utf-8", errors="replace")
    return None


async def _send(websocket: WebSocket, payload: dict, lock: asyncio.Lock) -> None:
    async with lock:
        await _send_unlocked(websocket, payload)


async def _emit(websocket: WebSocket, payload: dict, lock: asyncio.Lock, stop: asyncio.Event, *, terminal: bool) -> None:
    """Send one client event. A terminal event wins the race against a later partial."""
    async with lock:
        if stop.is_set():
            return
        if terminal:
            stop.set()
        await _send_unlocked(websocket, payload)


async def _send_unlocked(websocket: WebSocket, payload: dict) -> None:
    if websocket.client_state != WebSocketState.CONNECTED:
        return
    try:
        await websocket.send_json(payload)
    except RuntimeError:
        return


async def _close_upstream(upstream) -> None:
    close = getattr(upstream, "close", None)
    if close is None:
        return
    try:
        result = close()
        if asyncio.iscoroutine(result):
            await result
    except Exception:
        logger.warning("cartesia listen socket close failed", exc_info=True)


async def bridge_listen(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()
    lock = asyncio.Lock()
    blocked = listen_block(session_id)
    if blocked:
        await _send(websocket, {"type": "error", "message": blocked}, lock)
        await _close_client(websocket)
        return

    try:
        upstream = await connect_cartesia(settings.cartesia_api_key.strip())
    except Exception:
        logger.warning("cartesia listen connect failed", exc_info=True)
        await _send(websocket, {"type": "error", "message": UNREACHABLE}, lock)
        await _close_client(websocket)
        return

    transcript = SpokenTranscript()
    stop = asyncio.Event()

    async def from_cartesia() -> None:
        try:
            async for raw in upstream:
                if stop.is_set():
                    return
                decoded = _decode(raw)
                if decoded is None:
                    continue
                try:
                    message = json.loads(decoded)
                except json.JSONDecodeError:
                    continue
                if isinstance(message, dict) and message.get("type") == "error":
                    logger.warning("cartesia listen error message=%s", message.get("message"))
                    await _emit(websocket, {"type": "error", "message": LISTEN_FAILED}, lock, stop, terminal=True)
                    return
                shown = transcript.apply(message)
                if shown is not None:
                    await _emit(websocket, {"type": "partial", "text": shown}, lock, stop, terminal=False)
            await _emit(websocket, {"type": "error", "message": UNREACHABLE}, lock, stop, terminal=True)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("cartesia listen socket failed", exc_info=True)
            await _emit(websocket, {"type": "error", "message": UNREACHABLE}, lock, stop, terminal=True)

    async def from_client() -> None:
        try:
            while not stop.is_set():
                incoming = await websocket.receive()
                if incoming["type"] == "websocket.disconnect":
                    stop.set()
                    return
                data = incoming.get("bytes")
                if data:
                    await upstream.send(data)
                    continue
                text = incoming.get("text")
                if isinstance(text, str) and _is_stop(text):
                    await _emit(websocket, {"type": "final", "text": transcript.text()}, lock, stop, terminal=True)
                    return
        except WebSocketDisconnect:
            stop.set()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("answer listen client failed", exc_info=True)
            await _emit(websocket, {"type": "error", "message": UNREACHABLE}, lock, stop, terminal=True)

    await _send(websocket, {"type": "ready"}, lock)
    upstream_task = asyncio.create_task(from_cartesia())
    client_task = asyncio.create_task(from_client())
    try:
        await asyncio.wait({upstream_task, client_task}, return_when=asyncio.FIRST_COMPLETED)
    finally:
        stop.set()
        await _close_upstream(upstream)
        upstream_task.cancel()
        client_task.cancel()
        await asyncio.gather(upstream_task, client_task, return_exceptions=True)
        await _close_client(websocket)


async def _close_client(websocket: WebSocket) -> None:
    if websocket.client_state != WebSocketState.CONNECTED:
        return
    try:
        await websocket.close()
    except RuntimeError:
        return
