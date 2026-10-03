import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.problems import PROBLEMS
from app.services.code_runner import LANGUAGES
from tests import solutions

client = TestClient(app)


def runnable(language_id: str) -> bool:
    return LANGUAGES[language_id].local_available()


@pytest.mark.parametrize("slug", list(PROBLEMS))
def test_python_reference_solution_passes_every_test(slug):
    response = client.post(f"/api/problems/{slug}/submit", json={"language": "python", "code": solutions.PYTHON[slug]})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["all_passed"], body["results"]


@pytest.mark.skipif(not runnable("javascript"), reason="Node.js is not installed")
@pytest.mark.parametrize("slug", list(PROBLEMS))
def test_javascript_reference_solution_passes_every_test(slug):
    body = client.post(f"/api/problems/{slug}/submit", json={"language": "javascript", "code": solutions.JAVASCRIPT[slug]}).json()
    assert body["all_passed"], body["results"]


@pytest.mark.skipif(not runnable("typescript"), reason="Node.js is not installed")
def test_typescript_runs_with_type_annotations():
    body = client.post("/api/problems/two-sum/submit", json={"language": "typescript", "code": solutions.TYPESCRIPT_TWO_SUM}).json()
    assert body["all_passed"], body["results"]


@pytest.mark.skipif(not runnable("java"), reason="JDK is not installed")
def test_java_compiles_and_passes():
    body = client.post("/api/problems/two-sum/submit", json={"language": "java", "code": solutions.JAVA_TWO_SUM}).json()
    assert body["all_passed"], body


@pytest.mark.skipif(not runnable("go"), reason="Go is not installed")
def test_go_compiles_and_passes():
    body = client.post("/api/problems/valid-parentheses/submit", json={"language": "go", "code": solutions.GO_VALID_PARENTHESES}).json()
    assert body["all_passed"], body


@pytest.mark.parametrize("slug", list(PROBLEMS))
def test_python_starter_code_runs_but_fails(slug):
    starter = client.get(f"/api/problems/{slug}").json()["starter_code"]["python"]
    body = client.post(f"/api/problems/{slug}/run", json={"language": "python", "code": starter}).json()
    assert body["compile_error"] is None
    assert not body["all_passed"]
    assert all(r["status"] in {"wrong_answer", "accepted"} for r in body["results"])


def test_problem_detail_never_leaks_hidden_tests():
    body = client.get("/api/problems/two-sum").json()
    hidden_inputs = [t.input for t in PROBLEMS["two-sum"].tests if t.hidden]
    assert all(sample["input"] not in hidden_inputs for sample in body["sample_tests"])
    submitted = client.post("/api/problems/two-sum/submit", json={"language": "python", "code": "print('0 1')"}).json()
    hidden = [r for r in submitted["results"] if r["hidden"]]
    assert hidden and all("input" not in r and "actual" not in r for r in hidden)


def test_runtime_error_and_wrong_answer_statuses():
    body = client.post("/api/problems/two-sum/run", json={"language": "python", "code": "raise SystemExit(3)"}).json()
    assert {r["status"] for r in body["results"]} == {"runtime_error"}
    body = client.post("/api/problems/two-sum/run", json={"language": "python", "code": "print('9 9')"}).json()
    assert {r["status"] for r in body["results"]} == {"wrong_answer"}


def test_time_limit_exceeded():
    body = client.post("/api/problems/two-sum/run", json={"language": "python", "code": "while True: pass"}).json()
    assert {r["status"] for r in body["results"]} == {"time_limit_exceeded"}


@pytest.mark.skipif(not runnable("java"), reason="JDK is not installed")
def test_compile_error_is_reported():
    body = client.post("/api/problems/two-sum/run", json={"language": "java", "code": "public class Main { void broken( }"}).json()
    assert body["compile_error"]
    assert {r["status"] for r in body["results"]} == {"compile_error"}


def test_custom_input_run():
    body = client.post("/api/problems/two-sum/run", json={"language": "python", "code": "print(input()[::-1])", "custom_input": "abc"}).json()
    assert body["mode"] == "custom" and body["status"] == "finished" and body["stdout"].strip() == "cba"


def test_language_catalog_lists_popular_languages():
    ids = {lang["id"] for lang in client.get("/api/languages").json()}
    assert {"python", "javascript", "typescript", "java", "cpp", "go", "c", "csharp", "rust"} <= ids


def test_unrunnable_language_returns_503():
    catalog = {lang["id"]: lang for lang in client.get("/api/languages").json()}
    unrunnable = next((lang_id for lang_id, lang in catalog.items() if not lang["runnable"]), None)
    if unrunnable is None:
        pytest.skip("Every language is runnable here")
    response = client.post("/api/problems/two-sum/run", json={"language": unrunnable, "code": "x"})
    assert response.status_code == 503
