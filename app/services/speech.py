import json
import logging
import threading
import urllib.error
import urllib.request
from collections import OrderedDict

from app.core.config import settings

logger = logging.getLogger(__name__)

# Same Sonic setup as the AI Interview app. These are voice ids, not secrets.
CARTESIA_BYTES_URL = "https://api.cartesia.ai/tts/bytes"
CARTESIA_MODEL = "sonic-3.5"
CARTESIA_VERSION = "2026-08-14"
CARTESIA_VOICE_ID = "47c38ca4-5f35-497b-b1a3-415245fb35e1"
CARTESIA_TIMEOUT_SECONDS = 10
CACHE_LIMIT = 40

_cache: OrderedDict[str, bytes] = OrderedDict()
_lock = threading.Lock()


def clear_cache() -> None:
    with _lock:
        _cache.clear()


def cartesia_speech(text: str) -> bytes | None:
    """Synthesize one interview question. Returns WAV bytes, or None when voice is unavailable."""
    key = settings.cartesia_api_key.strip()
    if not key:
        logger.warning("CARTESIA_API_KEY is empty; question audio was not synthesized")
        return None

    transcript = " ".join(text.split())
    if not transcript:
        return None

    cache_key = f"{CARTESIA_VOICE_ID}:{transcript}"
    with _lock:
        cached = _cache.get(cache_key)
        if cached is not None:
            _cache.move_to_end(cache_key)
            return cached

    audio = _request_wav(transcript, key)
    if audio is None:
        return None

    with _lock:
        _cache[cache_key] = audio
        _cache.move_to_end(cache_key)
        while len(_cache) > CACHE_LIMIT:
            _cache.popitem(last=False)
    return audio


def _request_wav(transcript: str, key: str) -> bytes | None:
    payload = {
        "model_id": CARTESIA_MODEL,
        "transcript": transcript,
        "voice": CARTESIA_VOICE_ID,
        "language": "en",
        "output_format": {"container": "wav", "encoding": "pcm_s16le", "sample_rate": 44100},
    }
    request = urllib.request.Request(
        CARTESIA_BYTES_URL,
        data=json.dumps(payload).encode(),
        headers={
            "content-type": "application/json",
            "x-api-key": key,
            "cartesia-version": CARTESIA_VERSION,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=CARTESIA_TIMEOUT_SECONDS) as response:
            audio = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read(300).decode("utf-8", errors="replace")
        logger.warning("cartesia speech failed status=%s body=%s", exc.code, detail)
        return None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        logger.warning("cartesia speech failed error=%s", exc)
        return None

    if not audio.startswith(b"RIFF"):
        logger.warning("cartesia speech returned a non-wav body")
        return None
    return audio
