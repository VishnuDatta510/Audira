"""The conversational interviewer behind the project and fundamentals rounds.

There is no fixed question list. The agent plans a few skills to verify, asks one
question at a time, and after every answer decides what a good human interviewer
would do next: dig deeper, chase something the candidate brought up, move on, or
close the round. Each answer is rated privately; the per-skill verdicts reach the
candidate only in the report.

Session bookkeeping lives in app.services.conversation. This module only talks to
the model and validates what comes back.
"""
from __future__ import annotations

from app.services.agent import FAIRNESS, FOR_RECRUITER, _score, _strings, agent

DECISIONS = ("follow_up", "probe_mention", "next_topic", "wrap_up")
SIGNALS = ("strong", "solid", "partial", "weak", "no_answer")
LEVELS = ("strong", "solid", "developing", "not_shown")

_ROUND_GOAL = {
    "project": (
        "the project round. Find out whether the candidate really built and understands what the résumé claims, "
        "and whether that experience fits this job. Good ground: architecture, why they chose one tool over another, "
        "what they personally did, what broke and how they debugged it, testing, scale and trade-offs."
    ),
    "fundamentals": (
        "the fundamentals round. Find out whether the candidate understands the computer-science and language "
        "fundamentals this job depends on (for example OOP, data structures, databases, networking, concurrency, "
        "operating systems or language internals). Start from what they say they use and go as deep as their answers allow."
    ),
}

_VOICE = (
    "You are a warm, sharp senior engineer running a live technical interview out loud. "
    "Talk like a person: short plain sentences, no lists, no markdown, no headings. "
    "Ask exactly one question per turn. Never reveal or hint at the answer, never teach, never mention scores, "
    "and never gush. A short, specific acknowledgement of what they just said is enough, and vary it: "
    "do not open every reply with thanks or the candidate's name; often just react to the substance "
    "(\"Redis with a 30-second TTL, okay.\"). " + FAIRNESS
)

_DECISION_GUIDE = (
    "How to choose:\n"
    "- follow_up: stay on the current topic. Use it when the answer was vague or generic (ask for a concrete example or to walk you through it), "
    "when a claim needs checking (\"you said you optimised it, how did you measure that?\"), or when the answer was strong and a harder question would show real depth "
    "(why this over that, what breaks at scale, an edge case, how it works underneath).\n"
    "- probe_mention: the candidate named a technology, concept or experience that matters for this job and is not on the plan. "
    "Pick it up the way a person would (\"You mentioned Java there. How comfortable are you with object-oriented design?\"), and name it in new_topic.\n"
    "- next_topic: you have enough evidence on this topic, good or bad. Move to the next planned topic with a natural one-line bridge.\n"
    "- wrap_up: close the round in one or two warm sentences with no question.\n"
    "If the candidate says they do not know or is clearly lost, say that is fine, offer at most one simpler angle, then move on. Do not keep drilling. "
    "If the answer is off-topic or empty, steer back once with a narrower, rephrased question. Never repeat a question you have already asked: "
    "if they dodged it twice, that is your evidence, so move on. "
    "Match the difficulty to the answers: raise it after strong ones, ease it after weak ones."
)


def _topic_lines(state: dict) -> str:
    lines = []
    for index, topic in enumerate(state["topics"]):
        marker = "CURRENT" if topic["status"] == "current" else topic["status"]
        verdict = f" · so far: {topic['level']} ({topic['note']})" if topic.get("level") else ""
        lines.append(f"{index + 1}. [{marker}] {topic['skill']}: {topic['why']}{verdict}")
    return "\n".join(lines)


def _candidate_line(turn: dict) -> str:
    if turn.get("skipped"):
        return "[skipped this follow-up]"
    return str(turn.get("answer") or "")[:1500]


def _transcript(state: dict, limit: int = 8) -> str:
    turns = [t for t in state["turns"] if t.get("answer") is not None][-limit:]
    if not turns:
        return "(nothing yet)"
    return "\n\n".join(
        f"Interviewer ({state['topics'][t['topic']]['skill']}): {t['question']}\nCandidate: {_candidate_line(t)}" for t in turns
    )


