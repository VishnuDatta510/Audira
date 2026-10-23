"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Crown } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { InterviewerGate } from "@/components/admin/interviewer-gate";
import { PageError, PageLoading } from "@/components/page-state";
import { COMMUNICATION_LABELS, DownloadPdfButton, Heading, Points, SECTION_TITLES } from "@/components/report/parts";
import { SiteHeader } from "@/components/site-header";
import { api } from "@/lib/api";
import { hasRole, useUser } from "@/lib/auth";
import { cx } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import { useLoad } from "@/lib/use-load";
import type { Report, VoiceSectionId } from "@/lib/types";

const ROUNDS = ["dsa", "project", "fundamentals"] as const;
const SIDES = ["bg-accent", "bg-amber"] as const;

/** Two columns, one per candidate, that stack on narrow screens. */
function Pair({ title, note, children }: { title: string; note?: string; children: [React.ReactNode, React.ReactNode] }) {
  return (
    <section className="rise mt-12">
      <Heading>{title}</Heading>
      {note && <p className="mt-1.5 text-[13px] text-ink-3">{note}</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {children.map((child, i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-5">
            {child}
          </div>
        ))}
      </div>
    </section>
  );
}

function Who({ report, side }: { report: Report; side: 0 | 1 }) {
  return (
    <p className="mb-3 flex items-center gap-2 text-[12px] font-medium text-ink-3">
      <span className={cx("size-2 rounded-full", SIDES[side])} />
      {report.candidate_name}
    </p>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] text-ink-3">{children}</p>;
}

function RoundBars({ a, b }: { a: Report; b: Report }) {
  const rows = ROUNDS.filter((round) => a.round_scores[round] != null || b.round_scores[round] != null);
  if (!rows.length) return null;
  return (
    <section className="rise mt-12">
      <Heading>Round by round</Heading>
      <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
        {rows.map((round) => {
          const scores = [a.round_scores[round], b.round_scores[round]];
          const top = Math.max(...scores.map((s) => s ?? -1));
          return (
            <div key={round} className="grid gap-3 px-5 py-4 sm:grid-cols-[11rem_1fr] sm:items-center">
              <p className="text-sm font-medium text-ink">{SECTION_TITLES[round]}</p>
              <div className="space-y-2">
                {scores.map((value, side) => (
                  <div key={side} className="flex items-center gap-3">
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      {value != null && <span className={cx("bar-fill block h-full rounded-full", SIDES[side])} style={{ width: `${value}%` }} />}
                    </span>
                    <span className={cx("w-10 text-right font-mono text-sm tabular-nums", value === top && value != null ? "font-semibold text-ink" : "text-ink-3")}>
                      {value ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Skills({ report, section }: { report: Report; section: VoiceSectionId }) {
  const verdict = report.round_verdicts?.[section];
  if (!verdict?.skills.length) return <Empty>No per-skill ratings for this round.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {verdict.skills.map((skill, i) => (
        <li key={`${i}-${skill.skill}`} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <div>
            <p className="text-[14px] font-medium text-ink">{skill.skill}</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{skill.evidence}</p>
          </div>
          <span className="font-mono text-sm tabular-nums text-ink">{skill.rating}</span>
        </li>
      ))}
    </ul>
  );
}

function Coding({ report }: { report: Report }) {
  const evaluation = report.dsa_result?.evaluation;
  if (!evaluation) return <Empty>No coding submission.</Empty>;
  return (
    <div className="space-y-1.5 text-[14px] text-ink-2">
      <p className="text-ink">
        {evaluation.tests_passed} of {evaluation.tests_total} tests passed in {report.dsa_result?.language}
      </p>
      <p>
        {evaluation.time_complexity} time against a target of {evaluation.expected_time_complexity}
        {evaluation.meets_target_complexity ? ", meets the target." : ", above the target."}
      </p>
      <p className="text-[13px] leading-relaxed">{evaluation.code_quality_feedback}</p>
    </div>
  );
}

function Comparison({ id, a, b }: { id: string; a: string; b: string }) {
  const { data, error, reload } = useLoad(() => Promise.all([api.report(a), api.report(b)]), `${a}:${b}`);
  if (error && !data) return <PageError message={error} onRetry={reload} />;
  if (!data) return <PageLoading label="Reading both reports" />;
  const [left, right] = data;
  const pair = [left, right] as const;
  const leader = left.overall_score === right.overall_score ? null : left.overall_score > right.overall_score ? 0 : 1;
  const voiceRounds = (["project", "fundamentals"] as const).filter((section) => left.round_verdicts?.[section] || right.round_verdicts?.[section]);
  const both = (render: (report: Report, side: 0 | 1) => React.ReactNode): [React.ReactNode, React.ReactNode] => [
    <>
      <Who report={left} side={0} />
      {render(left, 0)}
    </>,
    <>
      <Who report={right} side={1} />
      {render(right, 1)}
    </>,
  ];

  return (
    <>
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Link href={`/admin/interviews/${id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink">
          <ArrowLeft className="size-4" /> Scoreboard
        </Link>
        <DownloadPdfButton fileName={`${left.candidate_name} vs ${right.candidate_name} - ${left.role} - Audira`} />
      </div>

      <p className="mt-8 text-sm text-ink-3">{left.role}</p>
      <h1 className="mt-1 font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">Side by side</h1>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {pair.map((report, side) => (
          <div
            key={side}
            className={cx(
              "rise relative overflow-hidden rounded-3xl border bg-surface p-6 shadow-lift",
              leader === side ? "border-accent/40" : "border-line",
            )}
            style={{ "--i": side } as React.CSSProperties}
          >
            <span className={cx("absolute inset-x-0 top-0 h-1", SIDES[side])} />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-display text-xl font-semibold text-ink">{report.candidate_name}</p>
                <p className="truncate text-[13px] text-ink-3">{report.candidate_email}</p>
              </div>
              {leader === side && (
                <span className="animate-pop inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 text-[12px] font-medium text-amber">
                  <Crown className="size-3.5" /> Higher overall
                </span>
              )}
            </div>
            <p className="mt-5 font-display text-[64px] font-semibold leading-none text-ink">
              <CountUp value={report.overall_score} immediate delay={side * 120} />
            </p>
            <p className="mt-4 text-[14px] leading-relaxed text-ink-2">{report.summary}</p>
          </div>
        ))}
      </div>

      <RoundBars a={left} b={right} />

      <Pair title="What they showed">{both((report) => (report.strengths.length ? <Points items={report.strengths} tone="accent" /> : <Empty>Nothing listed.</Empty>))}</Pair>
      <Pair title="What they didn't show">{both((report) => (report.gaps.length ? <Points items={report.gaps} tone="amber" /> : <Empty>Nothing listed.</Empty>))}</Pair>

      {voiceRounds.map((section) => (
        <Pair key={section} title={SECTION_TITLES[section]} note="Each skill is rated on what the candidate showed, with the evidence for it.">
          {both((report) => <Skills report={report} section={section} />)}
        </Pair>
      ))}

      {(left.dsa_result || right.dsa_result) && <Pair title="Coding round">{both((report) => <Coding report={report} />)}</Pair>}

      <Pair title="Communication">
        {both((report) => {
          const notes = Object.entries(report.communication_assessment).filter(([, text]) => text);
          if (!notes.length) return <Empty>No notes.</Empty>;
          return (
            <dl className="space-y-2.5">
              {notes.map(([key, text]) => (
                <div key={key}>
                  <dt className="text-[12px] font-medium text-ink-3">{COMMUNICATION_LABELS[key] ?? key}</dt>
                  <dd className="text-[14px] leading-relaxed text-ink-2">{text}</dd>
                </div>
              ))}
            </dl>
          );
        })}
      </Pair>

      <Pair title="Monitoring" note="Observations for a person to review, not proof of misconduct.">
        {both((report, side) => {
          const count = report.integrity_observations.filter((o) => o.type !== "vision_check").length;
          return (
            <p className="text-[14px] text-ink-2">
              {count === 0 ? "Nothing was observed." : `${count} observation${count === 1 ? "" : "s"} recorded.`}
              {report.disqualified ? " The session was locked at the warning limit." : ""}{" "}
              <Link href={`/report/${side === 0 ? a : b}`} className="font-medium text-accent hover:underline print:hidden">
                Full report
              </Link>
            </p>
          );
        })}
      </Pair>
    </>
  );
}

function CompareInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const user = useUser();
  const ready = useHydrated();
  const a = params.get("a");
  const b = params.get("b");
  const next = `/admin/interviews/${id}/compare?a=${a ?? ""}&b=${b ?? ""}`;

  if (!ready) return <PageLoading label="Loading" />;
  if (!hasRole(user, "viewer")) return <InterviewerGate next={next} />;
  if (!a || !b || a === b) return <PageError message="Pick two different candidates on the scoreboard to compare them." />;
  return <Comparison id={id} a={a} b={b} />;
}

export default function ComparePage() {
  return (
    <>
      <div className="contents print:hidden">
        <SiteHeader />
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-24 pt-10 sm:px-8">
        <Suspense fallback={<PageLoading label="Loading" />}>
          <CompareInner />
        </Suspense>
      </main>
    </>
  );
}
