"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { CodingPreview } from "@/components/admin/coding-preview";
import { InterviewerGate } from "@/components/admin/interviewer-gate";
import { Scoreboard } from "@/components/admin/scoreboard";
import { PageError, PageLoading } from "@/components/page-state";
import { SiteHeader } from "@/components/site-header";
import { DifficultyBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useUser } from "@/lib/auth";
import { useHydrated } from "@/lib/use-hydrated";
import { useLoad } from "@/lib/use-load";

function Board({ id }: { id: string }) {
  const interview = useLoad(() => api.interview(id), id);
  const attempts = useLoad(() => api.attempts(id), `${id}:attempts`);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const path = interview.data?.path ?? "";
  // Board renders only after hydration, so window is available.
  const link = path ? `${window.location.origin}${path}` : "";

  if (interview.error && !interview.data) return <PageError message={interview.error} onRetry={interview.reload} />;
  if (!interview.data) return <PageLoading label="Loading the scoreboard" />;
  const scored = (attempts.data ?? []).map((row) => row.overall_score).filter((score): score is number => score !== null);
  const average = scored.length ? Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length) : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    window.setTimeout(() => setCopied("idle"), 2000);
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm text-ink-3">Scoreboard</p>
          <h1 className="mt-1 font-display text-4xl font-semibold text-ink">{interview.data.role}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <DifficultyBadge difficulty={interview.data.difficulty} />
            <span className="text-sm text-ink-2">{interview.data.attempt_count} started</span>
            {average !== null && <span className="text-sm text-ink-2">Average {average}</span>}
            <span className="text-[12px] text-ink-3">
              Created {new Date(interview.data.created_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={copy}>
            {copied === "copied" ? "Copied" : copied === "failed" ? "Copy the link below" : "Copy link"}
          </Button>
          <Button variant="ghost" onClick={() => { interview.reload(); attempts.reload(); }}>Refresh</Button>
        </div>
      </div>
      <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-ink-2">{interview.data.summary}</p>
      <p className="mt-2 break-all font-mono text-[13px] text-ink-3">{link}</p>

      <div className="mt-10">
        {attempts.error && !attempts.data && <PageError message={attempts.error} onRetry={attempts.reload} />}
        {!attempts.data && !attempts.error && <PageLoading label="Loading attempts" />}
        {attempts.data && <Scoreboard attempts={attempts.data} />}
      </div>

      {interview.data.coding_problem && <CodingPreview problem={interview.data.coding_problem} />}
    </>
  );
}

export default function InterviewBoardPage() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const ready = useHydrated();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-24 pt-14 sm:px-8">
        {!ready && <PageLoading label="Loading the scoreboard" />}
        {ready && user?.role !== "admin" && <InterviewerGate next={`/admin/interviews/${id}`} />}
        {ready && user?.role === "admin" && <Board id={id} />}
      </main>
    </>
  );
}
