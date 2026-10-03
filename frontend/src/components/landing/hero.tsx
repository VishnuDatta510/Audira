"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { HomeActions } from "@/components/home-actions";
import { heroExchange, type Turn } from "@/components/landing/content";
import { useReducedMotion, VoiceBars } from "@/components/landing/motion";
import { VoiceField } from "@/components/landing/voice-field";
import { cx } from "@/lib/format";

type Phase = "asking" | "answering" | "choosing" | "holding" | "clearing";

type Frame = { msg: number; words: number; phase: Phase; claim: boolean; delay: number };

const PHASE_LEVEL: Record<Phase, number> = { asking: 1, answering: 0.55, choosing: 0.22, holding: 0.14, clearing: 0.08 };

function buildFrames(turns: Turn[]): { frames: Frame[]; initial: number; final: number } {
  const frames: Frame[] = [{ msg: 0, words: 0, phase: "asking", claim: false, delay: 500 }];
  let claim = false;
  let initial = 0;
  turns.forEach((turn, msg) => {
    const words = turn.text.split(" ");
    const phase: Phase = turn.speaker === "interviewer" ? "asking" : "answering";
    const base = turn.speaker === "interviewer" ? 105 : 150;
    words.forEach((word, i) => {
      frames.push({ msg, words: i + 1, phase, claim, delay: base + word.length * 14 + (word.endsWith(",") || word.endsWith(".") ? 180 : 0) });
    });
    if (turn.claim) {
      claim = true;
      frames.push({ msg, words: words.length, phase: "choosing", claim, delay: 1900 });
    } else {
      frames.push({ msg, words: words.length, phase: turn.speaker === "interviewer" ? "answering" : "holding", claim, delay: 900 });
    }
    if (msg === 0) initial = frames.length - 1;
  });
  const last = turns.length - 1;
  const fullWords = turns[last].text.split(" ").length;
  frames.push({ msg: last, words: fullWords, phase: "holding", claim, delay: 4200 });
  const final = frames.length - 1;
  frames.push({ msg: last, words: fullWords, phase: "clearing", claim, delay: 800 });
  return { frames, initial, final };
}

const TIMELINE = buildFrames(heroExchange);

function Words({ words, shown, start = 0 }: { words: string[]; shown: number; start?: number }) {
  return words.map((word, i) => (
    <span key={`${start + i}-${word}`}>
      <span className="word" data-hidden={start + i >= shown ? "" : undefined}>
        {word}
      </span>
      {i < words.length - 1 ? " " : null}
    </span>
  ));
}

function TurnText({ turn, shown, claimOn }: { turn: Turn; shown: number; claimOn: boolean }) {
  const words = turn.text.split(" ");
  if (!turn.claim) return <Words words={words} shown={shown} />;
  const claimWords = turn.claim.split(" ");
  const at = words.findIndex((_, i) => words.slice(i, i + claimWords.length).join(" ") === turn.claim);
  if (at < 0) return <Words words={words} shown={shown} />;
  const end = at + claimWords.length;
  return (
    <>
      <Words words={words.slice(0, at)} shown={shown} />{" "}
      <mark className="claim-mark bg-transparent text-inherit" data-on={claimOn ? "" : undefined}>
        <Words words={words.slice(at, end)} shown={shown} start={at} />
      </mark>
      {end < words.length ? " " : null}
      <Words words={words.slice(end)} shown={shown} start={end} />
    </>
  );
}

function StatusPill({ phase }: { phase: Phase }) {
  switch (phase) {
    case "asking":
      return (
        <span className="flex items-center gap-2 text-[12.5px] font-medium text-accent">
          <VoiceBars on count={4} className="h-3.5" />
          Asking aloud
        </span>
      );
    case "answering":
      return (
        <span className="flex items-center gap-2 text-[12.5px] font-medium text-amber">
          <span className="size-2 rounded-full bg-amber animate-pulse-dot" />
          Listening
        </span>
      );
    case "choosing":
      return <span className="text-[12.5px] font-medium text-ink-2">Choosing the next question</span>;
    case "holding":
    case "clearing":
      return <span className="text-[12.5px] font-medium text-ink-3">Answer saved</span>;
    default: {
      const unreachable: never = phase;
      return unreachable;
    }
  }
}