def plan_round(profile: dict, section: str, topic_count: int, earlier_coverage: list[str]) -> dict:
    """Choose the skills to verify and write the opening line.

    The LLM picks the topics; the opening line is a hardcoded template
    that inserts the first topic's name. This saves one output field
    from the LLM and makes the round start instant.
    """

    def validate(data: dict) -> dict:
        topics = []
        for raw in data["topics"] if isinstance(data["topics"], list) else []:
            if not isinstance(raw, dict):
                continue
            skill = str(raw.get("skill", "")).strip()
            if skill:
                topics.append({"skill": skill, "why": str(raw.get("why", "")).strip(), "angle": str(raw.get("angle", "")).strip()})
        if not topics:
            raise ValueError("a plan needs at least one topic")
        return {"topics": topics[:topic_count]}

    covered = f"\nTopics already covered in earlier rounds (do NOT repeat these — pick different skills): {', '.join(earlier_coverage)}." if earlier_coverage else ""
    result = agent._json(
        _VOICE,
        agent._profile_context(profile)
        + f"\n\nYou are about to run {_ROUND_GOAL[section]}{covered}\n\n"
        f"Plan {topic_count} topics, each a skill or claim from the job description, the interviewer's criteria or the résumé that you need evidence on. "
        "After topic 1, order them by importance. Prefer requirements the résumé does not clearly prove. "
        "Do not plan any topic that overlaps with skills already covered above.\n\n"
        'Return JSON: {"topics": [{"skill": short name, "why": one sentence on what you want to learn, "angle": how you will open it}]}.',
        validate,
        temperature=0.6,
    )
    # Hardcoded opening line — the LLM picks the topics, we write the first sentence.
    first_skill = result["topics"][0]["skill"]
    if section == "project":
        result["opening"] = (
            f"Let's start with your projects. Can you walk me through {first_skill} "
            "— what you built, the tech you used, and what you personally did?"
        )
    else:
        result["opening"] = (
            f"Alright, let's switch to fundamentals. {first_skill} "
            "— can you explain how that works and how you've used it?"
        )
    return result


def next_turn(profile: dict, section: str, state: dict, answer: str, allowed: tuple[str, ...], turns_left: int, skipped: bool = False) -> dict:
    """Rate the latest answer and decide what the interviewer says next."""
    topic = state["topics"][state["current"]]
    question = state["turns"][-1]["question"]

    def validate(data: dict) -> dict:
        assessment = data["assessment"]
        signal = str(assessment.get("signal", "")).strip()
        verdict = data.get("topic_verdict") or {}
        level = str(verdict.get("level", "")).strip()
        decision = str(data["decision"]).strip()
        reply = str(data["reply"]).strip()
        if decision not in DECISIONS:
            raise ValueError(f"unknown decision {decision!r}")
        if not reply:
            raise ValueError("empty reply")
        return {
            "assessment": {
                "score": _score(assessment["score"]),
                "signal": signal if signal in SIGNALS else "partial",
                "strength": str(assessment.get("strength", "")).strip(),
                "improvement": str(assessment.get("improvement", "")).strip(),
                "role_relevance": str(assessment.get("role_relevance", "")).strip(),
            },
            "mentions": _strings(data.get("mentions"), 5),
            "topic_level": level if level in LEVELS else None,
            "topic_note": str(verdict.get("note", "")).strip(),
            "decision": decision,
            "new_topic": str(data.get("new_topic", "")).strip(),
            "reply": reply,
        }

    budget = (
        f"Turns left in this round after this one: {turns_left}. "
        f"Follow-ups already asked on the current topic: {state['follow_ups']}. "
        f"Allowed decisions right now: {', '.join(allowed)}."
    )
    if skipped:
        latest = (
            "The candidate answered: [skipped this follow-up]. "
            "They chose not to answer this follow-up. That is a skip, not a wrong answer and not an empty attempt.\n\n"
            "How to handle a skip:\n"
            "- Do not treat the skip as evidence they failed the topic, and do not ask the same thing again.\n"
            "- topic_verdict must reflect the answers they already gave on this topic, including any earlier follow-ups. "
            "A solid answer stays solid if they skip a later follow-up. Do not mark the topic not_shown only because they skipped.\n"
            "- Move on with one of the allowed decisions. One short line that leaving this question is fine, then the next question, or a close with no question.\n"
        )
        rating = "The skip is not scored. Set assessment.score to 0 and signal to no_answer; the app replaces that assessment.\n"
    else:
        latest = f"The candidate answered (may be a speech transcript; ignore transcription slips): {answer}\n\n{_DECISION_GUIDE}\n\n"
        rating = (
            "Rate only the latest answer from 0 to 100 against what you asked and what the job needs: 90+ exceptional and specific, "
            "70-89 solid, 50-69 partly right or vague, 30-49 weak, below 30 missing, wrong or off-topic.\n"
            "The assessment and topic_verdict are private notes for the recruiter, never read to the candidate. "
            + FOR_RECRUITER + "\n"
        )
    prompt = (
        agent._profile_context(profile)
        + f"\n\nYou are running {_ROUND_GOAL[section]}\n\nPlan:\n{_topic_lines(state)}\n\n"
        f"Conversation so far:\n{_transcript(state)}\n\n"
        f"Current topic: {topic['skill']}\nYou just asked: {question}\n{latest}"
        f"{budget}\n\n{rating}"
        'Return JSON: {"assessment": {"score": number, "signal": one of "strong", "solid", "partial", "weak", "no_answer", '
        '"strength": one sentence on what the candidate showed, quoting them where you can, '
        '"improvement": one sentence on what they left out that a strong answer would have included, '
        '"role_relevance": one sentence on how it maps to the job}, '
        '"mentions": array of technologies, concepts or claims they brought up that are worth checking, '
        '"topic_verdict": {"level": one of "strong", "solid", "developing", "not_shown", "note": one sentence of evidence on the current topic so far}, '
        '"decision": one of the allowed decisions, "new_topic": the skill name when the decision is probe_mention, otherwise "", '
        '"reply": exactly what you say next out loud: a brief acknowledgement, then one question (no question when wrapping up)}.'
    )
    result = agent._json(_VOICE, prompt, validate, max_tokens=700, temperature=0.5)
    if result["decision"] in allowed:
        return result
    correction = (
        f"\n\nYou chose {result['decision']}, which the budget does not allow right now. "
        f"Choose one of: {', '.join(allowed)}, and write the reply to match that choice."
    )
    return agent._json(_VOICE, prompt + correction, validate, max_tokens=700, temperature=0.3)


