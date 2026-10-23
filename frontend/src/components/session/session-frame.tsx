"use client";

import { Maximize } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { PageError } from "@/components/page-state";
import { ProctorMonitor } from "@/components/proctor/ProctorMonitor";
import { DisqualifiedPage } from "@/components/session/disqualified-page";
import { Button, LinkButton } from "@/components/ui/button";
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
      : proctor.notices.filter((notice) => notice.weight > 0).map((notice) => ({ type: notice.type, details: notice.details }));
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
      {proctor.running && <FullscreenGuard />}
    </SessionProctorContext.Provider>
  );
}

/** Covers the page while monitoring is on and the window is not full-screen. Leaving was already counted by the engine. */
function FullscreenGuard() {
  const [away, setAway] = useState(false);

  useEffect(() => {
    if (!document.fullscreenEnabled) return;
    const check = () => setAway(!document.fullscreenElement);
    check();
    document.addEventListener("fullscreenchange", check);
    return () => document.removeEventListener("fullscreenchange", check);
  }, []);

  if (!away) return null;
  return (
    <div className="fixed inset-0 z-70 grid place-items-center bg-bg/90 px-6 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="fullscreen-guard-title">
      <div className="w-full max-w-sm animate-pop rounded-2xl border border-line bg-surface p-6 text-center shadow-float">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
          <Maximize className="size-5" />
        </span>
        <h2 id="fullscreen-guard-title" className="mt-4 font-display text-xl font-semibold text-ink">Return to full-screen</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">The assessment stays full-screen while the camera is on. Your work is saved.</p>
        <Button className="mt-5 w-full" onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)}>
          Go full-screen
        </Button>
      </div>
    </div>
  );
}
