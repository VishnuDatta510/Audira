"""Problem bank, language catalog and code execution endpoints."""
from fastapi import APIRouter, HTTPException

from app.domain.schemas import RunCodeRequest, SubmitCodeRequest
from app.problems import PROBLEMS, Problem
from app.services.prepared_problems import load_by_slug
from app.services.code_runner import LANGUAGES, RunnerUnavailable, judge, language_catalog, run_custom

router = APIRouter(prefix="/api")


def public_problem(problem: Problem) -> dict:
    """Problem detail safe to send to the browser: hidden test data is never included."""
    visible = problem.visible_tests
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
        "examples": [{"input": t.input, "output": t.expected, "explanation": t.explanation} for t in visible if t.explanation],
        "sample_tests": [{"index": i, "input": t.input, "expected": t.expected} for i, t in enumerate(visible)],
        "total_tests": len(problem.tests),
        "starter_code": {lang_id: problem.starters.get(lang_id) or lang.generic_template for lang_id, lang in LANGUAGES.items()},
    }


def problem_or_404(slug: str) -> Problem:
    problem = load_by_slug(slug)
    if not problem:
        raise HTTPException(404, "Problem not found")
    return problem


def execute(action):
    try:
        return action()
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RunnerUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@router.get("/languages")
def languages():
    return language_catalog()


@router.get("/problems")
def list_problems():
    return [{"slug": p.slug, "title": p.title, "difficulty": p.difficulty, "tags": list(p.tags), "total_tests": len(p.tests)} for p in PROBLEMS.values()]


@router.get("/problems/{slug}")
def problem_detail(slug: str):
    return public_problem(problem_or_404(slug))


@router.post("/problems/{slug}/run")
def run_problem(slug: str, request: RunCodeRequest):
    """Run against the visible samples, or against custom input when provided."""
    problem = problem_or_404(slug)
    if request.custom_input is not None:
        return execute(lambda: {"mode": "custom", **run_custom(request.language, request.code, request.custom_input, problem)})
    return execute(lambda: {"mode": "samples", **judge(problem, request.language, request.code, problem.visible_tests)})


@router.post("/problems/{slug}/submit")
def submit_problem(slug: str, request: SubmitCodeRequest):
    """Practice submission against every test, including hidden ones."""
    problem = problem_or_404(slug)
    if slug not in PROBLEMS:
        raise HTTPException(403, "A problem written for an interview is submitted once, from the interview")
    return execute(lambda: {"mode": "submit", **judge(problem, request.language, request.code, list(problem.tests))})
