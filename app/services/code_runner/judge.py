"""Runs a submission against test cases and grades each result."""
from __future__ import annotations

from app.core.config import settings
from app.problems.model import Problem, TestCase
from app.services.code_runner.judge0 import Judge0Executor
from app.services.code_runner.languages import LANGUAGES, Language
from app.services.code_runner.local import LocalExecutor
from app.services.code_runner.models import Execution, Executor, RunnerUnavailable

_local = LocalExecutor()


def executor_for(language: Language) -> Executor | None:
    if settings.code_runner == "local":
        return _local if language.local_available() else None
    return Judge0Executor(settings.judge0_url, settings.judge0_api_key)


def language_catalog() -> list[dict]:
    catalog = []
    for language in LANGUAGES.values():
        executor = executor_for(language)
        catalog.append({
            "id": language.id,
            "label": language.label,
            "monaco": language.monaco,
            "runnable": executor is not None,
            "runner": executor.name if executor else None,
        })
    return catalog


def normalize_output(text: str) -> str:
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").split("\n")]
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def _stdin(text: str) -> str:
    return text if text.endswith("\n") else text + "\n"


def _status(execution: Execution, expected: str | None) -> str:
    if execution.timed_out:
        return "time_limit_exceeded"
    if execution.exit_code != 0:
        return "runtime_error"
    if expected is None:
        return "finished"
    return "accepted" if normalize_output(execution.stdout) == normalize_output(expected) else "wrong_answer"


def _resolve(language_id: str) -> tuple[Language, Executor]:
    language = LANGUAGES.get(language_id)
    if language is None:
        raise ValueError(f"Unsupported language: {language_id}")
    executor = executor_for(language)
    if executor is None:
        raise RunnerUnavailable(f"{language.label} cannot run with CODE_RUNNER=local: install its toolchain or switch to CODE_RUNNER=judge0.")
    return language, executor


def _time_limit(problem: Problem | None, language: Language) -> float:
    base = problem.time_limit_ms / 1000 if problem else settings.code_run_timeout_seconds
    return base * language.time_multiplier


def judge(problem: Problem, language_id: str, code: str, tests: list[TestCase]) -> dict:
    language, executor = _resolve(language_id)
    batch = executor.run_batch(language, code, [_stdin(t.input) for t in tests], _time_limit(problem, language))
    results = []
    for index, test in enumerate(tests):
        if batch.compile_error is not None:
            results.append({"index": index, "hidden": test.hidden, "status": "compile_error", "passed": False})
            continue
        execution = batch.executions[index]
        status = _status(execution, test.expected)
        result = {"index": index, "hidden": test.hidden, "status": status, "passed": status == "accepted", "duration_ms": execution.duration_ms}
        if not test.hidden:
            result.update({"input": test.input, "expected": test.expected, "actual": execution.stdout, "stderr": execution.stderr})
        results.append(result)
    passed = sum(r["passed"] for r in results)
    return {
        "language": language.id,
        "runner": executor.name,
        "compile_error": batch.compile_error,
        "passed": passed,
        "total": len(tests),
        "all_passed": passed == len(tests) and batch.compile_error is None,
        "results": results,
    }


def run_custom(language_id: str, code: str, stdin: str, problem: Problem | None = None) -> dict:
    language, executor = _resolve(language_id)
    batch = executor.run_batch(language, code, [_stdin(stdin)], _time_limit(problem, language))
    if batch.compile_error is not None:
        return {"language": language.id, "runner": executor.name, "compile_error": batch.compile_error, "status": "compile_error"}
    execution = batch.executions[0]
    return {
        "language": language.id,
        "runner": executor.name,
        "compile_error": None,
        "status": _status(execution, None),
        "stdout": execution.stdout,
        "stderr": execution.stderr,
        "duration_ms": execution.duration_ms,
    }