def rate_round(profile: dict, section: str, state: dict) -> dict:
    """Per-skill verdicts with evidence, written once the round closes."""

    def validate(data: dict) -> dict:
        skills = []
        for raw in data["skills"] if isinstance(data["skills"], list) else []:
            if not isinstance(raw, dict) or not str(raw.get("skill", "")).strip():
                continue
            level = str(raw.get("level", "")).strip()
            skills.append({
                "skill": str(raw["skill"]).strip(),
                "level": level if level in LEVELS else "developing",
                "rating": _score(raw["rating"]),
                "evidence": str(raw.get("evidence", "")).strip(),
            })
        summary = str(data["summary"]).strip()
        if not skills or not summary:
            raise ValueError("a verdict needs skills and a summary")
        return {"skills": skills, "summary": summary}

    return agent._json(
        "You are the lead interviewer writing up one round of a technical interview for the recruiter. Be fair, specific and evidence-based. "
        + FOR_RECRUITER + FAIRNESS,
        agent._profile_context(profile)
        + f"\n\nThis was {_ROUND_GOAL[section]}\n\nTopics covered:\n{_topic_lines(state)}\n\n"
        f"Full conversation:\n{_transcript(state, limit=40)}\n\n"
        "Rate each topic you actually discussed from 0 to 100 on how well the candidate showed that skill. "
        "Rate what they demonstrated, not what they claimed; follow-up answers count more than first impressions. "
        "If a turn says the candidate skipped a follow-up, that skip is not a wrong answer and is not a zero. "
        "Rate the skill from the answers they actually gave, including follow-ups they answered before the skip. "
        "Do not raise a skill for a point you never heard, and do not lower it only because a later follow-up was skipped. "
        'Return JSON: {"skills": [{"skill": short name, "level": one of "strong", "solid", "developing", "not_shown", '
        '"rating": number, "evidence": one or two sentences citing what they said and, below strong, what they did not show that a strong answer would have}], '
        '"summary": two sentences for the recruiter on what this round showed about the candidate for this job}.',
        validate,
        max_tokens=900,
        temperature=0.2,
    )
