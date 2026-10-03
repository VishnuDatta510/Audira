"""Dry-run one conversational round against the live interview agent.

    uv run --with httpx python -m scripts.try_conversation [project|fundamentals]

Plays a scripted candidate (a vague answer, a mention of Java, an "I don't know")
and prints what the interviewer says, why it moved, and the final per-skill verdict.
Needs HUGGINGFACE_API_KEY in .env. Nothing is saved beyond the in-memory session.
"""
import sys
import textwrap

from fastapi.testclient import TestClient

from app.main import app

CANDIDATE_ANSWERS = [
    "Hi, I'm Ravi. My main project was an order-tracking backend. I wrote most of it in Java with Spring Boot and a Postgres database.",
    "I mean, it worked well. We made it fast and it handled a lot of users.",
    "We added an index on order_id and customer_id, and cached order status in Redis with a 30 second TTL, which took p95 from about 800ms to 120ms.",
    "Honestly I don't know that one.",
    "Each service had its own schema and they talked over REST. When a payment failed we published an event and the order service rolled the order back.",
    "An interface only declares behaviour, an abstract class can hold state and shared code. I used an interface for the payment providers so I could swap Stripe and Razorpay.",
    "I would add a queue so the spikes get smoothed out, and scale the consumers horizontally.",
    "I wrote unit tests with JUnit and some integration tests against a Postgres container.",
    "That's all I can think of.",
    "Thanks.",
]

PROFILE = {
    "candidate_name": "Ravi",
    "role": "Backend Engineer (Java)",
    "job_description": (
        "We need a backend engineer to build and scale Java/Spring Boot microservices. You will design REST APIs, "
        "model data in PostgreSQL, use Redis for caching, and work with Kafka for events. Strong OOP, SQL and "
        "debugging skills are required. Experience with testing and observability is a plus."
    ),
    "resume": (
        "Ravi Kumar, 2 years experience. Built an order-tracking backend in Java/Spring Boot with PostgreSQL and Redis. "
        "Wrote a payments integration with Stripe and Razorpay. Some exposure to Docker."
    ),
    "preparation_goal": "Get better at explaining system design choices.",
    "difficulty": "medium",
    "dsa_enabled": False,
}


def say(who: str, text: str) -> None:
    print(textwrap.fill(text, width=100, initial_indent=f"{who:>12}: ", subsequent_indent=" " * 14))


def main() -> None:
    section = sys.argv[1] if len(sys.argv) > 1 else "project"
    client = TestClient(app)
    created = client.post("/api/sessions", json=PROFILE)
    if created.status_code != 200:
        print(f"Creating the session failed ({created.status_code}): {created.text[:600]}")
        return
    session_id = created.json()["session_id"]
    started = client.post(f"/api/sessions/{session_id}/section", json={"section": section})
    if started.status_code != 200:
        print(f"Starting the round failed ({started.status_code}): {started.text[:600]}")
        return
    body = started.json()
    print(f"\n{section} round · up to {body['total_questions']} turns · first topic: {body['topic']}\n")
    say("Interviewer", body["question"])
    for text in CANDIDATE_ANSWERS:
        say("Candidate", text)
        reply = client.post(f"/api/sessions/{session_id}/answer", json={"answer": text})
        if reply.status_code != 200:
            print(f"\nThe answer failed ({reply.status_code}): {reply.text[:600]}")
            return
        result = reply.json()
        feedback = result["feedback"]
        print(f"{'':>14}[private: {feedback['score']}/100 · {feedback['signal']} · move: {result['kind']} · topic: {result['topic']}]")
        if result["complete"]:
            say("Interviewer", result["closing"])
            break
        say("Interviewer", result["next_question"])
    response = client.get(f"/api/sessions/{session_id}/report")
    if response.status_code != 200:
        print(f"\nThe report failed ({response.status_code}): {response.text[:400]}")
        return
    report = response.json()
    verdict = report["round_verdicts"].get(section, {})
    print(f"\nRound score: {report['round_scores'].get(section)} (rated by {verdict.get('rated_by')})")
    print(verdict.get("summary", ""))
    for skill in verdict.get("skills", []):
        print(f"  {skill['rating']:>3}  {skill['level']:<10} {skill['skill']}: {skill['evidence']}")


if __name__ == "__main__":
    main()
