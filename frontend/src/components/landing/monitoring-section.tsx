import type { CSSProperties } from "react";
import { observationLog } from "@/components/landing/content";
import { PlayOnView } from "@/components/landing/motion";
import { cx } from "@/lib/format";

const rules = [
  "One continuous condition is one warning, however long it lasts.",
  "A glance at the keyboard waits several seconds before it counts.",
  "Speaking an answer is expected, so mouth movement never adds a warning.",
  "Five warnings lock the round. Each one tells the candidate what was observed.",
];

function countedTone(counted: string): string {
  if (counted.startsWith("Warning")) return "bg-amber-soft text-amber";
  if (counted === "Kept for review") return "bg-accent-soft text-accent";
  return "bg-surface-2 text-ink-3";
}

export function MonitoringSection() {
  return (
    <section id="monitoring" className="scroll-mt-16">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20 lg:py-32">
        <PlayOnView>
          <h2 className="play-rise text-balance font-display text-[34px] font-semibold leading-[1.06] tracking-[-0.03em] text-ink sm:text-[46px]">
            It records what happened. A person decides what it means.
          </h2>
          <p className="play-rise mt-6 max-w-md text-[17px] leading-relaxed text-ink-2" style={{ "--d": "450ms" } as CSSProperties}>
            The camera and browser note a missing face, a second person, a phone, leaving the tab or full screen, and eyes held off the screen.
            Nothing here decides that someone cheated.
          </p>
          <ul className="mt-9 space-y-3">
            {rules.map((rule, i) => (
              <li
                key={rule}
                className="play-rise flex gap-3 text-[15px] leading-relaxed text-ink"
                style={{ "--i": i, "--d": "650ms" } as CSSProperties}
              >
                <span className="mt-[0.6em] h-px w-4 shrink-0 bg-ink-3" />
                {rule}
              </li>
            ))}
          </ul>
        </PlayOnView>

        <PlayOnView>
          <div className="overflow-hidden rounded-[24px] border border-line bg-surface shadow-lift">
            <div className="flex h-12 items-center border-b border-line px-5 sm:px-6">
              <span className="font-display text-[14px] font-semibold text-ink">Monitoring log</span>
              <span className="ml-auto text-[12.5px] text-ink-3">Sample session</span>
            </div>
            <ol className="divide-y divide-line">
              {observationLog.map((row, i) => (
                <li
                  key={row.at}
                  className="play-line grid grid-cols-[auto_1fr] items-baseline gap-x-5 gap-y-1.5 px-5 py-4 sm:grid-cols-[auto_1fr_auto] sm:px-6"
                  style={{ "--i": i } as CSSProperties}
                >
                  <span className="font-mono text-[12.5px] tabular-nums text-ink-3">{row.at}</span>
                  <span className="text-[14.5px] text-ink">{row.what}</span>
                  <span
                    className={cx(
                      "col-start-2 justify-self-start rounded-md px-1.5 py-0.5 text-[12px] font-medium sm:col-start-auto sm:justify-self-end",
                      countedTone(row.counted),
                    )}
                  >
                    {row.counted}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </PlayOnView>
      </div>
    </section>
  );
}
