"use client";

import Link from "next/link";
import { InterviewerGate } from "@/components/admin/interviewer-gate";
import { SiteHeader } from "@/components/site-header";
import { PageError, PageLoading } from "@/components/page-state";
import { LinkButton } from "@/components/ui/button";
import { DifficultyBadge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useUser } from "@/lib/auth";
import { useHydrated } from "@/lib/use-hydrated";
import { useLoad } from "@/lib/use-load";

function InterviewList() {
  const { data, error, reload } = useLoad(() => api.interviews(), "interviews");
  if (error && !data) return <PageError message={error} onRetry={reload} />;
  if (!data) return <PageLoading label="Loading interviews" />;
  if (!data.length) {
    return (
      <div className="mt-12 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <p className="font-display text-xl font-semibold text-ink">No interviews yet</p>
        <p className="mt-2 text-sm text-ink-2">The first one takes the job description and the criteria you want the agent to follow.</p>
      </div>
    );
  }
  return (
    <ul className="mt-12 divide-y divide-line border-y border-line">
      {data.map((interview) => (
        <li key={interview.id}>
          <Link href={`/admin/interviews/${interview.id}`} className="flex flex-wrap items-center gap-4 py-5 hover:bg-surface-2/60">
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold text-ink">{interview.role}</p>
              <p className="mt-1 line-clamp-2 text-sm text-ink-2">{interview.summary || interview.interview_focus}</p>
            </div>
            <DifficultyBadge difficulty={interview.difficulty} />
            <div className="text-right text-sm text-ink-2">
              <p>{interview.attempt_count} {interview.attempt_count === 1 ? "attempt" : "attempts"}</p>
              <p className="text-[12px] text-ink-3">
                {new Date(interview.created_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function AdminHome() {
  const user = useUser();
  const ready = useHydrated();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-24 pt-14 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-semibold text-ink">Interviews</h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2">
              Publish a job description. The interview agent writes the coding problem and the spoken rounds, then you share one link.
            </p>
          </div>
          {user?.role === "admin" && <LinkButton href="/admin/new">New interview</LinkButton>}
        </div>
        {!ready && <PageLoading label="Loading interviews" />}
        {ready && user?.role !== "admin" && <InterviewerGate next="/admin" />}
        {ready && user?.role === "admin" && <InterviewList />}
      </main>
    </>
  );
}
