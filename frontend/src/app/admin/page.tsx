"use client";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { AudiraMark } from "@/components/brand";
import { trackPointer } from "@/lib/pointer";
import { InterviewerGate } from "@/components/admin/interviewer-gate";
import { SiteHeader } from "@/components/site-header";
import { PageError, PageLoading } from "@/components/page-state";
import { LinkButton } from "@/components/ui/button";
import { DifficultyBadge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { hasRole, useUser } from "@/lib/auth";
import { useHydrated } from "@/lib/use-hydrated";
import { useLoad } from "@/lib/use-load";

function InterviewList({ canPublish }: { canPublish: boolean }) {
  const { data, error, reload } = useLoad(() => api.interviews(), "interviews");
  if (error && !data) return <PageError message={error} onRetry={reload} />;
  if (!data) return <PageLoading label="Loading interviews" />;
  if (!data.length) {
    return (
      <div className="rise mt-12 flex flex-col items-center rounded-3xl border border-dashed border-line-strong px-6 py-16 text-center">
        <AudiraMark live className="size-14 animate-pop" />
        <p className="mt-6 font-display text-xl font-semibold text-ink">No interviews yet</p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-2">
          {canPublish
            ? "The first one takes the job description and the criteria you want the agent to follow."
            : "When a recruiter on your team publishes one, it shows up here."}
        </p>
        {canPublish && (
          <LinkButton href="/admin/new" className="mt-6">
            <Plus className="size-4" />
            New interview
          </LinkButton>
        )}
      </div>
    );
  }
  return (
    <ul className="mt-12 space-y-3">
      {data.map((interview, i) => (
        <li key={interview.id} className="rise" style={{ "--i": i } as React.CSSProperties}>
          <Link
            href={`/admin/interviews/${interview.id}`}
            onPointerMove={trackPointer}
            className="spotlight group flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-5 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.04)] transition-[transform,box-shadow,border-color] duration-500 ease-expo hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift sm:px-6"
          >
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold text-ink transition-colors duration-300 group-hover:text-accent">{interview.role}</p>
              <p className="mt-1 line-clamp-2 text-sm text-ink-2">{interview.summary || interview.interview_focus}</p>
            </div>
            <DifficultyBadge difficulty={interview.difficulty} />
            <div className="text-right text-sm text-ink-2">
              <p>{interview.attempt_count} {interview.attempt_count === 1 ? "attempt" : "attempts"}</p>
              <p className="text-[12px] text-ink-3">
                {new Date(interview.created_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
            <ArrowRight className="size-4 -translate-x-1 text-ink-3 opacity-0 transition-[transform,opacity,color] duration-500 ease-expo group-hover:translate-x-0 group-hover:text-accent group-hover:opacity-100" />
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
            {ready && user?.workspace && (
              <p className="rise mb-3 text-[12px] font-medium uppercase tracking-wide text-ink-3">{user.workspace.name}</p>
            )}
            <h1 className="font-display text-[44px] font-semibold leading-none tracking-[-0.03em] text-ink">Interviews</h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2">
              {ready && hasRole(user, "viewer") && !hasRole(user, "recruiter")
                ? "Every interview your team publishes, with its scoreboard and each candidate's report."
                : "Publish a job description. The interview agent writes the coding problem and the spoken rounds, then you share one link."}
            </p>
          </div>
          {ready && hasRole(user, "recruiter") && (
            <LinkButton href="/admin/new" className="group">
              <Plus className="size-4 transition-transform duration-500 ease-spring group-hover:rotate-90" />
              New interview
            </LinkButton>
          )}
        </div>
        {!ready && <PageLoading label="Loading interviews" />}
        {ready && !hasRole(user, "viewer") && <InterviewerGate next="/admin" />}
        {ready && hasRole(user, "viewer") && <InterviewList canPublish={hasRole(user, "recruiter")} />}
      </main>
    </>
  );
}
