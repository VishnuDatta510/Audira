from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from app.services.code_runner.languages import Language


class RunnerUnavailable(RuntimeError):
    """No executor can run the requested language in this deployment."""


@dataclass
class Execution:
    stdout: str
    stderr: str
    exit_code: int | None
    duration_ms: int
    timed_out: bool = False


@dataclass
class BatchResult:
    executions: list[Execution] = field(default_factory=list)
    compile_error: str | None = None


class Executor(Protocol):
    name: str

    def run_batch(self, language: Language, code: str, stdins: list[str], time_limit_s: float) -> BatchResult: ...
