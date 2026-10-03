"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleAlert, FileText } from "lucide-react";
import { PageError, PageLoading } from "@/components/page-state";
import { Brand } from "@/components/site-header";
import { StatusBadge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { api } from "@/lib/api";
import { difficultyLabel, formatClock } from "@/lib/format";
import { useLoad } from "@/lib/use-load";
import { useSessionProctor } from "@/components/session/session-frame";
import type { SectionId, SessionSummary } from "@/lib/types";

const SECTIONS: { id: SectionId; title: string; body: string }[] = [
  { id: "dsa", title: "Coding round", body: "One timed problem in the editor. Run the samples freely; submitting runs the hidden tests too." },
  { id: "project", title: "Project questions", body: "Spoken questions about the projects on your résumé: architecture, decisions, debugging and testing." },
  { id: "fundamentals", title: "Fundamentals", body: "Spoken questions on the core concepts this role depends on." },
];

function sectionHref(sessionId: string, section: SectionId) {
  return section === "dsa" ? `/session/${sessionId}/dsa` : `/session/${sessionId}?section=${section}`;
}

function detail(summary: SessionSummary, section: SectionId): string | null {
  const status = summary.sections[section];
  const score = summary.round_scores[section];
  if (status === "completed" && score !== undefined) return `Score ${score}`;
  if (status === "completed" && summary.recruiter_session) return "Answers saved";
  if (section === "dsa" && summary.dsa && !summary.dsa.submitted) return `${formatClock(summary.dsa.seconds_left)} left on ${summary.dsa.title}`;
  if (section === "dsa" && status === "not_started") return `${difficultyLabel[summary.difficulty]}, ${summary.dsa_duration_minutes} minutes`;
  if (summary.voice_progress?.section === section) return `In progress: talking about ${summary.voice_progress.topic}`;
  return null;
}

export function SessionDashboard({ sessionId }: { sessionId: string }) {
  const { data: summary, error, reload, setData } = useLoad(() => api.session(sessionId), sessionId);
  const proctor = useSessionProctor();
  const [skipping, setSkipping] = useState<SectionId | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error && !summary) return <PageError message={error} onRetry={reload} />;
  if (!summary) return <PageLoading label="Loading your interview" />;

  const finished = Object.values(summary.sections).filter((s) => s === "completed" || s === "skipped").length;
  const allDone = finished === SECTIONS.length;

  async function skip(section: SectionId) {
    setSkipping(section);
    setActionError(null);
    try {
      setData(await api.skipSection(sessionId, section));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not skip the section.");
    } finally {
      setSkipping(null);
    }
  }

  async function endEarly() {
    if (!window.confirm("Are you sure you want to end the interview early? Unfinished sections will be marked as skipped.")) return;
    setActionError(null);
    try {
      setData(await api.endEarly(sessionId));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not end the interview.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 pb-20 pt-6 lg:px-10">
      <div className="flex items-center justify-between">
        <Brand />
        {!summary.recruiter_session && (
          <Link href={`/report/${sessionId}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink">
            <FileText className="size-4" />
            Report so far
          </Link>
        )}
      </div>

      <div className="mt-12">
        <p className="text-sm text-ink-3">{summary.candidate_name}</p>
        <h1 className="mt-1 font-display text-[34px] font-semibold leading-tight text-ink">Interview for {summary.role}</h1>
        <div className="mt-5 flex items-center gap-3">
          <div className="h-1.5 w-48 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(finished / SECTIONS.length) * 100}%` }} />
          </div>
          <span className="text-[13px] text-ink-2">
            {finished} of {SECTIONS.length} rounds finished
          </span>
        </div>
      </div>

      {summary.disqualified && (
        <div className="mt-8 flex gap-3 rounded-xl bg-danger-soft p-4 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          This session was locked after {summary.warning_limit} monitoring warnings.{" "}
          {summary.recruiter_session ? "The recruiter will see what was observed." : "The report lists what was observed."}
        </div>
      )}
      {!summary.disqualified && summary.warnings > 0 && (
        <p className="mt-8 text-[13px] text-amber">
          {summary.warnings} of {summary.warning_limit} monitoring warnings recorded. The session locks at {summary.warning_limit}.
        </p>
      )}

      <ol className="mt-10 divide-y divide-line rounded-2xl border border-line bg-surface">
        {SECTIONS.map((section, i) => {
          const status = summary.sections[section.id];
          const open = !summary.disqualified && (status === "not_started" || status === "in_progress");
          const note = detail(summary, section.id);
          return (
            <li key={section.id} className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line-strong font-display text-sm font-semibold text-ink-2">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="font-display text-lg font-semibold text-ink">{section.title}</h2>
                  <StatusBadge status={status} />
                </div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{section.body}</p>
                {note && <p className="mt-2 text-[13px] font-medium text-ink">{note}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">
                {open && status === "not_started" && !summary.recruiter_session && (
                  <Button variant="ghost" size="sm" onClick={() => skip(section.id)} loading={skipping === section.id}>
                    Skip
                  </Button>
                )}
                {open && section.id === "dsa" && !proctor.running ? (
                  <Button size="sm" onClick={() => void proctor.start()} loading={proctor.starting}>
                    Enable camera and mic
                  </Button>
                ) : null}
                {open && (section.id !== "dsa" || proctor.running) && (
                  <LinkButton href={sectionHref(sessionId, section.id)} size="sm">
                    {status === "in_progress" ? "Resume" : "Start"}
                  </LinkButton>
                )}
                {section.id === "dsa" && status === "completed" && (
                  <LinkButton href={sectionHref(sessionId, "dsa")} variant="secondary" size="sm">
                    Review
                  </LinkButton>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {actionError && <p className="mt-3 text-[13px] text-danger">{actionError}</p>}

      {allDone && summary.recruiter_session && (
        <div className="mt-8 rounded-2xl bg-accent-soft px-6 py-5">
          <p className="font-display text-lg font-semibold text-ink">Interview complete</p>
          <p className="mt-0.5 text-sm text-ink-2">Your answers and code went to the recruiter who shared this link. You can close this tab.</p>
        </div>
      )}
      {allDone && !summary.recruiter_session && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-accent-soft px-6 py-5">
          <div>
            <p className="font-display text-lg font-semibold text-ink">The report is ready</p>
            <p className="mt-0.5 text-sm text-ink-2">Scores, notes on every answer, and what the monitoring observed.</p>
          </div>
          <LinkButton href={`/report/${sessionId}`}>Open the report</LinkButton>
        </div>
      )}

      <p className="mt-8 text-[13px] leading-relaxed text-ink-3">
        Enable the camera and microphone before the coding round. That setup stays on while you move between rounds, so it does not interrupt the timer.
      </p>

      {!allDone && (
        <div className="mt-12 flex justify-center border-t border-line pt-8">
          <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger-strong" onClick={endEarly}>
            End interview early
          </Button>
        </div>
      )}
    </main>
  );
}
