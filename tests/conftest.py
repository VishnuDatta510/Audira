"""Offline test setup: local code runner and a scripted interview agent.

The fake replaces only the network call (`agent._chat`), so the agent's prompt
building, JSON parsing and validation still run in every API test.
"""
import itertools
import json
import re

import pytest

from app.core.config import settings
from app.services.agent import agent

_counter = itertools.count(1)


_AUTHORED_PROBLEM = {
    "title": "Pair Sum",
    "tags": ["math"],
    "description": "Read two integers from stdin and print their sum. The point is to check that input and output follow the statement.",
    "input_format": "Two integers separated by a space.",
    "output_format": "One integer, the sum.",
    "constraints": ["Each integer fits in a 32-bit signed range."],
    "hints": ["Add the two numbers you read."],
    "expected_time": "O(1)",
    "expected_space": "O(1)",
    "reference_python": "import sys\na, b = map(int, sys.stdin.read().split())\nprint(a + b)\n",
    "starter_python": "import sys\n\ndef pair_sum(a: int, b: int) -> int:\n    return 0\n\na, b = map(int, sys.stdin.read().split())\nprint(pair_sum(a, b))\n",
    "cases": [
        {"input": "1 2", "hidden": False, "explanation": "1 + 2 = 3."},
        {"input": "10 20", "hidden": False},
        {"input": "-1 5", "hidden": True},
        {"input": "100 200", "hidden": True},
    ],
}


def _interviewer_turn(user: str) -> str:
    """One follow-up per topic, chase a mention of Java, otherwise move on."""
    allowed = re.search(r"Allowed decisions right now: ([a-z_, ]+)\.", user).group(1).split(", ")
    answer = re.search(r"The candidate answered[^:]*: (.*?)\n\n", user, flags=re.S).group(1)
    follow_ups = int(re.search(r"Follow-ups already asked on the current topic: (\d+)", user).group(1))
    if "Java" in answer and "probe_mention" in allowed:
        decision = "probe_mention"
    elif follow_ups == 0 and "follow_up" in allowed:
        decision = "follow_up"
    else:
        decision = next(d for d in ("next_topic", "wrap_up") if d in allowed)
    reply = "Thanks, that is all for this round." if decision == "wrap_up" else f"Got it. Scripted {decision} {next(_counter)}?"
    return json.dumps({
        "assessment": {"score": 40 if "don't know" in answer else 80, "signal": "solid", "strength": "Specific.", "improvement": "Add numbers.", "role_relevance": "Relevant."},
        "mentions": ["Java"] if "Java" in answer else [],
        "topic_verdict": {"level": "solid", "note": "Explained it clearly."},
        "decision": decision,
        "new_topic": "Object-oriented design" if decision == "probe_mention" else "",
        "reply": reply,
    })


def scripted_reply(system: str, user: str, max_tokens: int, temperature: float, **_extra) -> str:
    if "reference_python" in user:
        return json.dumps(_AUTHORED_PROBLEM)
    if '"opening"' in user:
        count = int(re.search(r"Plan (\d+) topics", user).group(1))
        topics = [{"skill": f"Skill {i + 1}", "why": "The job needs it.", "angle": "Ask for an example."} for i in range(count)]
        return json.dumps({"topics": topics, "opening": f"Hi, thanks for joining. Scripted opening {next(_counter)}?"})
    if '"decision"' in user:
        return _interviewer_turn(user)
    if '"skills": [' in user:
        skills = re.findall(r"^\d+\. \[covered\] ([^:]+):", user, flags=re.M)
        return json.dumps({"skills": [{"skill": s, "level": "solid", "rating": 76, "evidence": "Gave a concrete example."} for s in skills], "summary": "Solid round."})
    # Checked before the brief: a link session's prompt carries the recruiter's brief, keys and all.
    if '"follow_up_questions"' in user:
        return json.dumps({
            "summary": "The candidate solved the coding problem and explained their API work.",
            "communication_assessment": {"clarity": "Clear.", "answer_structure": "Structured.", "evidence": "Some numbers."},
            "strengths": ["Passed every hidden test."],
            "gaps": ["Did not say how they measured latency; a strong answer would give before and after numbers."],
            "follow_up_questions": ["How did you measure the speed-up?"],
        })
    user = re.sub(r"Your earlier reading of this candidate:\n.*?\n\n", "", user, flags=re.S)
    if '{"questions"' in user:
        count = int(re.search(r"Write exactly (\d+)", user).group(1))
        return json.dumps({"questions": [f"Scripted question number {next(_counter)}?" for _ in range(count)]})
    if '"key_requirements"' in user:
        return json.dumps({"summary": "A junior engineer with Python API projects.", "key_requirements": ["Python APIs"], "resume_highlights": ["Two web projects"], "gaps_to_probe": ["Testing"]})
    if '"score": integer' in user:
        return json.dumps({"score": 72, "strength": "Clear example.", "improvement": "Add a measurable result.", "role_relevance": "Relevant to the API work."})
    if '"time_complexity"' in user:
        return json.dumps({"time_complexity": "O(n)", "space_complexity": "O(n)", "approach": "hash map", "meets_target": True, "complexity_feedback": "Linear.", "code_quality_feedback": "Readable."})
    raise AssertionError(f"Unexpected agent prompt: {user[:200]}")


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.setattr(settings, "code_runner", "local")
    monkeypatch.setattr(agent, "_chat", scripted_reply)
