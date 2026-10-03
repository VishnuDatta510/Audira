"use client";

import Link from "next/link";
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
      <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <p className="font-display text-xl font-semibold text-ink">No one has started yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-2">
          Share the interview link. After a candidate signs in and begins, their name, round scores, and report appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-180 text-left">
        <thead>
          <tr className="border-b border-line text-[12px] font-medium uppercase tracking-wide text-ink-3">
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
          {attempts.map((attempt) => (
            <tr key={attempt.session_id} className="border-b border-line last:border-0">
              <td className="px-4 py-4 font-mono text-sm text-ink-3">{attempt.rank}</td>
              <td className="px-4 py-4">
                <Link href={`/report/${attempt.session_id}`} className="text-sm font-medium text-ink hover:text-accent hover:underline">
                  {attempt.name}
                </Link>
                <p className="text-[13px] text-ink-3">{attempt.email}</p>
                <p className="text-[12px] text-ink-3">{when(attempt.started_at)}</p>
              </td>
              <td className="px-4 py-4 text-sm text-ink-2">{statusLabel(attempt.status)}</td>
              <td className="px-4 py-4 font-mono text-sm text-ink">{score(attempt.scores.dsa)}</td>
              <td className="px-4 py-4 font-mono text-sm text-ink">{score(attempt.scores.project)}</td>
              <td className="px-4 py-4 font-mono text-sm text-ink">{score(attempt.scores.fundamentals)}</td>
              <td className="px-4 py-4 font-display text-2xl font-semibold text-ink">{score(attempt.overall_score)}</td>
              <td className="px-4 py-4 text-right">
                <Link href={`/report/${attempt.session_id}`} className="text-[13px] font-medium text-accent hover:underline">
                  Report
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
