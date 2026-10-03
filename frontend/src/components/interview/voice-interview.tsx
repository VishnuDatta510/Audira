"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SpokenAnswer } from "@/components/interview/spoken-answer";
import { PageError, PageLoading } from "@/components/page-state";
import { Button, LinkButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";
import { QuestionSpeaker, type SpeakResult } from "@/lib/question-voice";
import type { ConversationTurn, InterviewerMove, VoiceSectionId } from "@/lib/types";

type Props = {
  sessionId: string;
  section: VoiceSectionId;
};

function sectionTitle(section: VoiceSectionId): string {
  switch (section) {
    case "project":
      return "Project round";
    case "fundamentals":
      return "Fundamentals round";
    default: {
      const unreachable: never = section;
      return unreachable;
    }
  }
}

function voiceNote(result: SpeakResult | "idle"): string | null {
  switch (result) {
    case "blocked":
      return "Press Hear it so the interviewer can speak.";
    case "fallback":
      return "Cartesia was unavailable, so the browser voice is speaking.";
    case "failed":
      return "The question is on screen, but voice playback failed.";
    case "played":
    case "cancelled":
    case "idle":
      return null;
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

function Transcript({ turns }: { turns: ConversationTurn[] }) {
  if (turns.length === 0) return null;
  return (
    <ol className="mt-8 max-w-3xl space-y-5 border-l border-line pl-5" aria-label="Conversation so far">
      {turns.map((turn, index) => (
        <li key={index} className="text-[15px] leading-7">
          <p className="text-ink-2">
            <span className="mr-2 text-[12px] font-medium uppercase tracking-wide text-ink-3">Interviewer</span>
            {turn.question}
          </p>
          <p className="mt-1.5 text-ink">
            <span className="mr-2 text-[12px] font-medium uppercase tracking-wide text-ink-3">You</span>
            {turn.skipped ? "Skipped" : turn.answer}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function VoiceInterview({ sessionId, section }: Props) {
  const router = useRouter();
  const speakerRef = useRef<QuestionSpeaker | null>(null);
  const currentRef = useRef<HTMLDivElement | null>(null);
  const generation = useRef(0);
  const [question, setQuestion] = useState<string | null>(null);
  const [kind, setKind] = useState<InterviewerMove | "opening">("opening");
  const [topic, setTopic] = useState("");
  const [history, setHistory] = useState<ConversationTurn[]>([]);
  const [answer, setAnswer] = useState("");
  const [closing, setClosing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState<SpeakResult | "idle">("idle");
  const [attempt, setAttempt] = useState(0);
  const acceptTranscript = useCallback((text: string) => setAnswer(text), []);
  const acceptListening = useCallback((value: boolean) => setListening(value), []);
  const complete = closing !== null;

  function speaker() {
    speakerRef.current ??= new QuestionSpeaker(sessionId);
    return speakerRef.current;
  }

  useEffect(() => {
    let cancelled = false;
    api
      .startVoiceSection(sessionId, section)
      .then((data) => {
        if (cancelled) return;
        setQuestion(data.question);
        setKind(data.kind);
        setTopic(data.topic);
        setHistory(data.history);
        setLoading(false);
      })
      .catch((loadError: Error) => {
        if (!cancelled) {
          setError(loadError.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, section, attempt]);

  useEffect(() => {
    function block(e: Event) {
      e.preventDefault();
    }
    document.addEventListener("contextmenu", block);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", block);
    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
    };
  }, []);

  useEffect(() => {
    if (!question) return;
    currentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const current = speaker();
    const gen = ++generation.current;
    void current.ask(question, {
      onStart: () => {
        if (gen === generation.current) setSpeaking(true);
      },
      onEnd: () => {
        if (gen === generation.current) setSpeaking(false);
      },
    }).then((result) => {
      if (gen === generation.current) setVoice(result);
    });
    return () => {
      current.stop();
    };
    // speaker() is stable for this session via the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, sessionId]);

  function retry() {
    setLoading(true);
    setError(null);
    setAttempt((n) => n + 1);
  }

  function hear() {
    if (!question) return;
    const current = speaker();
    current.unlock();
    const gen = ++generation.current;
    setVoice("idle");
    void current.ask(question, {
      onStart: () => {
        if (gen === generation.current) setSpeaking(true);
      },
      onEnd: () => {
        if (gen === generation.current) setSpeaking(false);
      },
    }).then((result) => {
      if (gen === generation.current) setVoice(result);
    });
  }

  async function send(text: string, skipped: boolean) {
    if (!question || sending || complete) return;
    if (skipped ? kind !== "follow_up" : text === "") return;
    const current = speaker();
    current.unlock();
    current.stop();
    setSpeaking(false);
    setSending(true);
    setError(null);
    try {
      const result = await api.answer(sessionId, text, skipped);
      setHistory((turns) => [...turns, { question, answer: text, topic, skipped }]);
      setAnswer("");
      setKind(result.kind);
      setTopic(result.topic);
      if (result.complete || !result.next_question) {
        setClosing(result.closing ?? "That's the end of this round.");
        setQuestion(null);
        return;
      }
      setQuestion(result.next_question);
    } catch (sendError) {
      setError(sendError instanceof ApiError ? sendError.message : skipped ? "Could not skip the question." : "Could not send the answer.");
    } finally {
      setSending(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void send(answer.trim(), false);
  }

  async function endEarly() {
    if (!window.confirm("Are you sure you want to end the interview early? Unfinished sections will be marked as skipped.")) return;
    setSending(true);
    setError(null);
    const current = speaker();
    current.unlock();
    current.stop();
    setSpeaking(false);
    try {
      await api.endEarly(sessionId);
      router.push(`/session/${sessionId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not end the interview.");
      setSending(false);
    }
  }

  if (loading && !question) return <PageLoading label="The interviewer is getting ready" />;
  if (error && !question && !complete) return <PageError message={error} onRetry={retry} />;

  const note = voiceNote(voice);
  const status = sending ? "The interviewer is thinking" : speaking ? "The interviewer is speaking" : listening ? "Listening" : null;

  return (
    <main id="assessment-workspace" className="min-h-full px-6 py-8 lg:px-10" data-voice={voice}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-3">{sectionTitle(section)}</p>
        {!complete && (
          <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft hover:text-danger-strong" onClick={() => void endEarly()} disabled={sending}>
            End interview
          </Button>
        )}
      </div>
      {topic && !complete ? (
        <p className="mt-2 text-sm text-ink-2">
          Now discussing <span className="font-medium text-ink">{topic}</span>
        </p>
      ) : null}

      <Transcript turns={history} />

      <div ref={currentRef} className="mt-8 max-w-3xl scroll-mt-6">
        <p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">Interviewer</p>
        <h1 className="mt-2 font-display text-[26px] font-semibold leading-snug text-ink">{complete ? closing : question}</h1>
        {status ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-ink-2" role="status" aria-live="polite">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
            {status}
          </p>
        ) : null}
      </div>

      {complete ? (
        <div className="mt-8 max-w-xl">
          <p className="text-[15px] leading-7 text-ink-2">
            This round is over and your answers are saved. Go back to the interview map for the next round.
          </p>
          <LinkButton className="mt-5" href={`/session/${sessionId}`}>
            Back to the interview map
          </LinkButton>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={hear} disabled={!question || sending} aria-busy={speaking}>
              {speaking ? "Speaking…" : "Hear it"}
            </Button>
            {note ? <p className="text-sm text-ink-2">{note}</p> : null}
          </div>
          <form className="mt-8 max-w-3xl" onSubmit={(event) => void submit(event)}>
            <SpokenAnswer
              sessionId={sessionId}
              epoch={question ?? ""}
              disabled={sending}
              onTranscript={acceptTranscript}
              onListeningChange={acceptListening}
            />
            <label htmlFor="voice-answer" className="mt-4 block text-sm font-medium text-ink">
              Your answer
            </label>
            <Textarea
              id="voice-answer"
              className="mt-2"
              value={answer}
              readOnly={listening || sending}
              placeholder={
                listening
                  ? "Listening. Your words will show up here."
                  : "Answer the way you would in a real interview. Speak or type; the interviewer may follow up on what you say."
              }
              onChange={(event) => setAnswer(event.target.value)}
            />
            {error ? <p className="mt-2 text-[13px] text-danger">{error}</p> : null}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="submit" loading={sending} disabled={answer.trim() === ""}>
                {sending ? "Sending" : "Send answer"}
              </Button>
              {kind === "follow_up" ? (
                <Button type="button" variant="ghost" onClick={() => void send("", true)} disabled={sending}>
                  Skip question
                </Button>
              ) : null}
            </div>
          </form>
        </>
      )}
    </main>
  );
}
