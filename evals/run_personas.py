"""Interview three simulated candidates who share one résumé, and check that Audira tells them apart.

    uv run python -m evals.run_personas              # the three personas
    uv run python -m evals.run_personas --authoring 5   # also author 5 coding problems

Every candidate claims the same work on paper. One really did it, one was a junior helper who
is honest about it, and one is bluffing. A good interviewer scores the real one well above the other two,
and its report calls out the bluffer's unsupported claims.

The candidates are played by the same model provider the interviewer uses, so read the numbers as
a sanity check rather than a benchmark. Needs the model keys in .env. Runs against the real API
in-process with sessions kept in memory (never written to MongoDB), and writes evals/results.json
plus a Markdown summary on stdout.
"""
from __future__ import annotations

import argparse
import json
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.services import agent as agent_module
from app.services.agent import AgentUnavailable, agent
from app.services.repository import repository
from app.services.session_store import store

RESULTS = Path(__file__).with_name("results.json")
ROUNDS = ("project", "fundamentals")

JOB = (
    "Backend engineer, payments. You will own the services that move money: reconciliation, refunds and settlement. "
    "Daily work is Python (FastAPI), PostgreSQL and Kafka. We need someone who designs for correctness under retries "
    "(idempotency, transactions), can make a slow batch job fast, and can explain trade-offs with numbers."
)
RESUME = (
    "Backend engineer, 3 years. Rebuilt the payments reconciliation service in Python/FastAPI and PostgreSQL, "
    "cutting the nightly run from 4 hours to 20 minutes. Introduced Kafka-based event processing for refunds with "
    "exactly-once delivery. Led the team's migration to Kubernetes. Comfortable with SQL tuning and system design."
)

PERSONAS = {
    "strong": (
        "You are a candidate in a technical interview, and everything on your résumé is true: you did this work yourself. "
        "Answer with specifics you remember: the reconciliation job issued one query per transaction, you replaced it with a "
        "COPY into a staging table and one set-based join, and you added a composite index on (merchant_id, settled_at). "
        "For refunds you used idempotency keys and at-least-once Kafka consumers with a dedupe table, because true "
        "exactly-once across services is not realistic, and you say so. Give numbers, trade-offs and what you would do "
        "differently. If you do not know something, say so plainly."
    ),
    "honest_junior": (
        "You are a candidate in a technical interview. Your résumé overstates your role: you were the most junior person "
        "on the team, you fixed small bugs and wrote tests, and the senior engineers made the design decisions. You are "
        "honest about this when asked. You remember the general idea of the work but few details, give short answers, and "
        "say 'I'm not sure' when you are not."
    ),
    "bluffer": (
        "You are a candidate in a technical interview, and you did not really do the work on your résumé, but you will "
        "never admit that. Sound confident and senior. Use buzzwords (scalable, event-driven, cloud-native, best practices), "
        "repeat the impressive numbers from the résumé, and add new impressive-sounding numbers. When asked how exactly "
        "something worked, stay general, pivot to a different success, or invent details that do not quite add up. "
        "Insist the Kafka setup was exactly-once end to end."
    ),
}


def ok(response):
    if response.status_code >= 400:
        raise RuntimeError(f"{response.request.method} {response.request.url.path} failed ({response.status_code}): {response.text[:600]}")
    return response


def call(send, attempts: int = 6):
    """Free-tier providers cap tokens per minute. A failed agent call changes nothing, so wait and resend."""
    for attempt in range(attempts):
        response = send()
        if response.status_code != 503 or attempt == attempts - 1:
            return ok(response)
        print("  (provider busy, waiting 35 s)", flush=True)
        time.sleep(35)


def candidate_reply(persona: str, history: list[tuple[str, str]], question: str) -> str:
    transcript = "\n".join(f"Interviewer: {q}\nYou: {a}" for q, a in history[-6:])
    prompt = (
        f"Your résumé:\n{RESUME}\n\nThe conversation so far:\n{transcript or '(just started)'}\n\n"
        f"Interviewer: {question}\n\n"
        "Reply as the candidate, out loud, in 2 to 5 sentences. No stage directions, no quotation marks, no preamble."
    )
    for attempt in range(6):
        try:
            return agent._chat(PERSONAS[persona], prompt, max_tokens=300, temperature=0.8).strip()
        except AgentUnavailable:
            if attempt == 5:
                raise
            time.sleep(35)


