"""Find the coding problem attached to an interview, including after a restart."""
from app.problems import get_problem
from app.problems.dynamic import remember
from app.problems.model import Problem
from app.problems.serialize import problem_from_dict
from app.services.repository import repository


def load_by_slug(slug: str) -> Problem | None:
    found = get_problem(slug)
    if found or not slug.startswith("authored-"):
        return found
    raw = repository.coding_problem_by_slug(slug)
    if not raw:
        return None
    return remember(problem_from_dict(raw))


def problem_for_session(session) -> Problem | None:
    slug = (session.dsa or {}).get("problem_slug") or session.profile.get("prepared_problem_slug")
    if not slug:
        return None
    return load_by_slug(slug)
