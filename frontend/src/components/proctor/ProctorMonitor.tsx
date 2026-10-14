"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/format";
import type { useProctor } from "@/lib/proctor/use-proctor";

type Proctor = ReturnType<typeof useProctor>;

const DOT = { idle: "bg-ink-3", active: "bg-accent", attention: "bg-amber" } as const;

export function ProctorMonitor({ proctor, serverWarnings = 0 }: { proctor: Proctor; serverWarnings?: number }) {
  const { videoRef, status, tone, warnings: liveWarnings, limit, running, starting, locked, start } = proctor;
  const warnings = Math.max(liveWarnings, serverWarnings);

  return (
    <aside className="border-b border-line bg-surface px-4 py-3 lg:sticky lg:top-4 lg:border-b-0 lg:border-l lg:p-4">
      <ProctorToast proctor={proctor} />
      <div className="flex items-center gap-3 lg:flex-col lg:items-stretch lg:gap-4">
        <div className="hidden lg:block">
          <h2 className="font-display text-base font-semibold">Camera monitoring</h2>
          <p className="mt-1 text-sm leading-5 text-ink-3">What the camera notes goes to a person for review. It is not a verdict.</p>
        </div>
        <div className="relative w-28 shrink-0 overflow-hidden rounded-lg bg-black lg:w-full">
          <video ref={videoRef} className="aspect-video w-full object-cover -scale-x-100" autoPlay muted playsInline />
          {running && (
            <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white lg:left-2 lg:top-2 lg:px-2 lg:text-[11px]">
              <span className="size-1.5 animate-pulse rounded-full bg-danger" aria-hidden />
              LIVE
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 lg:flex-none">
          <p className="flex items-start gap-2 text-sm leading-5 text-ink-2" aria-live="polite">
            <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", DOT[running ? tone : "idle"])} aria-hidden />
            <span className="line-clamp-2 lg:line-clamp-none">{status}</span>
          </p>
          <WarningMeter warnings={warnings} limit={limit} />
        </div>
        {!running && (
          <Button size="sm" className="shrink-0 lg:h-10 lg:w-full lg:text-sm" onClick={() => void start()} disabled={locked} loading={starting}>
            {locked ? "Monitoring locked" : "Enable camera and mic"}
          </Button>
        )}
      </div>
    </aside>
  );
}

function WarningMeter({ warnings, limit }: { warnings: number; limit: number }) {
  const near = warnings >= limit - 1;
  return (
    <div className="mt-2">
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: limit }, (_, index) => (
          <span key={index} className={cx("h-1.5 flex-1 rounded-full", index < warnings ? (near ? "bg-danger" : "bg-amber") : "bg-surface-2")} />
        ))}
      </div>
      <p className={cx("mt-1.5 text-xs font-medium tabular-nums", warnings ? (near ? "text-danger" : "text-amber") : "text-ink-3")}>
        {warnings} of {limit} warnings
      </p>
    </div>
  );
}

function ProctorToast({ proctor }: { proctor: Proctor }) {
  const { toast, dismiss } = proctor;
  if (!toast) return null;
  const counted = toast.weight > 0;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-80 flex justify-center px-4">
      <div
        key={toast.id}
        role="alert"
        className={cx("pointer-events-auto flex w-full max-w-sm animate-pop gap-3 rounded-xl px-4 py-3 shadow-float", counted ? "bg-danger text-white" : "bg-amber text-white")}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{toast.title}</p>
          <p className="mt-1 text-sm leading-5 text-white/90">{toast.detail}</p>
          <p className="mt-2 text-xs font-medium tracking-wide text-white/80">
            {counted ? `Warning ${toast.count} of ${toast.limit}${toast.weight > 1 ? ` · counts as ${toast.weight}` : ""}` : "Not counted"}
            {toast.locked ? " · Session locked" : ""}
          </p>
        </div>
        {!toast.locked && (
          <button onClick={dismiss} className="-mr-1 -mt-0.5 grid size-7 shrink-0 place-items-center rounded-md text-white/80 hover:bg-white/15 hover:text-white" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