def interview(client: TestClient, persona: str) -> dict:
    created = call(lambda: client.post("/api/sessions", json={
        "candidate_name": persona.replace("_", " ").title(),
        "role": "Backend Engineer, Payments",
        "job_description": JOB,
        "resume": RESUME,
        "preparation_goal": "Evaluation run.",
        "interview_focus": "Check every résumé claim for evidence: idempotency, Kafka delivery guarantees, and how the speed-up was measured.",
        "difficulty": "medium",
        "dsa_enabled": False,
        "project_question_count": 3,
        "fundamentals_question_count": 3,
    }))
    session_id = created.json()["session_id"]
    latencies: list[float] = []
    kinds: list[str] = []
    history: list[tuple[str, str]] = []

    for section in ROUNDS:
        started = call(lambda: client.post(f"/api/sessions/{session_id}/section", json={"section": section}))
        question = started.json()["question"]
        while True:
            answer = candidate_reply(persona, history, question)
            history.append((question, answer))
            for attempt in range(6):
                began = time.perf_counter()
                reply = client.post(f"/api/sessions/{session_id}/answer", json={"answer": answer})
                if reply.status_code != 503 or attempt == 5:
                    break
                print("  (provider busy, waiting 35 s)", flush=True)
                time.sleep(35)
            latencies.append(time.perf_counter() - began)  # the attempt that went through, not the waits
            ok(reply)
            result = reply.json()
            kinds.append(result["kind"])
            print(f"  [{persona}] {section} turn {len(kinds)}: {result['kind']} · score {result['feedback']['score']}", flush=True)
            if result["complete"]:
                break
            question = result["next_question"]

    report = call(lambda: client.get(f"/api/sessions/{session_id}/report"))
    body = report.json()
    session = store.get(session_id)
    answers = [a for section in ROUNDS for a in body["section_summaries"].get(section, {}).get("answers", [])]
    return {
        "persona": persona,
        "overall": body["overall_score"],
        "rounds": {section: body["round_scores"].get(section) for section in ROUNDS},
        "turns": len(kinds),
        "follow_ups": kinds.count("follow_up"),
        "weak_answers": sum(1 for a in answers if (a.get("feedback") or {}).get("signal") in {"weak", "partial", "no_answer"}),
        "claims_noted": sorted({m for state in session.conversation.values() for m in state.get("mentions", [])}),
        "gaps": body["gaps"],
        "follow_up_questions": body["follow_up_questions"],
        "summary": body["summary"],
        "latencies": latencies,
    }


def author_problems(count: int) -> dict:
    """How often a freshly authored problem passes verification on the first try."""
    attempts: list[int] = []
    original = agent_module.materialize_coding_problem
    calls = {"n": 0}

    def counting(data, difficulty):
        calls["n"] += 1
        return original(data, difficulty)

    agent_module.materialize_coding_problem = counting
    try:
        profile = {"role": "Backend Engineer, Payments", "job_description": JOB, "resume": RESUME, "difficulty": "medium"}
        for i in range(count):
            calls["n"] = 0
            try:
                problem = agent.author_coding_problem(profile)
                attempts.append(calls["n"])
                print(f"  problem {i + 1}: '{problem.title}' after {calls['n']} attempt(s), {len(problem.tests)} verified tests", flush=True)
            except Exception as exc:  # noqa: BLE001  (a failed authoring run is a data point, not a crash)
                attempts.append(0)
                print(f"  problem {i + 1}: failed ({exc})", flush=True)
    finally:
        agent_module.materialize_coding_problem = original
    shipped = [a for a in attempts if a]
    return {
        "runs": count,
        "shipped": len(shipped),
        "first_try": sum(1 for a in shipped if a == 1),
        "attempts": attempts,
    }


def markdown(results: list[dict], authoring: dict | None, model: str) -> str:
    rows = [
        "| Candidate | Overall | Project | Fundamentals | Follow-ups asked | Answers marked weak or partial |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for r in results:
        rows.append(f"| {r['persona'].replace('_', ' ')} | **{r['overall']}** | {r['rounds']['project']} | {r['rounds']['fundamentals']} | {r['follow_ups']} of {r['turns']} | {r['weak_answers']} |")
    latencies = [t for r in results for t in r["latencies"]]
    lines = rows + [
        "",
        f"Model: {model}. Median interviewer turn: {statistics.median(latencies):.1f} s (p90 {statistics.quantiles(latencies, n=10)[-1]:.1f} s) over {len(latencies)} turns.",
    ]
    bluffer = next((r for r in results if r["persona"] == "bluffer"), None)
    if bluffer:
        lines += ["", "What the report said the bluffer didn't show:"] + [f"> {gap}" for gap in bluffer["gaps"][:3]]
    if authoring:
        lines += ["", f"Problem authoring: {authoring['shipped']} of {authoring['runs']} runs shipped a verified problem, {authoring['first_try']} on the first try."]
    return "\n".join(lines)


def save(saved: dict) -> None:
    saved["ran_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    saved["model"] = agent.model
    RESULTS.write_text(json.dumps(saved, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--authoring", type=int, default=0, help="also author this many coding problems")
    parser.add_argument("--only", choices=sorted(PERSONAS), action="append", help="run just these personas (earlier results are kept)")
    args = parser.parse_args()

    repository.db = None  # keep evaluation sessions out of the real database
    client = TestClient(app)
    # Free-tier quotas can stop a run midway, so each finished candidate is saved straight away.
    saved = json.loads(RESULTS.read_text(encoding="utf-8")) if RESULTS.exists() else {"personas": [], "authoring": None}
    for persona in args.only or PERSONAS:
        print(f"Interviewing the {persona.replace('_', ' ')} candidate…", flush=True)
        result = interview(client, persona)
        saved["personas"] = [r for r in saved["personas"] if r["persona"] != persona] + [result]
        save(saved)
    if args.authoring:
        print(f"Authoring {args.authoring} coding problems…", flush=True)
        saved["authoring"] = author_problems(args.authoring)
        save(saved)

    order = list(PERSONAS)
    results = sorted(saved["personas"], key=lambda r: order.index(r["persona"]))
    print("\n" + markdown(results, saved["authoring"], saved.get("model", agent.model)))
    print(f"\nSaved {RESULTS}")


if __name__ == "__main__":
    main()
