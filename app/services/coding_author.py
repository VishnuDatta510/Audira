"""Turn an agent-written coding spec into a problem the judge can run.

Expected outputs are produced by executing the reference solution. The reference
itself is not stored, so it cannot leak to the candidate.
"""
from __future__ import annotations

import re
from uuid import uuid4

from app.problems.model import Problem, TestCase
from app.services.code_runner.judge import normalize_output
from app.services.code_runner.languages import LANGUAGES
from app.services.code_runner.local import LocalExecutor

_local = LocalExecutor()
_FORBIDDEN = ("subprocess", "socket", "os.system", "shutil", "eval(", "exec(", "__import__", "open(")
_JSON_WORD = re.compile(r"\bjson\b", re.IGNORECASE)
_JSON_OBJECT = re.compile(r'\{[^{}"]*"[A-Za-z_][A-Za-z0-9_]*"\s*:')


def _unwrap(text: object) -> str:
    value = str(text or "").strip()
    fenced = re.fullmatch(r"```[a-zA-Z0-9]*\n([\s\S]*?)\n```", value)
    return (fenced.group(1) if fenced else value).strip()


def _strings(value: object, limit: int) -> list[str]:
    items = value if isinstance(value, list) else []
    return [str(item).strip() for item in items if str(item).strip()][:limit]


def _stdin(text: str) -> str:
    return text if text.endswith("\n") else text + "\n"


def _real_newlines(text: str) -> str:
    """Models often write a case as one JSON string with the two characters \\n instead of a line break."""
    value = text.strip("\n")
    if "\n" not in value and "\\n" in value:
        value = value.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\t", "\t")
    return value


def _json_shaped(text: str) -> bool:
    return bool(_JSON_WORD.search(text) or _JSON_OBJECT.search(text))


def _require_leetcode_style(data: dict, cases: list[dict], reference: str) -> None:
    """The coding round is a DSA question. Stdin and stdout stay plain text."""
    statement = "\n".join(
        str(data.get(key) or "")
        for key in ("title", "description", "input_format", "output_format")
    )
    if _json_shaped(statement) or _json_shaped(reference):
        raise ValueError("write a LeetCode-style DSA problem with plain stdin and stdout, not JSON")
    for case in cases:
        if _json_shaped(case["input"]):
            raise ValueError("case input must be plain numbers or strings, not JSON objects")


def materialize_coding_problem(data: dict, difficulty: str) -> Problem:
    if difficulty not in {"easy", "medium", "hard"}:
        difficulty = "medium"
    title = str(data.get("title", "")).strip()
    if not 3 <= len(title) <= 80:
        raise ValueError("title must be 3 to 80 characters")
    description = str(data.get("description", "")).strip()
    if len(description) < 40:
        raise ValueError("description is too short")
    reference = _unwrap(data.get("reference_python", ""))
    if not 20 <= len(reference) <= 12000:
        raise ValueError("reference_python is missing or too long")
    if any(token in reference.lower() for token in _FORBIDDEN):
        raise ValueError("reference_python uses a disallowed operation")

    raw_cases = data.get("cases")
    if not isinstance(raw_cases, list):
        raise ValueError("cases must be a list")
    cases: list[dict] = []
    seen: set[str] = set()
    for item in raw_cases[:8]:
        if not isinstance(item, dict):
            continue
        stdin = _real_newlines(str(item.get("input", "")))
        if not stdin or len(stdin) > 8000 or stdin in seen:
            continue
        seen.add(stdin)
        explanation = str(item.get("explanation") or "").strip() or None
        cases.append({"input": stdin, "hidden": bool(item.get("hidden")), "explanation": explanation})
    visible = [case for case in cases if not case["hidden"]]
    hidden = [case for case in cases if case["hidden"]]
    if len(visible) < 2 or len(hidden) < 2:
        raise ValueError("need at least two visible and two hidden cases")
    _require_leetcode_style(data, cases, reference)

    language = LANGUAGES["python"]
    batch = _local.run_batch(language, reference, [_stdin(case["input"]) for case in cases], 2.0)
    if batch.compile_error:
        raise ValueError(f"reference failed to run: {batch.compile_error[:300]}")
    tests: list[TestCase] = []
    failures: list[str] = []
    for case, execution in zip(cases, batch.executions):
        if execution.timed_out or execution.exit_code != 0:
            failures.append((execution.stderr or execution.stdout or "failed").strip()[:200])
            continue
        tests.append(TestCase(
            case["input"],
            normalize_output(execution.stdout),
            hidden=case["hidden"],
            explanation=None if case["hidden"] else case["explanation"],
        ))
    visible = [test for test in tests if not test.hidden]
    hidden = [test for test in tests if test.hidden]
    if len(visible) < 2 or len(hidden) < 2:
        detail = failures[0] if failures else "too few cases survived"
        raise ValueError(f"reference did not produce enough valid tests: {detail}")
    if not any(test.expected for test in tests):
        raise ValueError("reference printed nothing")

    starter = _unwrap(data.get("starter_python", ""))
    starters: dict[str, str] = {}
    visible_tests = [test for test in tests if not test.hidden]
    if starter and starter != reference and len(starter) <= 12000:
        starter_batch = _local.run_batch(language, starter, [_stdin(test.input) for test in visible_tests], 2.0)
        solved = (
            starter_batch.compile_error is None
            and len(starter_batch.executions) == len(visible_tests)
            and all(
                execution.exit_code == 0 and normalize_output(execution.stdout) == test.expected
                for execution, test in zip(starter_batch.executions, visible_tests)
            )
        )
        if not solved:
            starters["python"] = starter if starter.endswith("\n") else starter + "\n"

    return Problem(
        slug="authored-" + uuid4().hex[:10],
        title=title,
        difficulty=difficulty,
        tags=tuple(_strings(data.get("tags"), 4)) or ("algorithms",),
        description=description,
        input_format=str(data.get("input_format") or "Read the input described above.").strip(),
        output_format=str(data.get("output_format") or "Print the answer.").strip(),
        constraints=tuple(_strings(data.get("constraints"), 6)) or ("See the statement.",),
        hints=tuple(_strings(data.get("hints"), 2)),
        expected_time=str(data.get("expected_time") or "See the statement.").strip()[:40],
        expected_space=str(data.get("expected_space") or "See the statement.").strip()[:40],
        tests=tuple(tests),
        starters=starters,
    )
