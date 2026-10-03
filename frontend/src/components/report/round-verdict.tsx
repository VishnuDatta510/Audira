import { cx } from "@/lib/format";
import type { InterviewerMove, RoundVerdict, SkillLevel } from "@/lib/types";

const LEVEL_LABELS: Record<SkillLevel, string> = {
  strong: "Strong",
  solid: "Solid",
  developing: "Developing",
  not_shown: "Not shown",
};

const LEVEL_TONES: Record<SkillLevel, string> = {
  strong: "bg-accent/10 text-accent",
  solid: "bg-surface-2 text-ink",
  developing: "bg-amber/10 text-amber",
  not_shown: "bg-danger-soft text-danger",
};

export function turnLabel(kind: InterviewerMove | "opening" | undefined): string | null {
  switch (kind) {
    case "follow_up":
      return "Follow-up";
    case "probe_mention":
      return "Picked up from their answer";
    case "next_topic":
      return "New topic";
    case "opening":
    case "wrap_up":
    case undefined:
      return null;
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export function RoundVerdictCard({ verdict }: { verdict: RoundVerdict }) {
  if (verdict.skills.length === 0) {
    return (
      <p className="mt-4 text-[13px] text-ink-3">
        The interviewer could not write per-skill ratings for this round, so its score is the average of the candidate&apos;s answers.
      </p>
    );
  }
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-5">
      <p className="text-[15px] leading-relaxed text-ink-2">{verdict.summary}</p>
      <ul className="mt-4 divide-y divide-line">
        {verdict.skills.map((skill, index) => (
          <li key={`${index}-${skill.skill}`} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:gap-6">
            <div>
              <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink">
                {skill.skill}
                <span className={cx("rounded-md px-1.5 py-0.5 text-[12px] font-medium", LEVEL_TONES[skill.level])}>
                  {LEVEL_LABELS[skill.level]}
                </span>
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{skill.evidence}</p>
            </div>
            <span className="self-start font-mono text-[15px] text-ink">{skill.rating}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
