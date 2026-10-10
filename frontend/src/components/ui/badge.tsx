import { cx, difficultyLabel, sectionStatusLabel } from "@/lib/format";
import type { Difficulty, SectionStatus } from "@/lib/types";

export type Tone = "neutral" | "accent" | "amber" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  accent: "bg-accent-soft text-accent border-accent/15",
  amber: "bg-amber-soft text-amber border-amber/15",
  danger: "bg-danger-soft text-danger border-danger/15",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors duration-300", tones[tone], className)}>
      {children}
    </span>
  );
}

const difficultyTone: Record<Difficulty, Tone> = { easy: "accent", medium: "amber", hard: "danger" };
const difficultyBars: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <Badge tone={difficultyTone[difficulty]}>
      <span className="flex h-2.5 items-end gap-[2px]" aria-hidden>
        {[0.45, 0.72, 1].map((h, i) => (
          <span key={i} className={cx("w-[3px] rounded-full bg-current", i >= difficultyBars[difficulty] && "opacity-25")} style={{ height: `${h * 100}%` }} />
        ))}
      </span>
      {difficultyLabel[difficulty]}
    </Badge>
  );
}

const statusTone: Record<SectionStatus, Tone> = { not_started: "neutral", in_progress: "amber", completed: "accent", skipped: "neutral" };

export function StatusBadge({ status }: { status: SectionStatus }) {
  return (
    <Badge tone={statusTone[status]}>
      {status === "in_progress" && <span className="ripple size-1.5 rounded-full bg-current" />}
      {status === "completed" && (
        <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
          <path d="M2.5 6.3 5 8.6 9.5 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="draw-check" />
        </svg>
      )}
      {sectionStatusLabel[status]}
    </Badge>
  );
}
