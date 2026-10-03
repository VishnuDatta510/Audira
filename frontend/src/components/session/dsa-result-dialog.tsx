"use client";

import { useEffect, useRef } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import type { DsaEvaluation } from "@/lib/types";

type Props = {
  /** Null on a recruiter's link: the score and review go to the recruiter. */
  evaluation: DsaEvaluation | null;
  /** Test counts from this submission, when the page still has them. */
  tests: { passed: number; total: number } | null;
  sessionId: string;
  onClose: () => void;
};

export function DsaResultDialog({ evaluation, tests, sessionId, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-ink/30 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-7">
        <p className="text-sm text-ink-3">Coding round submitted</p>
        {evaluation ? <Evaluation evaluation={evaluation} /> : <Submitted tests={tests} />}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-7 py-4">
        <Button variant="ghost" onClick={() => ref.current?.close()}>
          Review my code
        </Button>
        <LinkButton href={`/session/${sessionId}`}>Back to the interview map</LinkButton>
      </div>
    </dialog>
  );
}

function Submitted({ tests }: { tests: Props["tests"] }) {
  return (
    <>
      <p className="mt-2 font-display text-2xl font-semibold text-ink">Your solution is in</p>
      {tests && (
        <p className="mt-3 text-[15px] text-ink-2">
          {tests.passed} of {tests.total} tests passed.
        </p>
      )}
      <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
        The recruiter receives the full review of your code. You can move on to the next round.
      </p>
    </>
  );
}

function Evaluation({ evaluation }: { evaluation: DsaEvaluation }) {
  const allPassed = evaluation.tests_passed === evaluation.tests_total;
  return (
    <>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="font-display text-6xl font-semibold leading-none text-ink">{evaluation.score}</span>
        <span className="text-sm text-ink-2">out of 100</span>
      </div>
      <p className={allPassed ? "mt-4 font-medium text-accent" : "mt-4 font-medium text-danger"}>
        {evaluation.tests_passed} of {evaluation.tests_total} tests passed
      </p>
      <dl className="mt-5 grid grid-cols-2 gap-4 rounded-xl bg-surface-2 p-4">
        <div>
          <dt className="text-xs text-ink-3">Likely time complexity</dt>
          <dd className="mt-0.5 font-mono text-sm text-ink">{evaluation.time_complexity}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Target</dt>
          <dd className="mt-0.5 font-mono text-sm text-ink">{evaluation.expected_time_complexity}</dd>
        </div>
      </dl>
      <p className="mt-4 text-[14px] leading-relaxed text-ink-2">{evaluation.code_quality_feedback}</p>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{evaluation.complexity_feedback}</p>
      <p className="mt-4 text-xs text-ink-3">
        {evaluation.reviewer === "agent"
          ? "Tests ran on Judge0. The interview agent read the code for complexity and quality, so treat its notes as a reviewer's opinion."
          : "Tests ran on Judge0. The interview agent was unavailable, so complexity is a structural estimate."}
      </p>
    </>
  );
}
