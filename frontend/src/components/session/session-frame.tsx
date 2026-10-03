"use client";

import { createContext, useContext, useEffect } from "react";
import { PageError } from "@/components/page-state";
import { ProctorMonitor } from "@/components/proctor/ProctorMonitor";
import { DisqualifiedPage } from "@/components/session/disqualified-page";
import { LinkButton } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useProctor } from "@/lib/proctor/use-proctor";
import { useLoad } from "@/lib/use-load";

const SessionProctorContext = createContext<ReturnType<typeof useProctor> | null>(null);

export function useSessionProctor() {
  const proctor = useContext(SessionProctorContext);
  if (!proctor) throw new Error("Camera monitoring is only available inside a session.");
  return proctor;
}

export function SessionFrame({ sessionId, children }: { sessionId: string; children: React.ReactNode }) {
  const proctor = useProctor(sessionId);
  const { data: summary, error, reload } = useLoad(() => api.session(sessionId), sessionId);
  const ended = proctor.locked || Boolean(summary?.disqualified);

  useEffect(() => {
    if (!proctor.locked) return;
    void document.exitFullscreen?.().catch(() => undefined);
    reload();
  }, [proctor.locked, reload]);

  useEffect(() => {
    function block(e: Event) {
      e.preventDefault();
    }
    document.addEventListener("contextmenu", block);
    return () => {
      document.removeEventListener("contextmenu", block);
    };
  }, []);

  if (error && !summary) {
    return (
      <main className="flex min-h-dvh flex-col">
        <PageError
          message={error}
          onRetry={reload}
          action={
            <LinkButton href={`/sign-in?next=${encodeURIComponent(`/session/${sessionId}`)}`} size="sm">
              Sign in as the candidate
            </LinkButton>
          }
        />
      </main>
    );
  }

  if (ended) {
    const events = summary?.warnings_log?.length
      ? summary.warnings_log
      : proctor.toasts.map((toast) => ({ type: toast.type, details: toast.details }));
    return (
      <DisqualifiedPage
        sessionId={sessionId}
        warnings={summary?.warnings || proctor.warnings}
        limit={summary?.warning_limit || proctor.limit}
        events={events}
        recruiterSession={summary?.recruiter_session ?? true}
      />
    );
  }

  return (
    <SessionProctorContext.Provider value={proctor}>
      <div className="flex min-h-full flex-col-reverse lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0">{children}</div>
        <ProctorMonitor proctor={proctor} serverWarnings={summary?.warnings ?? 0} />
      </div>
    </SessionProctorContext.Provider>
  );
}
