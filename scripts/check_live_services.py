"""Smoke-test the live interview agent (Hugging Face) and Judge0 with the keys in .env.

Run from Build-N-Pray/:  .\\.venv\\Scripts\\python.exe scripts\\check_live_services.py
Each step prints how long it took and the agent's JSON output. This uses a few
thousand tokens of Hugging Face credit.
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings  # noqa: E402
from app.problems import PROBLEMS  # noqa: E402
from app.services.agent import agent  # noqa: E402
from app.services.assessment import evaluate_dsa_submission  # noqa: E402
from app.services.code_runner import judge  # noqa: E402
from tests import solutions  # noqa: E402

PROFILE = {
    "role": "Junior Software Engineer",
    "job_description": "Build and maintain web applications with JavaScript and Python. Design REST APIs, write tests, and use data structures to keep features fast. Collaborate with designers and senior engineers in code review.",
    "resume": "Built a React task manager with a Node.js API and PostgreSQL. Wrote a Python script that cut a weekly report from two hours to five minutes. Studied data structures and algorithms; solved 150 practice problems.",
    "preparation_goal": "Explain my projects clearly and get faster at medium coding problems.",
    "interview_focus": "Prioritize the role responsibilities, project architecture, and required technologies.",
    "difficulty": "medium",
}
STRONG = ("I'm a junior engineer. My main project is a React task manager backed by a Node.js Express API and PostgreSQL. "
          "I designed the REST endpoints, added indexes on user_id and due_date which took list queries from 400ms to 30ms, and wrote Jest tests for the API.")
BRUTE_FORCE = ("s = input()\nbest = 0\nfor i in range(len(s)):\n    seen = set()\n    for j in range(i, len(s)):\n"
               "        if s[j] in seen:\n            break\n        seen.add(s[j])\n        best = max(best, j - i + 1)\nprint(best)\n")


def timed(label, fn):
    started = time.perf_counter()
    out = fn()
    print(f"\n=== {label} ({time.perf_counter() - started:.1f}s)\n{json.dumps(out, indent=1, ensure_ascii=False)[:1400]}")
    return out


def main() -> None:
    print(f"Agent providers: {settings.agent_providers}   Code runner: {settings.code_runner} ({settings.judge0_url})")
    profile = {**PROFILE}
    profile["agent_brief"] = timed("read_profile", lambda: agent.read_profile(profile))
    timed("opening_questions", lambda: agent.opening_questions(profile))
    project = timed("project_questions x4", lambda: agent.project_questions(profile, 4))
    timed("fundamentals_questions x3", lambda: agent.fundamentals_questions(profile, 3))
    strong = timed("critique: strong answer", lambda: agent.critique(project[0], STRONG, profile, "project"))
    weak = timed("critique: weak answer", lambda: agent.critique(project[0], "I dunno, I just made some apps.", profile, "project"))
    problem = PROBLEMS["longest-substring-without-repeating-characters"]
    for label, code in (("optimal", solutions.PYTHON[problem.slug]), ("brute force", BRUTE_FORCE)):
        judged = judge(problem, "python", code, list(problem.tests))
        timed(f"coding review: {label}, {judged['passed']}/{judged['total']} tests on {judged['runner']}",
              lambda: evaluate_dsa_submission(code, problem, judged, "python"))
    answers = [{"section": "project", "question": project[0], "answer": STRONG, "feedback": strong},
               {"section": "project", "question": project[1], "answer": "I dunno, I just made some apps.", "feedback": weak}]
    timed("final_report", lambda: agent.final_report(profile, answers, {"project": 55, "dsa": 90}, None))


if __name__ == "__main__":
    main()
