"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { followUpSteps, type FollowUpStep, type Turn } from "@/components/landing/content";
import { PlayOnView, SplitWords } from "@/components/landing/motion";
import { cx } from "@/lib/format";

function ClaimText({ turn, animate, markDelay }: { turn: Turn; animate: boolean; markDelay: number }) {
  const at = turn.claim ? turn.text.indexOf(turn.claim) : -1;
  if (!turn.claim || at < 0) return turn.text;
  return (
    <>
      {turn.text.slice(0, at)}
      <mark
        className={cx("claim-mark bg-transparent text-inherit", animate && "mark-in")}
        data-on={animate ? undefined : ""}
        style={{ "--md": `${markDelay}ms` } as CSSProperties}
      >
        {turn.claim}
      </mark>
      {turn.text.slice(at + turn.claim.length)}
    </>
  );
}

function TranscriptCard({ step, animate }: { step: FollowUpStep; animate: boolean }) {
  return (
    <div className="rounded-[24px] border border-line bg-bg p-5 shadow-lift sm:p-7">
      <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink-3">
        <span className="size-1.5 rounded-full bg-accent" />
        {step.round}
      </p>
      <div className="mt-5 space-y-4">
        {step.turns.map((turn, i) => (
          <div key={i} className={animate ? "turn-in" : undefined} style={{ "--i": i } as CSSProperties}>
            {turn.speaker === "interviewer" ? (
              <p className="font-display text-[19px] font-medium leading-snug text-ink sm:text-[21px]">
                {turn.move && (
                  <span className="mr-2 inline-block translate-y-[-2px] rounded-md bg-accent-soft px-1.5 py-0.5 align-middle font-sans text-[12px] font-medium text-accent">
                    {turn.move}
                  </span>
                )}
                {turn.text}
              </p>
            ) : (
              <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink-2">
                <ClaimText turn={turn} animate={animate} markDelay={i * 420 + 500} />
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FollowUps() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    function update() {
      const mid = window.innerHeight / 2;
      let best = 0;
      let bestDist = Infinity;
      stepRefs.current.forEach((el, i) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const dist = Math.abs((rect.top + rect.bottom) / 2 - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      setActive(best);
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const goTo = (i: number) => stepRefs.current[i]?.scrollIntoView({ block: "center" });

  return (
    <section id="how-it-asks" className="scroll-mt-16 border-t border-line bg-surface">
      <div className="mx-auto max-w-7xl px-5 pb-16 pt-24 sm:px-8 lg:pb-24 lg:pt-32">
        <PlayOnView className="max-w-3xl">
          <h2 className="text-balance font-display text-[36px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[52px]">
            <SplitWords text="It follows the answer, not a script." />
          </h2>
          <p className="play-rise mt-6 max-w-[38rem] text-[17px] leading-relaxed text-ink-2" style={{ "--d": "380ms" } as CSSProperties}>
            The project and fundamentals rounds are a conversation. The interviewer decides what to ask next from what the candidate just said, one
            question at a time. Scores stay off the screen until the report.
          </p>
        </PlayOnView>

        <div className="mt-14 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
          <div>
            {followUpSteps.map((step, i) => (
              <div
                key={step.title}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                data-step={i}
                className="border-t border-line py-10 first:border-t-0 lg:flex lg:min-h-[44svh] lg:flex-col lg:last:min-h-[44svh] lg:justify-center lg:border-t-0 lg:py-0"
              >
                <h3
                  className={cx(
                    "font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] transition-colors duration-500 sm:text-[32px]",
                    active === i ? "text-ink" : "text-ink lg:text-ink-3",
                  )}
                >
                  {step.title}
                </h3>
                <p
                  className={cx(
                    "mt-4 max-w-md text-[16px] leading-relaxed transition-colors duration-500",
                    active === i ? "text-ink-2" : "text-ink-2 lg:text-ink-3",
                  )}
                >
                  {step.body}
                </p>
                <div className="mt-8 lg:hidden">
                  <TranscriptCard step={step} animate={false} />
                </div>
              </div>
            ))}
          </div>

          <div className="hidden lg:block">
            <div className="sticky top-16 flex h-[calc(100svh-4rem)] flex-col justify-center">
              <TranscriptCard key={active} step={followUpSteps[active]} animate />
              <div className="mt-6 flex gap-2" role="tablist" aria-label="Interviewer behaviours">
                {followUpSteps.map((step, i) => (
                  <button
                    key={step.title}
                    type="button"
                    role="tab"
                    aria-selected={active === i}
                    aria-label={step.title}
                    onClick={() => goTo(i)}
                    className="group flex h-6 flex-1 items-center"
                  >
                    <span
                      className={cx(
                        "h-1 w-full rounded-full transition-colors duration-500",
                        active === i ? "bg-accent" : "bg-line group-hover:bg-line-strong",
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
