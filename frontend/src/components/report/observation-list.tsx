"use client";

import { useEffect, useState } from "react";
import { OBSERVATION_LABELS, SECTION_TITLES } from "@/components/report/parts";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import type { ProctorEvent } from "@/lib/types";

// Sessions recorded before weights existed: everything but these counted once.
const REVIEW_ONLY = new Set(["low_light", "mouth_motion", "suspicious_lip_movement"]);

export function weightOf(event: ProctorEvent): number {
  return event.weight ?? (REVIEW_ONLY.has(event.type) ? 0 : 1);
}

export function ObservationList({ sessionId, observations, empty }: { sessionId: string; observations: ProctorEvent[]; empty: string }) {
  const counted = observations.filter((event) => weightOf(event) > 0);
  const review = observations.filter((event) => weightOf(event) === 0);
  if (!observations.length) return <p className="mt-4 text-[14px] text-ink-2">{empty}</p>;
  return (
    <div className="mt-4 space-y-5">
      {counted.length > 0 && <Group title="Counted toward the limit" sessionId={sessionId} events={counted} />}
      {review.length > 0 && <Group title="Noted for review, not counted" sessionId={sessionId} events={review} />}
    </div>
  );
}

function Group({ title, sessionId, events }: { title: string; sessionId: string; events: ProctorEvent[] }) {
  return (
    <div>
      <p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">{title}</p>
      <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
        {events.map((event, index) => (
          <Observation key={event.id ?? `${event.type}-${event.observed_at}-${index}`} sessionId={sessionId} event={event} />
        ))}
      </ul>
    </div>
  );
}

function Observation({ sessionId, event }: { sessionId: string; event: ProctorEvent }) {
  const weight = weightOf(event);
  const round = event.section ? SECTION_TITLES[event.section] : null;
  return (
    <li className="flex gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-ink">
          {OBSERVATION_LABELS[event.type] ?? event.type}
          {weight > 0 && (
            <span className={cx("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", weight > 1 ? "bg-danger-soft text-danger" : "bg-amber-soft text-amber")}>
              counts {weight}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{event.details}</p>
        <p className="mt-1 text-[12px] text-ink-3">
          {[round, event.observed_at?.includes("T") ? new Date(event.observed_at).toLocaleTimeString() : null].filter(Boolean).join(" · ")}
        </p>
      </div>
      {event.evidence && event.id && <EvidenceStill sessionId={sessionId} eventId={event.id} />}
    </li>
  );
}

/** The still needs the recruiter's token, which an img src cannot carry, so it is fetched as a blob. */
function EvidenceStill({ sessionId, eventId }: { sessionId: string; eventId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let made: string | null = null;
    api
      .evidence(sessionId, eventId, controller.signal)
      .then((blob) => {
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      if (made) URL.revokeObjectURL(made);
    };
  }, [sessionId, eventId]);

  if (!url) return <span className="h-15 w-20 shrink-0 animate-pulse rounded-md bg-surface-2" aria-hidden />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="shrink-0" aria-label="Open the camera still">
      {/* eslint-disable-next-line @next/next/no-img-element -- a local blob, nothing for next/image to optimise */}
      <img src={url} alt="Camera still from this moment" className="h-15 w-20 rounded-md border border-line object-cover" />
    </a>
  );
}
