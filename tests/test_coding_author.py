import pytest

from app.services.coding_author import materialize_coding_problem
from tests.conftest import _AUTHORED_PROBLEM


def test_reference_solution_supplies_expected_output():
    problem = materialize_coding_problem(_AUTHORED_PROBLEM, "medium")
    visible = [case for case in problem.tests if not case.hidden]
    assert problem.difficulty == "medium"
    assert problem.slug.startswith("authored-")
    assert visible[0].expected == "3"
    assert visible[1].expected == "30"
    assert sum(case.hidden for case in problem.tests) == 2
    assert "print(a + b)" not in problem.starters["python"]


def test_literal_backslash_n_in_a_case_is_a_real_newline():
    spec = {
        **_AUTHORED_PROBLEM,
        "cases": [
            {"input": "1\\n2", "hidden": False, "explanation": "1 + 2 = 3."},
            {"input": "10\\n20", "hidden": False},
            {"input": "-1\\n5", "hidden": True},
            {"input": "100\\n200", "hidden": True},
        ],
    }
    problem = materialize_coding_problem(spec, "medium")
    visible = [case for case in problem.tests if not case.hidden]
    assert visible[0].expected == "3"
    assert visible[1].expected == "30"


def test_json_contract_problem_is_rejected():
    spec = {
        **_AUTHORED_PROBLEM,
        "title": "Optimize Contract Review",
        "description": "Given contract clauses as JSON objects with id and priority, reorder the clauses using priority rules.",
        "input_format": "Each clause is a JSON object with keys id and priority.",
        "output_format": "Output a JSON array of clause IDs.",
        "cases": [
            {"input": '{"id": "a", "priority": 1}', "hidden": False, "explanation": "One clause."},
            {"input": '{"id": "b", "priority": 2}', "hidden": False},
            {"input": '{"id": "c", "priority": 3}', "hidden": True},
            {"input": '{"id": "d", "priority": 4}', "hidden": True},
        ],
    }
    with pytest.raises(ValueError, match="LeetCode-style"):
        materialize_coding_problem(spec, "medium")


def test_reference_that_touches_the_system_is_rejected():
    spec = {**_AUTHORED_PROBLEM, "reference_python": "import os\nos.system('echo no')\n"}
    with pytest.raises(ValueError, match="disallowed"):
        materialize_coding_problem(spec, "easy")
