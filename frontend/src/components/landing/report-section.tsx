import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { PlayOnView } from "@/components/landing/motion";
import { cx } from "@/lib/format";

const included = [
  "Round scores, and an overall score that averages the rounds completed",
  "A rating for each skill discussed, with the evidence behind it",
  "The submitted code, its test results, and its likely complexity",
  "Questions for a follow-up interview, aimed at what this one could not confirm",
  "Every camera and browser observation, listed for review",
];

const rounds = [
  { label: "Coding", score: 92 },
  { label: "Projects", score: 74 },
  { label: "Fundamentals", score: 68 },
];

type Level = "Strong" | "Solid" | "Developing";

const LEVEL_TONE: Record<Level, string> = {
  Strong: "bg-accent/10 text-accent",
  Solid: "bg-surface-2 text-ink",
  Developing: "bg-amber/10 text-amber",
};

const skills: { skill: string; level: Level; rating: number; evidence: React.ReactNode }[] = [
  {
    skill: "Caching and service design",
    level: "Strong",
    rating: 88,
    evidence:
      "You explained why pricing was the hot path and put one read-through cache in front of three services. You raised invalidation on price changes without being asked.",
  },
  {
    skill: "Performance measurement",
    level: "Solid",
    rating: 76,
    evidence: (
      <>
        You said the cache <mark className="claim-mark play-mark bg-transparent text-inherit">cut p95 latency by about 40 percent</mark>. Asked how
        you measured it, you compared a week of dashboard p95 before and after, and noted the traffic dip that week yourself. A strong answer would
        have compared like-for-like traffic or used a load test.
      </>
    ),
  },
  {
    skill: "Testing",
    level: "Developing",
    rating: 58,
    evidence: "You described checking the dashboard after release, but no tests before it. A strong answer would cover how stale prices are caught.",
  },
];

function ReportSheet() {
  return (
    <article className="play-sheet overflow-hidden rounded-[24px] bg-surface text-ink shadow-float">
      <header className="flex flex-wrap items-end gap-6 border-b border-line px-6 pb-6 pt-7 sm:px-8">
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-ink-3">Sample report · illustrative candidate</p>
          <p className="mt-2 font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">Priya Raman</p>
          <p className="mt-1 text-[14px] text-ink-2">Backend Engineer, Payments · Finished</p>
        </div>
        <div className="text-right">
          <p className="font-display text-[56px] font-semibold leading-none tracking-[-0.04em] tabular-nums">78</p>
          <p className="mt-1 text-[12.5px] text-ink-3">Overall</p>
        </div>
      </header>

      <dl className="grid grid-cols-3 divide-x divide-line border-b border-line">
        {rounds.map((round) => (
          <div key={round.label} className="px-6 py-4 sm:px-8">
            <dt className="text-[12.5px] text-ink-3">{round.label}</dt>
            <dd className="mt-1 font-display text-[24px] font-semibold tabular-nums">{round.score}</dd>
          </div>
        ))}
      </dl>

      <div className="px-6 py-6 sm:px-8">
        <p className="font-display text-[17px] font-semibold">Project round</p>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
          You designed the caching change well and were honest about how it was measured. Testing before release is the gap for this role.
        </p>
        <ul className="mt-4 divide-y divide-line">
          {skills.map((skill) => (
            <li key={skill.skill} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:gap-8">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
                  {skill.skill}
                  <span className={cx("rounded-md px-1.5 py-0.5 text-[12px] font-medium", LEVEL_TONE[skill.level])}>{skill.level}</span>
                </p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{skill.evidence}</p>
              </div>
              <span className="self-start font-display text-[18px] font-semibold tabular-nums">{skill.rating}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-6 border-t border-line bg-surface-2/50 px-6 py-6 sm:grid-cols-2 sm:px-8">
        <div>
          <p className="text-[13px] font-semibold">For a follow-up interview</p>
          <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-ink-2">
            <li>How would you verify the latency gain under the same traffic?</li>
            <li>How would a stale price be caught before a customer saw it?</li>
          </ul>
        </div>
        <div>
          <p className="text-[13px] font-semibold">Coding review</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
            11 of 11 hidden tests passed. Likely O(n) time against an O(n) target, labelled as an estimate.
          </p>
          <a href="#monitoring" className="mt-3 inline-block text-[13px] font-medium text-accent underline-offset-4 hover:underline">
            3 warnings in the monitoring log
          </a>
        </div>
      </div>
    </article>
  );
}

export function ReportSection() {
  return (
    <section id="report" className="scroll-mt-16 bg-field text-field-ink">
      <div className="mx-auto grid max-w-7xl items-start gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20 lg:py-32">
        <PlayOnView className="lg:sticky lg:top-28">
          <h2 className="play-rise text-balance font-display text-[36px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[52px]">
            A report that explains every score.
          </h2>
          <p className="play-rise mt-6 max-w-md text-[17px] leading-relaxed text-field-ink-2" style={{ "--d": "380ms" } as CSSProperties}>
            Every skill discussed gets a rating and the evidence for it, taken from what the candidate said. A round score averages those ratings, so a
            shaky first answer they recover from is not counted against them twice.
          </p>
          <ul className="mt-10 border-t border-field-line">
            {included.map((item, i) => (
              <li
                key={item}
                className="play-rise flex gap-3 border-b border-field-line py-3.5 text-[15px] leading-relaxed"
                style={{ "--i": i, "--d": "600ms" } as CSSProperties}
              >
                <Check className="mt-1 size-4 shrink-0 text-field-ink-2" strokeWidth={2.5} />
                {item}
              </li>
            ))}
          </ul>
        </PlayOnView>

        <PlayOnView>
          <ReportSheet />
        </PlayOnView>
      </div>
    </section>
  );
}
