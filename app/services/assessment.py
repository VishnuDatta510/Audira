"""Scoring for DSA submissions.

Correctness comes from running the test suite on Judge0 (see app.services.code_runner).
Complexity and code quality come from the interview agent's code review. If the
agent is down at submit time, a static heuristic keeps the submission from being
lost, and the evaluation says which reviewer was used.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from app.problems.model import Problem
from app.services.agent import AgentUnavailable, agent


def _estimate_complexity(code: str) -> tuple[str, str, str]:
    text = code.lower()
    heap = any(x in text for x in ("heapq", "priorityqueue", "heappush", "priority_queue", "container/heap"))
    nested = bool(re.search(r"(?:for|while)\b[\s\S]{0,350}(?:for|while)\b", text))
    sorting = any(x in text for x in (".sort(", "sorted(", "arrays.sort", "collections.sort", "sort.ints", "std::sort"))
    mapping = any(x in text for x in ("dict(", "{}", "hashmap", "unordered_map", "map<", "set(", "new map", "new set", "map[", "hashset"))
    if heap:
        time, approach = "O(n log k)", "heap-based merge"
    elif nested:
        time, approach = "O(n²)", "nested iteration"
    elif sorting:
        time, approach = "O(n log n)", "sorting-based approach"
    else:
        time, approach = "O(n)", "single-pass / hash-based approach"
    return time, ("O(n)" if mapping or heap else "O(1) auxiliary"), approach


def _heuristic_review(code: str, problem: Problem, judged: dict) -> dict:
    time, space, approach = _estimate_complexity(code)
    meets = time == problem.expected_time
    feedback = f"Estimated {time} time and {space} space using a {approach}."
    if not meets:
        feedback += f" The target is {problem.expected_time} time."
    if judged["compile_error"]:
        quality = "The code did not compile, so no test could run."
    elif judged["all_passed"]:
        quality = "All visible and hidden tests passed."
    else:
        failed = {r["status"] for r in judged["results"] if not r["passed"]}
        quality = f"{judged['passed']} of {judged['total']} tests passed. Failures: {', '.join(sorted(s.replace('_', ' ') for s in failed))}."
    return {"time_complexity": time, "space_complexity": space, "approach": approach, "meets_target": meets,
            "complexity_feedback": feedback + " The interview agent was unavailable, so this is a structural estimate.",
            "code_quality_feedback": quality}


def evaluate_dsa_submission(code: str, problem: Problem, judged: dict, language: str) -> dict[str, object]:
    """Blend test correctness (up to 85) with the complexity review (up to 15)."""
    try:
        review, reviewer = agent.review_code(problem, language, code, judged), "agent"
    except AgentUnavailable:
        review, reviewer = _heuristic_review(code, problem, judged), "heuristic"
    ratio = judged["passed"] / judged["total"] if judged["total"] else 0
    meets = review["meets_target"]
    score = round(ratio * 85) + (15 if meets and judged["all_passed"] else 5 if meets else 0)
    return {
        "score": min(score, 100),
        "tests_passed": judged["passed"],
        "tests_total": judged["total"],
        "time_complexity": review["time_complexity"],
        "space_complexity": review["space_complexity"],
        "complexity_feedback": review["complexity_feedback"],
        "code_quality_feedback": review["code_quality_feedback"],
        "likely_approach": review["approach"],
        "meets_target_complexity": meets,
        "expected_time_complexity": problem.expected_time,
        "expected_space_complexity": problem.expected_space,
        "reviewer": reviewer,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }
