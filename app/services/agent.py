"""The interview agent: one Hugging Face chat model that does every judgment in BNB.

It reads the candidate profile into a brief, writes the opening, project and
fundamentals questions, authors the coding problem for an interviewer posting,
scores each spoken answer, reviews the submitted code (Judge0 supplies the test
results), and writes the final report. Every judgment is written for the
recruiter, about the candidate, never to the candidate.

Every call asks for JSON so the output can be validated. There is no demo
fallback: if the model cannot answer, AgentUnavailable surfaces as HTTP 503.
"""
from __future__ import annotations

import json
import re
import time
from typing import Callable

from huggingface_hub import InferenceClient
from openai import OpenAI

from app.core.config import settings
from app.problems.model import Problem
from app.services.coding_author import materialize_coding_problem

FAIRNESS = (
    "Judge only the content and communication of what the candidate said or wrote. "
    "Never consider identity, appearance, accent, emotion or protected characteristics, and never make a hiring decision."
)
FOR_RECRUITER = (
    "The reader is the recruiter or hiring panel, not the candidate. Write about the candidate in the third person "
    "(the candidate, they), never as you, and never coach or encourage them. "
    "Say what they showed and what they left out: what a strong answer would have covered that theirs did not. "
)
_SECTION_FOCUS = {
    "project": "project questions grounded in the résumé: architecture, technology choices, personal contribution, debugging, testing and trade-offs",
    "fundamentals": "computer-science fundamentals the job description relies on",
    "general": "opening questions about fit for the role",
}


class AgentUnavailable(RuntimeError):
    """The model could not produce a usable answer."""


GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
PROVIDER_BENCH_SECONDS = 300.0
RATE_LIMIT_RETRIES = 2
MAX_RATE_LIMIT_WAIT_SECONDS = 30.0


def _rate_limit_wait(error: str) -> float | None:
    """Seconds to wait when the provider says we hit a per-minute limit; None for any other error."""
    if "429" not in error:
        return None
    groq = re.search(r"try again in (?:(\d+)h)?(?:(\d+)m)?(\d+(?:\.\d+)?)s", error)
    gemini = re.search(r"retryDelay['\"]?:\s*['\"](\d+(?:\.\d+)?)s", error)
    if groq:
        seconds = int(groq.group(1) or 0) * 3600 + int(groq.group(2) or 0) * 60 + float(groq.group(3))
    else:
        seconds = float(gemini.group(1)) if gemini else 10.0
    return min(seconds + 0.5, MAX_RATE_LIMIT_WAIT_SECONDS) if seconds <= MAX_RATE_LIMIT_WAIT_SECONDS else None


_JSON_OBJECT = re.compile(r"\{[\s\S]*\}")


def _as_text(value: object) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for part in value:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict):
                parts.append(str(part.get("text") or ""))
            else:
                parts.append(str(getattr(part, "text", "") or ""))
        return "".join(parts)
    return "" if value is None else str(value)


def _message_text(message: object) -> str:
    """Visible reply, or the reasoning channel when that is where the JSON landed."""
    content = _as_text(getattr(message, "content", None))
    if _JSON_OBJECT.search(content):
        return content
    reasoning = _as_text(getattr(message, "reasoning", None))
    if _JSON_OBJECT.search(reasoning):
        return reasoning
    return content


def _parse_json(text: str) -> dict:
    match = _JSON_OBJECT.search(text)
    if not match:
        raise ValueError("no JSON object in the reply")
    return json.loads(match.group(0))


def _clean_questions(raw: object, count: int) -> list[str]:
    if not isinstance(raw, list):
        return []
    questions = [re.sub(r"^\s*(?:\d+[.)]|[-*])\s*", "", str(q)).strip() for q in raw]
    return [q for q in questions if len(q) > 10][:count]


def _strings(value: object, limit: int = 6) -> list[str]:
    items = value if isinstance(value, list) else [value] if value else []
    return [str(x).strip() for x in items if str(x).strip()][:limit]


def _score(value: object) -> int:
    try:
        return max(0, min(100, round(float(value))))
    except (TypeError, ValueError):
        raise ValueError(f"score is not a number: {value!r}") from None


ChatClient = InferenceClient | OpenAI


def _openai_compatible(base_url: str, api_key: str) -> Callable[[], ChatClient]:
    # Retries are off so a failing provider hands over to the next one at once.
    return lambda: OpenAI(base_url=base_url, api_key=api_key, timeout=settings.agent_timeout_seconds, max_retries=0)


def _provider_settings() -> dict[str, tuple[str, Callable[[], ChatClient]] | None]:
    """Every provider BNB knows, as (model, client factory), or None when it has no key.

    Gemini and Groq use the OpenAI SDK: huggingface_hub cannot parse Gemini's error bodies
    and fails on its longer replies.
    """
    def huggingface() -> ChatClient:
        return InferenceClient(provider="auto", api_key=settings.huggingface_api_key, timeout=settings.agent_timeout_seconds)

    return {
        "huggingface": (settings.hf_chat_model, huggingface) if settings.huggingface_api_key else None,
        "gemini": (settings.gemini_model, _openai_compatible(GEMINI_BASE_URL, settings.gemini_api_key)) if settings.gemini_api_key else None,
        "groq": (settings.groq_model, _openai_compatible(GROQ_BASE_URL, settings.groq_api_key)) if settings.groq_api_key else None,
    }


class InterviewAgent:
    def __init__(self) -> None:
        self._clients: dict[str, ChatClient] = {}
        self._benched_until: dict[str, float] = {}
        self.last_model: str | None = None

    def _providers(self) -> list[tuple[str, str, ChatClient]]:
        """(name, model, client) in AGENT_PROVIDERS order, skipping providers without a key."""
        known = _provider_settings()
        providers = []
        for name in (part.strip().lower() for part in settings.agent_providers.split(",")):
            entry = known.get(name)
            if entry is None:
                continue
            model, connect = entry
            if name not in self._clients:
                self._clients[name] = connect()
            providers.append((name, model, self._clients[name]))
        if not providers:
            raise AgentUnavailable(
                "No interview agent is configured. List providers in AGENT_PROVIDERS and set their keys "
                "(HUGGINGFACE_API_KEY, GEMINI_API_KEY or GROQ_API_KEY) in .env, then restart the API."
            )
        return providers

    @property
    def model(self) -> str:
        """The model that answered last, or the first choice before any call."""
        if self.last_model:
            return self.last_model
        try:
            return self._providers()[0][1]
        except AgentUnavailable:
            return "not configured"

    def _chat(self, system: str, user: str, max_tokens: int, temperature: float, *, require_json: bool = False) -> str:
        """Try providers in priority order. A provider that fails sits out for a while so later calls skip it."""
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        errors: list[str] = []
        for attempt in range(RATE_LIMIT_RETRIES + 1):
            waits: list[float] = []
            providers = self._providers()
            now = time.monotonic()
            ready = [p for p in providers if self._benched_until.get(p[0], 0.0) <= now] or providers
            for name, model, client in ready:
                # gpt-oss spends max_tokens on hidden reasoning and then returns an empty reply.
                request = {"max_completion_tokens": max_tokens, "reasoning_effort": "low"} if name == "groq" else {"max_tokens": max_tokens}
                try:
                    response = client.chat.completions.create(model=model, messages=messages, temperature=temperature, **request)
                except Exception as exc:
                    errors.append(f"{name} ({model}): {exc}")
                    wait = _rate_limit_wait(str(exc))
                    if wait is not None:
                        waits.append(wait)
                    self._benched_until[name] = time.monotonic() + (wait if wait is not None else PROVIDER_BENCH_SECONDS)
                    continue
                text = _message_text(response.choices[0].message)
                if require_json and not _JSON_OBJECT.search(text):
                    errors.append(f"{name} ({model}): no JSON object in the reply")
                    continue
                self._benched_until.pop(name, None)
                self.last_model = model
                return text
            if not waits or attempt == RATE_LIMIT_RETRIES:
                break
            time.sleep(min(waits))
        raise AgentUnavailable("Every interview agent provider failed. " + " | ".join(errors[-len(self._providers()):]))

    def _json(self, system: str, user: str, validate, max_tokens: int = 900, temperature: float = 0.3):
        """Ask for JSON and validate it; one retry with a stricter reminder."""
        prompt = user
        for attempt in range(2):
            text = self._chat(system + " Reply with a single JSON object and nothing else.", prompt, max_tokens, temperature)
            try:
                return validate(_parse_json(text))
            except (ValueError, KeyError, TypeError, AttributeError) as exc:
                if attempt:
                    raise AgentUnavailable(f"The interview agent returned an unusable reply ({exc}). Try again.") from exc
                prompt = user + "\n\nYour previous reply was not valid JSON in the requested shape. Return only the JSON object."
        raise AssertionError("unreachable")

    @staticmethod
    def _profile_context(profile: dict) -> str:
        focus = profile.get("interview_focus") or "general technical assessment"
        goal = str(profile.get("preparation_goal") or "").strip()
        brief = profile.get("agent_brief")
        parts = [
            f"Role: {profile.get('role', '')}",
            f"Job description:\n{profile.get('job_description', '')}",
        ]
        # Once the agent has read the résumé into a brief, subsequent prompts
        # use the brief instead of the full résumé to cut token count.
        if brief:
            parts.append(f"Your earlier reading of this candidate:\n{json.dumps(brief, ensure_ascii=False)}")
        else:
            parts.append(f"Résumé:\n{profile.get('resume', '')}")
        # On a recruiter link the stored goal is a copy of the recruiter focus, not something the candidate said.
        if goal and goal != focus and not profile.get("interview_id"):
            parts.append(f"Candidate's goal: {goal}")
        parts += [f"Recruiter focus: {focus}", f"Difficulty: {profile.get('difficulty', 'medium')}"]
        posting = profile.get("interviewer_brief")
        if posting:
            parts.append(
                "The interviewer already read the job and set the criteria. Stay inside that reading:\n"
                + json.dumps(posting, ensure_ascii=False)
            )
        return "\n\n".join(parts)

    def read_profile(self, profile: dict) -> dict:
        def validate(data: dict) -> dict:
            brief = {key: _strings(data.get(key)) for key in ("key_requirements", "resume_highlights", "gaps_to_probe")}
            brief["summary"] = str(data["summary"]).strip()
            if not brief["summary"]:
                raise ValueError("empty summary")
            return brief

        return self._json(
            "You are the lead interviewer preparing a technical interview for a recruiter. " + FAIRNESS,
            self._profile_context(profile) + "\n\nRead everything above and return JSON with keys: "
            '"summary" (two sentences on who the candidate is relative to this role), '
            '"key_requirements" (array of short strings: the job\'s most important skills and responsibilities), '
            '"resume_highlights" (array of short strings: the résumé projects and skills most worth asking about), '
            '"gaps_to_probe" (array of short strings: requirements the résumé does not clearly show).',
            validate,
        )

    def _questions(self, profile: dict, section: str, count: int, instructions: str) -> list[str]:
        def validate(data: dict) -> list[str]:
            questions = _clean_questions(data["questions"], count)
            if not questions:
                raise ValueError("no questions")
            return questions

        return self._json(
            "You are the technical interviewer. Write questions a strong human interviewer would ask this specific candidate. " + FAIRNESS,
            self._profile_context(profile)
            + f"\n\nWrite exactly {count} {_SECTION_FOCUS.get(section, section)}. {instructions} "
            "Each question is one or two sentences, is asked aloud, and can be answered in about two minutes. "
            f'Return JSON: {{"questions": [{count} strings]}}.',
            validate,
            temperature=0.5,
        )

    def opening_questions(self, profile: dict, count: int = 3) -> list[str]:
        return self._questions(profile, "general", count, "Start with a short self-introduction question, then connect the résumé to the role.")

    def project_questions(self, profile: dict, count: int) -> list[str]:
        return self._questions(
            profile,
            "project",
            count,
            "Start with a concise self-introduction, then go deep on the résumé projects that matter most for this role. "
            "Use the job description and the interviewer's focus. Probe the gaps you noted.",
        )

    def fundamentals_questions(self, profile: dict, count: int) -> list[str]:
        title = str(profile.get("coding_problem_title") or "").strip()
        aside = f" The coding round already covers {title}, so ask different concepts." if title else ""
        return self._questions(
            profile,
            "fundamentals",
            count,
            "Pick concepts the job description and the interviewer's focus actually depend on "
            "(for example networking, databases, concurrency, operating systems or language internals). Match the difficulty."
            + aside,
        )

    def author_coding_problem(self, profile: dict) -> Problem:
        """Write one original coding problem. Expected outputs come from running its reference solution."""
        difficulty = profile.get("difficulty", "medium")
        instructions = (
            self._profile_context(profile)
            + "\n\nWrite one original coding problem for this interview's coding round. "
            f"Difficulty must be {difficulty}. "
            "It must be a normal data-structures and algorithms question in the style of LeetCode: "
            "arrays, strings, hash maps, two pointers, sliding window, stacks, binary search, trees, graphs, heaps, intervals, or dynamic programming. "
            "Do not reuse a famous problem or its title. "
            "Do not write a business workflow, document, contract, API, or anything whose data is JSON, objects, or key-value records. "
            "Stdin is plain text only: integers, space-separated numbers, or a single string. No braces and no quoted keys. "
            "Stdout is one integer, true or false, or space-separated integers. Not a JSON array and not an object.\n"
            "A good case looks like input \"4\\n2 7 11 15\\n9\" and the program prints \"0 1\".\n"
            "Return JSON with keys: "
            '"title" (short), "tags" (1 to 4 algorithm topics, never the word json), "description" (the full problem, at least two sentences, naming the inputs the way LeetCode does), '
            '"input_format", "output_format", "constraints" (array of short strings), "hints" (1 or 2 short strings that do not reveal the code), '
            '"expected_time" (big-O), "expected_space" (big-O), '
            '"reference_python" (a complete Python 3 program that reads stdin and prints the correct answer, with no json module), '
            '"starter_python" (the same input/output harness with the solution replaced by a stub that returns a wrong placeholder), '
            '"cases" (6 to 8 objects with "input", "hidden" (boolean), and optional "explanation"). '
            "At least two cases are visible (hidden=false) and at least two are hidden. "
            "Do not include expected outputs; the reference program is the source of truth. "
            "Each case input is a string whose line breaks are real newlines. "
            "The reference program must succeed on every case. Inputs must be small enough to finish in under a second."
        )
        prompt = instructions
        last_error = "unusable reply"
        for attempt in range(3):
            try:
                text = self._chat(
                    "You are a senior engineer writing a fair coding-interview problem. Reply with a single JSON object and nothing else.",
                    prompt,
                    max_tokens=6000,
                    temperature=0.4,
                    require_json=True,
                )
                return materialize_coding_problem(_parse_json(text), difficulty)
            except AgentUnavailable as exc:
                last_error = str(exc)
                if "no JSON object" not in last_error:
                    raise
            except (ValueError, KeyError, TypeError, AttributeError) as exc:
                last_error = str(exc)
            if attempt == 2:
                break
            reason = " ".join(last_error.split())[:180]
            prompt = instructions + f"\n\nThe previous problem was rejected: {reason}. Return a corrected JSON object only."
        raise AgentUnavailable(f"The interview agent could not prepare a coding problem ({last_error}). Try again.")

    def round_questions(self, profile: dict, round_name: str, count: int = 3) -> list[str]:
        return self._questions(profile, round_name, count, f"Write {round_name} interview questions for this role.")

    def critique(self, question: str, answer: str, profile: dict, section: str = "general") -> dict:
        def validate(data: dict) -> dict:
            return {
                "score": _score(data["score"]),
                "strength": str(data["strength"]).strip(),
                "improvement": str(data["improvement"]).strip(),
                "role_relevance": str(data.get("role_relevance", "")).strip(),
            }

        return self._json(
            "You are a fair, specific technical-interview judge writing notes for the recruiter. " + FOR_RECRUITER + FAIRNESS,
            self._profile_context(profile)
            + f"\n\nRound: {_SECTION_FOCUS.get(section, section)}\nQuestion: {question}\nCandidate's answer (may be a speech transcript): {answer}\n\n"
            "Score the answer from 0 to 100 against the question and the role: 90+ exceptional and specific, 70-89 solid, "
            "50-69 partially correct or vague, 30-49 weak, below 30 missing, wrong or off-topic. Speech-to-text slips are not errors. "
            'Return JSON: {"score": integer, "strength": one sentence on what the candidate showed, quoting them where you can, '
            '"improvement": one sentence on what they did not say that a strong answer would have included '
            '(for example: Did not mention how the cache is invalidated; a strong answer would cover TTLs or write-through), '
            '"role_relevance": one sentence on how well it maps to the job}.',
            validate,
            temperature=0.2,
        )

    def review_code(self, problem: Problem, language: str, code: str, judged: dict) -> dict:
        failures = sorted({r["status"] for r in judged["results"] if not r["passed"]})
        tests = f"{judged['passed']} of {judged['total']} tests passed on Judge0."
        if judged["compile_error"]:
            tests += f" Compilation failed: {judged['compile_error'][:800]}"
        elif failures:
            tests += f" Failure types: {', '.join(failures)}."

        def validate(data: dict) -> dict:
            return {
                "time_complexity": str(data["time_complexity"]).strip(),
                "space_complexity": str(data["space_complexity"]).strip(),
                "approach": str(data["approach"]).strip(),
                "meets_target": bool(data["meets_target"]),
                "complexity_feedback": str(data["complexity_feedback"]).strip(),
                "code_quality_feedback": str(data["code_quality_feedback"]).strip(),
            }

        return self._json(
            "You are a senior engineer reviewing a candidate's coding-interview solution for the hiring panel. " + FOR_RECRUITER + "Be precise and brief.",
            f"Problem: {problem.title}\n{problem.description}\nTarget: {problem.expected_time} time, {problem.expected_space} space.\n"
            f"Language: {language}\nTest results: {tests}\n\nCode:\n```\n{code[:12000]}\n```\n\n"
            "Work out the real time and space complexity from the code, not from its comments. "
            'Return JSON: {"time_complexity": big-O string, "space_complexity": big-O string, "approach": a short phrase, '
            '"meets_target": true if the time complexity is as good as the target, '
            '"complexity_feedback": one or two sentences on the complexity the candidate reached against the target, '
            '"code_quality_feedback": one or two sentences on correctness, edge cases and readability, naming what a strong solution would have handled that this one did not}.',
            validate,
            temperature=0.1,
        )

    def final_report(self, profile: dict, answers: list[dict], round_scores: dict, dsa: dict | None) -> dict:
        def line(answer: dict) -> str:
            section = answer.get("section", "general")
            question = answer["question"]
            if answer.get("skipped"):
                return (
                    f"[{section}] Q: {question}\nA: [skipped this follow-up]\n"
                    "Not scored. Rate the answers they gave on this topic, including earlier follow-ups."
                )
            feedback = answer["feedback"]
            return (
                f"[{section}] Q: {question}\nA: {answer['answer'][:1500]}\n"
                f"Score {feedback['score']}. Showed: {feedback.get('strength', '')} Missing: {feedback.get('improvement', '')}"
            )

        transcript = "\n\n".join(line(answer) for answer in answers) or "No spoken answers."
        coding = "No coding round."
        if dsa and dsa.get("evaluation"):
            ev = dsa["evaluation"]
            coding = f"{dsa.get('title')} in {dsa.get('language')}: {ev['tests_passed']}/{ev['tests_total']} tests, {ev['time_complexity']} time (target {ev['expected_time_complexity']}). {ev['code_quality_feedback']}"

        def validate(data: dict) -> dict:
            comm = data["communication_assessment"]
            summary = str(data["summary"]).strip()
            if not summary:
                raise ValueError("empty summary")
            return {
                "summary": summary,
                "communication_assessment": {key: str(comm.get(key, "")).strip() for key in ("clarity", "answer_structure", "evidence")},
                "strengths": _strings(data.get("strengths"), 4),
                "gaps": _strings(data.get("gaps"), 5),
                "follow_up_questions": _strings(data.get("follow_up_questions"), 4),
            }

        return self._json(
            "You are the lead interviewer writing the hiring panel's report on this candidate. Be honest, specific and evidence-based. "
            + FOR_RECRUITER + FAIRNESS,
            self._profile_context(profile)
            + f"\n\nRound scores: {json.dumps(round_scores)}\nCoding round: {coding}\n\nSpoken answers:\n{transcript}\n\n"
            'Return JSON: {"summary": three sentences for the recruiter on what the candidate demonstrated against this role\'s requirements, '
            '"communication_assessment": {"clarity": sentence about the candidate, "answer_structure": sentence, "evidence": sentence}, '
            '"strengths": 2 to 4 short points, each citing what the candidate actually said or wrote, '
            '"gaps": 2 to 5 short points on what they did not show: what they left out, got wrong or could have said, '
            "each naming what a strong answer would have included (for example: Did not say how they measured the speed-up; a strong answer would give before and after numbers), "
            '"follow_up_questions": 2 to 4 questions a human interviewer could ask next to check those gaps}.',
            validate,
            max_tokens=1400,
        )

    def transcribe_audio(self, audio_bytes: bytes) -> str:
        if not settings.huggingface_api_key:
            raise AgentUnavailable("HUGGINGFACE_API_KEY is required for speech transcription")
        client = InferenceClient(api_key=settings.huggingface_api_key, timeout=settings.agent_timeout_seconds)
        try:
            result = client.automatic_speech_recognition(audio_bytes, model="openai/whisper-large-v3-turbo")
        except Exception as exc:
            raise AgentUnavailable(f"Speech transcription failed: {exc}") from exc
        return getattr(result, "text", None) or (result["text"] if isinstance(result, dict) else str(result))


agent = InterviewAgent()
