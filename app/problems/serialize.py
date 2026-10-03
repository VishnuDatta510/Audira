"""Store an authored problem without its reference solution."""
from app.problems.model import Problem, TestCase


def problem_to_dict(problem: Problem) -> dict:
    return {
        "slug": problem.slug,
        "title": problem.title,
        "difficulty": problem.difficulty,
        "tags": list(problem.tags),
        "description": problem.description,
        "input_format": problem.input_format,
        "output_format": problem.output_format,
        "constraints": list(problem.constraints),
        "hints": list(problem.hints),
        "expected_time": problem.expected_time,
        "expected_space": problem.expected_space,
        "time_limit_ms": problem.time_limit_ms,
        "starters": dict(problem.starters),
        "tests": [
            {"input": case.input, "expected": case.expected, "hidden": case.hidden, "explanation": case.explanation}
            for case in problem.tests
        ],
    }


def problem_from_dict(data: dict) -> Problem:
    return Problem(
        slug=data["slug"],
        title=data["title"],
        difficulty=data["difficulty"],
        tags=tuple(data.get("tags") or ()),
        description=data["description"],
        input_format=data.get("input_format") or "",
        output_format=data.get("output_format") or "",
        constraints=tuple(data.get("constraints") or ()),
        hints=tuple(data.get("hints") or ()),
        expected_time=data.get("expected_time") or "",
        expected_space=data.get("expected_space") or "",
        tests=tuple(
            TestCase(case["input"], case["expected"], hidden=bool(case.get("hidden")), explanation=case.get("explanation"))
            for case in data.get("tests") or []
        ),
        starters=dict(data.get("starters") or {}),
        time_limit_ms=int(data.get("time_limit_ms") or 2000),
    )
