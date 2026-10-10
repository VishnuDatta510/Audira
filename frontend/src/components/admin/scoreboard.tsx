"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { VoiceLoader } from "@/components/brand";
import { cx } from "@/lib/format";
import type { Attempt, AttemptStatus } from "@/lib/types";

const STATUS_LABEL: Record<AttemptStatus, string> = {
  joined: "Joined",
  in_progress: "In progress",
  finished: "Finished",
  stopped: "Stopped",
};

function statusLabel(status: AttemptStatus): string {
  switch (status) {
    case "joined":
    case "in_progress":
    case "finished":
    case "stopped":
      return STATUS_LABEL[status];
    default: {
      const unexpected: never = status;
      return unexpected;
    }
  }
}

const STATUS_DOT: Record<AttemptStatus, string> = {
  joined: "bg-line-strong",
  in_progress: "ripple bg-amber text-amber",
  finished: "bg-accent",
  stopped: "bg-danger",
};

function ScoreCell({ value }: { value: number | null }) {
  if (value === null) return <span className="font-mono text-sm text-ink-3">—</span>;
  return (
    <span className="flex min-w-16 flex-col gap-1.5">
      <span className="font-mono text-sm tabular-nums text-ink">{value}</span>
      <span className="h-1 w-14 overflow-hidden rounded-full bg-surface-2">
        <span className="bar-fill block h-full rounded-full bg-accent/70" style={{ width: `${value}%` }} />
      </span>
    </span>
  );
}

function score(value: number | null) {
  return value === null ? "—" : String(value);
}

function when(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function Scoreboard({ attempts }: { attempts: Attempt[] }) {
  if (!attempts.length) {
    return (
      <div className="rise flex flex-col items-center rounded-3xl border border-dashed border-line-strong px-6 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <VoiceLoader className="h-5" />
        </span>
        <p className="mt-5 font-display text-xl font-semibold text-ink">No one has started yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-2">
          Share the interview link. After a candidate signs in and begins, their name, round scores, and report appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-lift">
      <table className="w-full min-w-180 text-left">
        <thead>
          <tr className="border-b border-line bg-surface-2/50 text-[12px] font-medium text-ink-3">
            <th className="px-4 py-3 font-medium">#</th>
            <th className="px-4 py-3 font-medium">Candidate</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Coding</th>
            <th className="px-4 py-3 font-medium">Projects</th>
            <th className="px-4 py-3 font-medium">Fundamentals</th>
            <th className="px-4 py-3 font-medium">Overall</th>
            <th className="px-4 py-3 font-medium" />
          </tr>
        </thead>
        <tbody>
          {attempts.map((attempt, i) => (
            <tr key={attempt.session_id} className="rise group border-b border-line transition-colors duration-300 last:border-0 hover:bg-surface-2/50" style={{ "--i": i } as React.CSSProperties}>
              <td className="px-4 py-4">
                <span
                  className={cx(
                    "grid size-7 place-items-center rounded-full font-display text-[13px] font-semibold tabular-nums",
                    attempt.rank === 1 && attempt.overall_score !== null ? "bg-field-mark/20 text-amber" : "text-ink-3",
                  )}
                >
                  {attempt.rank}
                </span>
              </td>
              <td className="px-4 py-4">
                <Link href={`/report/${attempt.session_id}`} className="text-sm font-medium text-ink hover:text-accent hover:underline">
                  {attempt.name}
                </Link>
                <p className="text-[13px] text-ink-3">{attempt.email}</p>
                <p className="text-[12px] text-ink-3">{when(attempt.started_at)}</p>
              </td>
              <td className="px-4 py-4 text-sm text-ink-2">
                <span className="inline-flex items-center gap-2">
                  <span className={cx("size-1.5 rounded-full", STATUS_DOT[attempt.status])} />
                  {statusLabel(attempt.status)}
                </span>
              </td>
              <td className="px-4 py-4">
                <ScoreCell value={attempt.scores.dsa} />
              </td>
              <td className="px-4 py-4">
                <ScoreCell value={attempt.scores.project} />
              </td>
              <td className="px-4 py-4">
                <ScoreCell value={attempt.scores.fundamentals} />
              </td>
              <td className="px-4 py-4 font-display text-2xl font-semibold tabular-nums text-ink">{score(attempt.overall_score)}</td>
              <td className="px-4 py-4 text-right">
                <Link
                  href={`/report/${attempt.session_id}`}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-medium text-accent transition-colors hover:bg-accent-soft"
                >
                  Report
                  <ArrowRight className="size-3.5 transition-transform duration-500 ease-expo group-hover:translate-x-0.5" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
