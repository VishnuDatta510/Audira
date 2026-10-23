"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageError, PageLoading } from "@/components/page-state";
import { DsaResultDialog } from "@/components/session/dsa-result-dialog";
import { Badge } from "@/components/ui/badge";
import { CodingWorkspace } from "@/components/workspace/coding-workspace";
import { useSessionProctor } from "@/components/session/session-frame";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cx, formatClock } from "@/lib/format";
import { useCountdown } from "@/lib/use-countdown";
import { useHydrated } from "@/lib/use-hydrated";
import { useLoad } from "@/lib/use-load";
import type { DsaSubmitResult } from "@/lib/types";

export default function DsaRoundPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const proctor = useSessionProctor();
  const { data: summary, error: summaryError } = useLoad(() => api.session(sessionId), sessionId);
  const alreadyDone = summary?.sections.dsa === "completed";
  const canOpen = proctor.running || alreadyDone;
  const { data, error, reload } = useLoad(
    () =>
      canOpen
        ? Promise.all([api.startDsa(sessionId), api.languages()]).then(([dsa, languages]) => ({ dsa, languages, deadline: Date.now() + dsa.ends_in_seconds * 1000 }))
        : Promise.resolve(null),
    canOpen ? sessionId : "need-devices",
  );
  const [result, setResult] = useState<DsaSubmitResult | null>(null);
  const hydrated = useHydrated();
  const extended = hydrated && Boolean((window.screen as Screen & { isExtended?: boolean }).isExtended);
  const { preload, flush } = proctor;

  useEffect(() => {
    // The models download while the candidate reads, so the button only waits on the camera.
    if (!canOpen) preload();
  }, [canOpen, preload]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const submitted = Boolean(result) || Boolean(data?.dsa.submitted);
  const secondsLeft = useCountdown(data && !submitted ? data.deadline : null);
  const expired = Boolean(data) && !submitted && secondsLeft === 0;

  const submit = useCallback(
    async (language: string, code: string) => {
      await flush();
      const submission = await api.submitDsa(sessionId, language, code);
      setResult(submission);
      setDialogOpen(true);
      return submission;
    },
    [flush, sessionId],
  );

  if (!summary && !summaryError) {
    return (
      <div className="flex min-h-dvh">
        <PageLoading label="Opening the coding round" />
      </div>
    );
  }

  if (!canOpen) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-ink">Enable the camera and microphone</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Do this before the coding round starts. The timer begins after both are on, so the permission prompts do not count as leaving full-screen.
        </p>
        <ul className="mt-5 space-y-2 text-[14px] leading-relaxed text-ink-2">
          <li>The round runs full-screen. Leaving it, switching tabs, or another person or a phone in view each count as a warning.</li>
          <li>When something is noted, a small still from the camera is saved for the recruiter to check.</li>
          <li>Nothing here is a verdict on its own. A person reviews what the camera notes.</li>
        </ul>
        {extended && (
          <p className="mt-5 rounded-lg bg-amber-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-amber">
            A second display is connected. It will be noted for the recruiter, so unplug it if you can.
          </p>
        )}
        <Button className="mt-6 w-fit" onClick={() => void proctor.start()} loading={proctor.starting}>
          Enable camera and mic
        </Button>
        {proctor.status !== "Camera monitoring is not active yet." ? <p className="mt-3 text-[13px] text-ink-2">{proctor.status}</p> : null}
      </main>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-dvh">
        <PageError message={error} onRetry={reload} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex min-h-dvh">
        <PageLoading label="Opening the coding round" />
      </div>
    );
  }

  const shownEvaluation = result?.evaluation ?? data.dsa.evaluation ?? null;
  const tests = result ? { passed: result.passed, total: result.total } : null;
  const headerExtras = submitted ? (
    <button onClick={() => setDialogOpen(true)} className="rounded-full" aria-label="Show the submission">
      <Badge tone="accent">Submitted{shownEvaluation ? `, score ${shownEvaluation.score}` : ""}</Badge>
    </button>
  ) : (
    <span
      role="timer"
      aria-label={`${formatClock(secondsLeft)} left`}
      className={cx(
        "rounded-md px-2.5 py-1 font-mono text-[13px] font-semibold tabular-nums",
        secondsLeft <= 60 ? "bg-danger-soft text-danger" : secondsLeft <= 300 ? "bg-amber-soft text-amber" : "bg-surface-2 text-ink",
      )}
    >
      {formatClock(secondsLeft)}
    </span>
  );

  return (
    <>
      <CodingWorkspace
        problem={data.dsa.problem}
        languages={data.languages}
        scope={`session:${sessionId}`}
        backHref={`/session/${sessionId}`}
        backLabel="Interview map"
        headerExtras={headerExtras}
        submitLabel="Submit solution"
        onSubmit={submit}
        locked={submitted}
        autoSubmit={expired}
      />
      {dialogOpen && submitted && (
        <DsaResultDialog evaluation={shownEvaluation} tests={tests} sessionId={sessionId} onClose={() => setDialogOpen(false)} />
      )}
    </>
  );
}
