"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Play } from "lucide-react";
import { codeLines, codeSamples, type CodeToken } from "@/components/landing/content";
import { usePlayOnView } from "@/components/landing/motion";
import { cx } from "@/lib/format";

const LINE_LENGTHS = codeLines.map((line) => line.reduce((n, token) => n + token.text.length, 0));
const LINE_OFFSETS = LINE_LENGTHS.map((_, i) => LINE_LENGTHS.slice(0, i).reduce((sum, n) => sum + n + 1, 0));
const TOKEN_OFFSETS = codeLines.map((line) => line.map((_, ti) => line.slice(0, ti).reduce((n, token) => n + token.text.length, 0)));
const TOTAL_CHARS = LINE_LENGTHS.reduce((sum, n) => sum + n + 1, 0);
const DONE = codeSamples.length + 1;

const TONE: Record<NonNullable<CodeToken["tone"]>, string> = {
  kw: "text-accent font-semibold",
  fn: "text-ink font-semibold",
  str: "text-amber",
  num: "text-amber",
  cm: "text-ink-3 italic",
};

function TypedCode({ chars, typing }: { chars: number; typing: boolean }) {
  return (
    <pre className="overflow-x-auto font-mono text-[12px] leading-[1.8] text-ink sm:text-[13px]">
      {codeLines.map((line, li) => {
        const left = chars - LINE_OFFSETS[li];
        const caretHere = typing && left >= 0 && left <= LINE_LENGTHS[li];
        return (
          <div key={li} className="flex">
            <span className="w-8 shrink-0 select-none pr-4 text-right text-ink-3/70 tabular-nums">{li + 1}</span>
            <code className="whitespace-pre">
              {line.map((token, ti) => {
                const text = token.text.slice(0, Math.max(0, left - TOKEN_OFFSETS[li][ti]));
                return text ? (
                  <span key={ti} className={token.tone ? TONE[token.tone] : undefined}>
                    {text}
                  </span>
                ) : null;
              })}
              {caretHere && <span className="ml-px inline-block h-[1.1em] w-[2px] translate-y-[0.2em] bg-accent animate-pulse-dot" />}
            </code>
          </div>
        );
      })}
    </pre>
  );
}

export function CodingDemo({ className }: { className?: string }) {
  const [ref, play] = usePlayOnView<HTMLDivElement>("0px 0px -25% 0px");
  const [typed, setTyped] = useState(0);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (play !== "playing") return;
    const timers: number[] = [];
    let chars = 0;
    const typer = window.setInterval(() => {
      chars = Math.min(TOTAL_CHARS, chars + 5);
      setTyped(chars);
      if (chars < TOTAL_CHARS) return;
      window.clearInterval(typer);
      for (let i = 1; i <= DONE; i++) {
        timers.push(window.setTimeout(() => setStep(i), 500 + i * 450 + (i === DONE ? 500 : 0)));
      }
    }, 22);
    return () => {
      window.clearInterval(typer);
      timers.forEach(window.clearTimeout);
    };
  }, [play]);

  const chars = play === "static" ? TOTAL_CHARS : play === "armed" ? 0 : typed;
  const shownStep = play === "static" ? DONE : play === "armed" ? 0 : step;
  const typing = chars < TOTAL_CHARS;
  const running = !typing && shownStep < DONE;

  return (
    <div ref={ref} className={cx("overflow-hidden rounded-[24px] border border-line bg-surface shadow-float", className)}>
      <div className="flex h-12 items-center gap-3 border-b border-line px-4 sm:px-5">
        <span className="truncate font-display text-[14px] font-semibold text-ink">Longest Substring Without Repeats</span>
        <span className="hidden rounded-full bg-amber-soft px-2 py-0.5 text-[11.5px] font-medium text-amber sm:inline">Medium</span>
        <span className="ml-auto hidden h-8 items-center gap-2 rounded-md border border-line px-3 text-[12.5px] font-medium text-ink sm:flex" aria-hidden>
          Python 3 <ChevronDown className="size-3.5 text-ink-3" />
        </span>
        <span className="rounded-md bg-amber-soft px-2 py-1 font-mono text-[12px] font-medium tabular-nums text-amber sm:ml-0">31:08</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
        <div className="border-b border-line p-5 md:border-b-0 md:border-r sm:p-6">
          <p className="text-[14px] leading-relaxed text-ink-2">
            Given a string <code className="rounded border border-line bg-surface-2 px-1 font-mono text-[12px] text-ink">s</code>, print the length of the longest
            substring that contains no repeated characters.
          </p>
          <div className="mt-5 space-y-2">
            {codeSamples.slice(0, 2).map((sample, i) => (
              <div key={sample.input} className="rounded-lg bg-surface-2 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-ink-2">
                <p className="text-ink-3">Example {i + 1}</p>
                <p>
                  <span className="text-ink-3">in </span> {sample.input}
                </p>
                <p>
                  <span className="text-ink-3">out</span> {sample.output}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[13px] leading-relaxed text-ink-3">Starter code already reads stdin. Hidden tests run on submit.</p>
        </div>

        <div className="flex min-h-[380px] min-w-0 flex-col">
          <div className="flex-1 px-3 py-5 sm:px-4">
            <TypedCode chars={chars} typing={typing && play === "playing"} />
          </div>

          <div className="border-t border-line bg-surface-2/50 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
                <Play className="size-3.5" /> Run samples
              </span>
              {running && <span className="text-[12.5px] text-ink-3">Running in the sandbox…</span>}
            </div>
            <ul className="mt-3 space-y-1.5 font-mono text-[12px]">
              {codeSamples.map((sample, i) => {
                const done = shownStep > i;
                return (
                  <li
                    key={sample.input}
                    className={cx("flex items-center gap-3 transition-opacity duration-500", done ? "opacity-100" : "opacity-30")}
                  >
                    <span className={cx("grid size-4 place-items-center rounded-full", done ? "bg-accent-soft text-accent" : "bg-line text-transparent")}>
                      <Check className="size-2.5" strokeWidth={3.5} />
                    </span>
                    <span className="w-24 truncate text-ink-2">{sample.input}</span>
                    <span className="text-ink">→ {sample.output}</span>
                    <span className="ml-auto tabular-nums text-ink-3">{done ? `${sample.ms} ms` : "—"}</span>
                  </li>
                );
              })}
            </ul>
            <div
              className={cx(
                "mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-3 transition-[opacity,filter,transform] duration-700 ease-expo",
                shownStep >= DONE ? "opacity-100 blur-0" : "translate-y-1 opacity-0 blur-[4px]",
              )}
            >
              <span className="font-display text-[17px] font-semibold text-accent">Accepted</span>
              <span className="text-[13px] text-ink-2">11 of 11 hidden tests passed</span>
              <span className="w-full text-[12.5px] text-ink-3 sm:ml-auto sm:w-auto">Likely O(n) time against an O(n) target · estimate</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
