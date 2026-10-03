"""Problems written by the interview agent for a specific posting.

The practice bank stays fixed. Authored problems are remembered in this process
and reloaded from the interview record after a restart.
"""
from app.problems.model import Problem

_authored: dict[str, Problem] = {}


def remember(problem: Problem) -> Problem:
    _authored[problem.slug] = problem
    return problem


def recall(slug: str) -> Problem | None:
    return _authored.get(slug)


def clear_authored() -> None:
    _authored.clear()
