import { cx, difficultyLabel, sectionStatusLabel } from "@/lib/format";
import type { Difficulty, SectionStatus } from "@/lib/types";

export type Tone = "neutral" | "accent" | "amber" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  accent: "bg-accent-soft text-accent border-transparent",
  amber: "bg-amber-soft text-amber border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

const difficultyTone: Record<Difficulty, Tone> = { easy: "accent", medium: "amber", hard: "danger" };

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return <Badge tone={difficultyTone[difficulty]}>{difficultyLabel[difficulty]}</Badge>;
}

const statusTone: Record<SectionStatus, Tone> = { not_started: "neutral", in_progress: "amber", completed: "accent", skipped: "neutral" };

export function StatusBadge({ status }: { status: SectionStatus }) {
  return (
    <Badge tone={statusTone[status]}>
      {status === "in_progress" && <span className="size-1.5 rounded-full bg-current animate-pulse-dot" />}
      {sectionStatusLabel[status]}
    </Badge>
  );
}
