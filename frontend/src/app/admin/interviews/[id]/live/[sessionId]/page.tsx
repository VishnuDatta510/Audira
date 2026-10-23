"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, Code2, Eye } from "lucide-react";
import { VoiceLoader } from "@/components/brand";
import { InterviewerGate } from "@/components/admin/interviewer-gate";
import { PageError, PageLoading } from "@/components/page-state";
import { ObservationList } from "@/components/report/observation-list";
import { SECTION_TITLES } from "@/components/report/parts";
import { turnLabel } from "@/components/report/round-verdict";
import { SiteHeader } from "@/components/site-header";
import { LinkButton } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { hasRole, useUser } from "@/lib/auth";
import { cx, formatClock } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import { useLoad } from "@/lib/use-load";
import type { LiveAttempt, LiveTurn, SectionId } from "@/lib/types";

const POLL_MS = 3000;

const SIGNAL_TONES: Record<string, string> = {
  strong: "bg-accent-soft text-accent",
  solid: "bg-surface-2 text-ink",
  partial: "bg-amber-soft text-amber",
  weak: "bg-danger-soft text-danger",
  no_answer: "bg-danger-soft text-danger",
};

function Turn({ turn, index }: { turn: LiveTurn; index: number }) {
  const label = turnLabel(turn.kind === "wrap_up" ? undefined : turn.kind);
  const waiting = turn.answer === null;
  return (
    <li className="rise space-y-3" style={{ "--i": Math.min(index, 6) } as React.CSSProperties}>
      <div className="max-w-[88%]">
        <p className="mb-1.5 text-[12px] font-medium text-ink-3">
          Interviewer
          {label ? ` · ${label}` : ""}
          {turn.topic ? ` · ${turn.topic}` : ""}
        </p>
        <p className="rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink">{turn.question}</p>
      </div>
      {turn.kind !== "wrap_up" && (
        <div className="ml-auto max-w-[88%]">
          {waiting ? (
            <p className="ml-auto flex w-fit items-center gap-2.5 rounded-2xl rounded-tr-md bg-accent-soft px-4 py-3 text-[14px] text-accent">
              <VoiceLoader className="h-3.5" />
              Answering now
            </p>
          ) : (
            <>
              <div className="rounded-2xl rounded-tr-md bg-accent-soft/60 px-4 py-3 text-[15px] leading-relaxed text-ink">
                {turn.skipped ? <span className="text-ink-3">Skipped this follow-up.</span> : turn.answer}
              </div>
              {turn.score !== null && (
                <p className="mt-1.5 flex justify-end gap-2 text-[12px]">
                  {turn.signal && (
                    <span className={cx("rounded-md px-1.5 py-0.5 font-medium", SIGNAL_TONES[turn.signal] ?? "bg-surface-2 text-ink-2")}>{turn.signal.replace("_", " ")}</span>
                  )}
                  <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-ink">{turn.score}</span>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function Transcript({ live }: { live: LiveAttempt }) {
  const end = useRef<HTMLLIElement>(null);
  const count = live.transcript.length;
  const seen = useRef(count);

  // Follow new lines, but only when the reader is already near the bottom.
  useEffect(() => {
    if (count > seen.current && end.current) {
      const nearBottom = window.innerHeight + window.scrollY > document.body.scrollHeight - 400;
      if (nearBottom) end.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    seen.current = count;
  }, [count]);

  if (!count) {
    return (
      <div className="flex flex-col items-center self-start rounded-3xl border border-dashed border-line-strong px-6 py-16 text-center">
        <VoiceLoader className="h-5 text-accent" />
        <p className="mt-4 font-display text-lg font-semibold text-ink">No spoken round yet</p>
        <p className="mt-1.5 max-w-sm text-sm text-ink-2">
          {live.active_section === "dsa"
            ? "They are in the coding round. The conversation shows up here once a spoken round starts."
            : "The conversation appears here as soon as a spoken round starts."}
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-6" aria-live="polite" aria-label="Interview transcript">
      {live.transcript.map((turn, i) => (
        <Fragment key={i}>
          {turn.section !== live.transcript[i - 1]?.section && (
            <li className="flex items-center gap-3 pt-2 text-[12px] font-medium text-ink-3">
              {SECTION_TITLES[turn.section]}
              <span className="h-px flex-1 bg-line" />
            </li>
          )}
          <Turn turn={turn} index={i} />
        </Fragment>
      ))}
      <li ref={end} aria-hidden />
    </ol>
  );
}

function Panel({ live, sessionId }: { live: LiveAttempt; sessionId: string }) {
  const observations = [...live.observations].reverse();
  return (
    <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-[13px] font-medium text-ink-3">Rounds</p>
        <ul className="mt-3 space-y-2.5">
          {(Object.keys(live.sections) as SectionId[]).map((round) => (
            <li key={round} className="flex items-center justify-between gap-3 text-sm text-ink">
              {SECTION_TITLES[round]}
              <span className="flex items-center gap-2">
                {live.round_scores[round] != null && <span className="font-mono text-[13px] text-ink-2">{live.round_scores[round]}</span>}
                <StatusBadge status={live.sections[round]} />
              </span>
            </li>
          ))}
        </ul>
      </div>

      {live.dsa && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-ink-3">
            <Code2 className="size-4" /> Coding round
          </p>
          <p className="mt-2 font-medium text-ink">{live.dsa.title}</p>
          <p className="mt-1 text-[13px] text-ink-2">
            {live.dsa.submitted
              ? live.dsa.tests_total
                ? `Submitted: ${live.dsa.tests_passed} of ${live.dsa.tests_total} tests passed${live.dsa.language ? ` in ${live.dsa.language}` : ""}.`
                : "Submitted."
              : `${formatClock(live.dsa.seconds_left)} left on the timer.`}
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[13px] font-medium text-ink-3">
            <Eye className="size-4" /> Monitoring
            {live.dsa && !live.dsa.submitted && (
              <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", live.camera_live ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-3")}>
                <span className={cx("size-1.5 rounded-full", live.camera_live ? "animate-pulse bg-accent" : "bg-ink-3")} aria-hidden />
                {live.camera_live ? "Camera live" : "Camera quiet"}
              </span>
            )}
          </p>
          <span className={cx("font-mono text-[13px]", live.warnings ? "text-amber" : "text-ink-2")}>
            {live.warnings} / {live.warning_limit}
          </span>
        </div>
        <div className="mt-3 flex gap-1" aria-hidden>
          {Array.from({ length: live.warning_limit }, (_, i) => (
            <span key={i} className={cx("h-1.5 flex-1 rounded-full transition-colors duration-500", i < live.warnings ? "bg-amber" : "bg-surface-2")} />
          ))}
        </div>
        <div className="max-h-[28rem] overflow-auto">
          <ObservationList sessionId={sessionId} observations={observations} empty="Nothing observed so far." />
        </div>
        <p className="mt-4 text-[12px] text-ink-3">Observations for a person to review, never a verdict.</p>
      </div>
    </aside>
  );
}

function Live({ id, sessionId }: { id: string; sessionId: string }) {
  const { data: live, error, reload } = useLoad(() => api.liveAttempt(id, sessionId), `${id}:${sessionId}`);
  const done = live?.status === "finished" || live?.status === "stopped";

  // Poll while the attempt runs; a background tab skips its turn.
  useEffect(() => {
    if (done) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) reload();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [done, reload]);

  if (error && !live) return <PageError message={error} onRetry={reload} />;
  if (!live) return <PageLoading label="Connecting to the interview" />;
  const progress = live.progress;

  return (
    <>
      <Link href={`/admin/interviews/${id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" /> Scoreboard
      </Link>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm text-ink-3">{live.role}</p>
          <h1 className="mt-1 font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">{live.candidate_name}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink-2">
            {done ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-2.5 py-1 text-[13px] font-medium text-ink">
                <span className={cx("size-1.5 rounded-full", live.status === "stopped" ? "bg-danger" : "bg-accent")} />
                {live.status === "stopped" ? "Stopped at the warning limit" : "Finished"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-soft px-2.5 py-1 text-[13px] font-medium text-amber">
                <span className="ripple size-1.5 rounded-full bg-amber text-amber" />
                Live
              </span>
            )}
            {progress && (
              <span>
                {SECTION_TITLES[progress.section]}, turn {progress.question_number} of up to {progress.total_questions} · {progress.topic}
              </span>
            )}
          </p>
        </div>
        {done && (
          <LinkButton href={`/report/${sessionId}`} className="animate-pop">
            Read the report
            <ArrowRight className="size-4" />
          </LinkButton>
        )}
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Transcript live={live} />
        <Panel live={live} sessionId={sessionId} />
      </div>
    </>
  );
}

export default function LiveAttemptPage() {
  const { id, sessionId } = useParams<{ id: string; sessionId: string }>();
  const user = useUser();
  const ready = useHydrated();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-24 pt-10 sm:px-8">
        {!ready && <PageLoading label="Connecting to the interview" />}
        {ready && !hasRole(user, "viewer") && <InterviewerGate next={`/admin/interviews/${id}/live/${sessionId}`} />}
        {ready && hasRole(user, "viewer") && <Live id={id} sessionId={sessionId} />}
      </main>
    </>
  );
}