function InterviewStage({ frame }: { frame: Frame }) {
  const listening = frame.phase === "answering" && heroExchange[frame.msg]?.speaker === "candidate";
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-line bg-surface shadow-float">
      <div className="flex h-12 items-center gap-3 border-b border-line px-5 sm:px-6">
        <span className="font-display text-[14px] font-semibold text-ink">Project round</span>
        <span className="hidden text-[13px] text-ink-3 sm:inline">Checkout pricing service</span>
        <span className="ml-auto" aria-hidden>
          <StatusPill phase={frame.phase} />
        </span>
      </div>

      <div
        className={cx(
          "space-y-5 px-5 py-6 transition-opacity duration-700 sm:px-8 sm:py-8 min-[56.25rem]:py-6 lg:py-8",
          frame.phase === "clearing" ? "opacity-0" : "opacity-100",
        )}
      >
        {heroExchange.map((turn, m) => {
          const shown = m < frame.msg ? Number.POSITIVE_INFINITY : m === frame.msg ? frame.words : 0;
          const started = shown > 0;
          const dim = m < frame.msg - 1 && !turn.claim;
          return (
            <div
              key={m}
              className={cx(
                "transition-[opacity,filter] duration-700 ease-expo",
                !started && "opacity-0",
                started && dim && "opacity-70",
              )}
            >
              {turn.speaker === "interviewer" ? (
                <p className="font-display text-[20px] font-medium leading-snug text-ink sm:text-[23px] min-[56.25rem]:text-[20px] lg:text-[23px]">
                  {turn.move && (
                    <span className="mr-2 inline-block translate-y-[-2px] rounded-md bg-accent-soft px-1.5 py-0.5 align-middle font-sans text-[12px] font-medium text-accent">
                      {turn.move}
                    </span>
                  )}
                  <TurnText turn={turn} shown={shown} claimOn={frame.claim} />
                </p>
              ) : (
                <div className="rounded-2xl border border-line bg-bg px-4 py-3.5 text-[15px] leading-relaxed text-ink-2 sm:px-5">
                  <TurnText turn={turn} shown={shown} claimOn={frame.claim} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 border-t border-line bg-surface-2/60 px-5 py-3 sm:px-6" aria-hidden>
        <span
          className={cx(
            "flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors duration-300",
            listening ? "bg-amber-soft text-amber" : "border border-line-strong bg-surface text-ink-2",
          )}
        >
          <Mic className="size-4" />
          {listening ? "Stop speaking" : "Speak answer"}
          {listening && <VoiceBars on count={5} className="ml-1 h-3.5" />}
        </span>
        <span className="hidden text-[12.5px] text-ink-3 sm:inline min-[56.25rem]:hidden xl:inline">The transcript stays editable</span>
        <span
          className={cx(
            "ml-auto flex h-9 items-center whitespace-nowrap rounded-lg px-3.5 text-[13px] font-medium transition-colors duration-300",
            frame.phase === "choosing" || frame.phase === "holding" ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-3",
          )}
        >
          Submit answer
        </span>
      </div>
    </div>
  );
}

export function Hero() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(TIMELINE.initial);
  const [playing, setPlaying] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let inView = false;
    const update = () => setPlaying(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    observer.observe(el);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    if (!playing || reduced) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % TIMELINE.frames.length), TIMELINE.frames[index].delay);
    return () => window.clearTimeout(id);
  }, [index, playing, reduced]);

  const frame = TIMELINE.frames[reduced ? TIMELINE.final : index];

  return (
    <section className="relative isolate overflow-hidden">
      <VoiceField level={PHASE_LEVEL[frame.phase]} className="absolute inset-x-0 bottom-0 -z-10 h-28 w-full min-[56.25rem]:h-[19%]" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-36 pt-12 sm:px-8 min-[56.25rem]:min-h-[calc(100svh-4rem)] min-[56.25rem]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] min-[56.25rem]:gap-10 min-[56.25rem]:pb-20 min-[56.25rem]:pt-8 lg:gap-16 lg:pb-32 lg:pt-10">
        <div>
          <h1 className="text-balance font-display text-[42px] font-semibold leading-[1.02] tracking-[-0.035em] text-ink sm:text-[54px] min-[56.25rem]:text-[41px] lg:text-[54px] xl:text-[64px]">
            The technical interview that asks the <span className="claim-mark hero-mark bg-transparent">second question.</span>
          </h1>
          <p className="mt-6 max-w-[34rem] text-pretty text-[17px] leading-relaxed text-ink-2 sm:text-lg min-[56.25rem]:text-[16px] lg:mt-7 lg:text-lg">
            Publish one job and share one link.{" "}
            <span className="hidden sm:inline">
              Each candidate solves a coding problem against hidden tests, then talks through their résumé with an interviewer that follows up, checks
              claims, and knows when to move on.{" "}
            </span>
            You read a report that explains every score.
          </p>
          <HomeActions className="mt-8 lg:mt-10" sampleHref="#report" />
        </div>

        <div ref={stageRef} className="relative">
          <InterviewStage frame={frame} />
          <p className="mt-4 px-2 text-[13px] leading-relaxed text-ink-3 min-[56.25rem]:hidden lg:block">
            A sample exchange. Questions are read aloud and stay on screen; the candidate speaks or types, and edits the transcript before it is scored.
          </p>
        </div>
      </div>
    </section>
  );
}
