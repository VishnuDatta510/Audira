"""Runs code on Judge0 (https://judge0.com), the sandboxed judge for every language.

JUDGE0_URL defaults to the free public instance, https://ce.judge0.com, which needs
no key. For a RapidAPI subscription set JUDGE0_URL=https://judge0-ce.p.rapidapi.com
and JUDGE0_API_KEY; a self-hosted instance takes its X-Auth-Token as JUDGE0_API_KEY.
"""
from __future__ import annotations

import base64
import json
import time
import urllib.error
import urllib.parse
import urllib.request

from app.core.config import settings
from app.services.code_runner.languages import Language
from app.services.code_runner.models import BatchResult, Execution, RunnerUnavailable

BATCH_LIMIT = 20
POLL_DEADLINE_SECONDS = 90.0
# Judge0 counts interpreter/VM startup as CPU time, which reaches ~2 s when the public
# instance is busy. The allowance keeps correct code from timing out; limits are Judge0's maximums.
STARTUP_ALLOWANCE_SECONDS = 3.0
MAX_CPU_SECONDS, MAX_WALL_SECONDS = 15.0, 20.0
_FIELDS = "token,stdout,stderr,compile_output,message,status,time,exit_code"

IN_QUEUE, PROCESSING, ACCEPTED, TIME_LIMIT, COMPILE_ERROR, INTERNAL_ERROR = 1, 2, 3, 5, 6, 13


def _encode(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def _decode(value: str | None) -> str:
    if not value:
        return ""
    text = base64.b64decode(value).decode("utf-8", errors="replace")
    limit = settings.code_max_output_chars
    return text if len(text) <= limit else text[:limit] + "\n… output truncated"


class Judge0Executor:
    name = "judge0"

    def __init__(self, base_url: str, api_key: str | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "build-n-pray/1.0"}
        if self.api_key:
            host = urllib.parse.urlparse(self.base_url).hostname or ""
            if host.endswith("rapidapi.com"):
                headers.update({"X-RapidAPI-Key": self.api_key, "X-RapidAPI-Host": host})
            else:
                headers["X-Auth-Token"] = self.api_key
        return headers

    def _request(self, path: str, payload: dict | None = None) -> dict | list:
        data = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(f"{self.base_url}{path}", data=data, headers=self._headers(), method="POST" if data else "GET")
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:300]
            if exc.code == 429:
                raise RunnerUnavailable("Judge0 rate limit reached. Wait a few seconds and try again, or set JUDGE0_API_KEY for a paid plan.") from exc
            if exc.code in (401, 403):
                raise RunnerUnavailable(f"Judge0 refused the request ({exc.code}). Check JUDGE0_URL and JUDGE0_API_KEY. {detail}") from exc
            raise RunnerUnavailable(f"Judge0 returned {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            reason = getattr(exc, "reason", exc)
            raise RunnerUnavailable(f"Judge0 is unreachable at {self.base_url}: {reason}") from exc

    def _submit(self, language: Language, code: str, stdins: list[str], time_limit_s: float) -> list[str]:
        base = {
            "language_id": language.judge0_id,
            "source_code": _encode(code),
            "cpu_time_limit": round(min(time_limit_s + STARTUP_ALLOWANCE_SECONDS, MAX_CPU_SECONDS), 2),
            "wall_time_limit": round(min((time_limit_s + STARTUP_ALLOWANCE_SECONDS) * 2, MAX_WALL_SECONDS), 2),
        }
        if language.judge0_compiler_options:
            base["compiler_options"] = language.judge0_compiler_options
        submissions = [{**base, "stdin": _encode(stdin)} for stdin in stdins]
        created = self._request("/submissions/batch?base64_encoded=true", {"submissions": submissions})
        tokens = [item.get("token") for item in created]
        if not all(tokens):
            errors = [item for item in created if not item.get("token")]
            raise RunnerUnavailable(f"Judge0 did not accept the submission: {json.dumps(errors)[:300]}")
        return tokens

    def _wait(self, tokens: list[str]) -> list[dict]:
        deadline = time.monotonic() + POLL_DEADLINE_SECONDS
        delay = 0.4
        while True:
            response = self._request(f"/submissions/batch?base64_encoded=true&fields={_FIELDS}&tokens={','.join(tokens)}")
            results = response.get("submissions", [])
            if results and all(r and r["status"]["id"] not in (IN_QUEUE, PROCESSING) for r in results):
                return results
            if time.monotonic() > deadline:
                raise RunnerUnavailable("Judge0 did not finish within 90 seconds. Try again in a moment.")
            time.sleep(delay)
            delay = min(delay * 1.5, 2.0)

    def run_batch(self, language: Language, code: str, stdins: list[str], time_limit_s: float) -> BatchResult:
        results: list[dict] = []
        for start in range(0, len(stdins), BATCH_LIMIT):
            results.extend(self._wait(self._submit(language, code, stdins[start:start + BATCH_LIMIT], time_limit_s)))
        executions = []
        for result in results:
            status = result["status"]["id"]
            if status == COMPILE_ERROR:
                return BatchResult(compile_error=_decode(result.get("compile_output")).strip() or "Compilation failed.")
            if status == INTERNAL_ERROR:
                raise RunnerUnavailable(f"Judge0 had an internal error: {_decode(result.get('message')) or result['status']['description']}")
            stderr = _decode(result.get("stderr"))
            exit_code = 0 if status == ACCEPTED else result.get("exit_code")
            if status not in (ACCEPTED, TIME_LIMIT):
                exit_code = exit_code or 1
                stderr = stderr or _decode(result.get("message")) or result["status"]["description"]
            executions.append(Execution(
                stdout=_decode(result.get("stdout")),
                stderr=stderr,
                exit_code=None if status == TIME_LIMIT else exit_code,
                duration_ms=int(float(result.get("time") or 0) * 1000),
                timed_out=status == TIME_LIMIT,
            ))
        return BatchResult(executions=executions)
