"""Problem bank. Add a practice problem by creating a module with a PROBLEM and listing it here.

Interview links use a separate set of problems the agent writes per posting.
Those live in the authored cache, not in this bank.
"""
from app.problems import longest_substring, merge_k_sorted_lists, two_sum, valid_parentheses
from app.problems.dynamic import recall
from app.problems.model import Problem, TestCase

PROBLEMS: dict[str, Problem] = {
    module.PROBLEM.slug: module.PROBLEM
    for module in (two_sum, valid_parentheses, longest_substring, merge_k_sorted_lists)
}

DEFAULT_BY_DIFFICULTY = {
    "easy": two_sum.PROBLEM.slug,
    "medium": longest_substring.PROBLEM.slug,
    "hard": merge_k_sorted_lists.PROBLEM.slug,
}


def get_problem(slug: str) -> Problem | None:
    return PROBLEMS.get(slug) or recall(slug)


def problem_for_difficulty(difficulty: str) -> Problem:
    return PROBLEMS[DEFAULT_BY_DIFFICULTY.get(difficulty, DEFAULT_BY_DIFFICULTY["medium"])]


__all__ = ["PROBLEMS", "Problem", "TestCase", "get_problem", "problem_for_difficulty"]
