"""Runs code with toolchains installed on this machine (CODE_RUNNER=local).

This is an offline development convenience, not a sandbox: candidate code runs
with the server's permissions. The default runner is Judge0.
"""
from __future__ import annotations

import os
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app.core.config import settings
from app.services.code_runner.languages import Language, python_executable
from app.services.code_runner.models import BatchResult, Execution

_CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def _truncate(text: str) -> str:
    limit = settings.code_max_output_chars
    return text if len(text) <= limit else text[:limit] + "\n… output truncated"


def _expand(command: tuple[str, ...], directory: Path, file: Path) -> list[str]:
    values = {"{dir}": str(directory), "{file}": str(file), "{python}": python_executable()}
    expanded = []
    for part in command:
        for key, value in values.items():
            part = part.replace(key, value)
        expanded.append(part)
    return expanded


def _execute(command: list[str], cwd: Path, stdin: str, timeout: float) -> Execution:
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1"}
    started = time.perf_counter()
    try:
        completed = subprocess.run(
            command, cwd=cwd, input=stdin, capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=timeout, env=env, creationflags=_CREATE_NO_WINDOW,
        )
    except subprocess.TimeoutExpired as exc:
        elapsed = int((time.perf_counter() - started) * 1000)
        stdout = exc.stdout.decode(errors="replace") if isinstance(exc.stdout, bytes) else exc.stdout or ""
        return Execution(_truncate(stdout), "", None, elapsed, timed_out=True)
    except FileNotFoundError as exc:
        return Execution("", f"Toolchain not found: {exc.filename}", 127, 0)
    elapsed = int((time.perf_counter() - started) * 1000)
    return Execution(_truncate(completed.stdout), _truncate(completed.stderr), completed.returncode, elapsed)


class LocalExecutor:
    name = "local"

    def run_batch(self, language: Language, code: str, stdins: list[str], time_limit_s: float) -> BatchResult:
        if language.run is None:
            raise ValueError(f"{language.label} has no local run command")
        with tempfile.TemporaryDirectory(prefix="bnb-run-") as tmp:
            directory = Path(tmp)
            source = directory / language.file_name
            source.write_text(code, encoding="utf-8")
            if language.compile:
                compiled = _execute(_expand(language.compile, directory, source), directory, "", settings.code_compile_timeout_seconds)
                if compiled.timed_out:
                    return BatchResult(compile_error="Compilation timed out.")
                if compiled.exit_code != 0:
                    message = (compiled.stderr or compiled.stdout).replace(str(directory) + os.sep, "")
                    return BatchResult(compile_error=message.strip() or "Compilation failed.")
            command = _expand(language.run, directory, source)
            with ThreadPoolExecutor(max_workers=settings.code_parallel_tests) as pool:
                executions = list(pool.map(lambda stdin: _execute(command, directory, stdin, time_limit_s), stdins))
        for execution in executions:
            execution.stderr = execution.stderr.replace(str(directory) + os.sep, "")
        return BatchResult(executions=executions)
