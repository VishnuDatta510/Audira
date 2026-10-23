"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { ProctorEngine, type ProctorTone, type WarningNotice } from "@/lib/proctor/engine";
import { preloadModels } from "@/lib/proctor/load-models";
import { describeWarning } from "@/lib/proctor/warning-copy";

export type ProctorToast = WarningNotice & { id: number; title: string; detail: string };

const IDLE = "Camera monitoring is not active yet.";
const FLUSH_WAIT_MS = 4000;

export function useProctor(sessionId: string) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<ProctorEngine | null>(null);
  const toastId = useRef(0);
  const toastTimer = useRef(0);
  const [status, setStatus] = useState(IDLE);
  const [tone, setTone] = useState<ProctorTone>("idle");
  const [warnings, setWarnings] = useState(0);
  const [limit, setLimit] = useState(5);
  // One toast at a time so a burst never stacks over the editor. The full list stays for the lock screen.
  const [toast, setToast] = useState<ProctorToast | null>(null);
  const [notices, setNotices] = useState<ProctorToast[]>([]);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.config().then((config) => {
      if (!cancelled) setLimit(config.proctor_warning_limit);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      window.clearTimeout(toastTimer.current);
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  const dismiss = useCallback(() => {
    window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const start = useCallback(() => {
    const video = videoRef.current;
    if (!video || engineRef.current || locked) return Promise.resolve();
    const engine = new ProctorEngine(sessionId, video, {
      onStatus: (text, nextTone) => {
        setStatus(text);
        setTone(nextTone);
      },
      onWarnings: (count, max) => {
        setWarnings(count);
        setLimit(max);
      },
      onWarning: (notice) => {
        const id = ++toastId.current;
        const next = { ...notice, ...describeWarning(notice.type, notice.details), id };
        setNotices((current) => [...current, next]);
        // Items noted only for review stay out of the candidate's way. Lighting is the one they can fix.
        if (notice.weight === 0 && notice.type !== "low_light" && !notice.locked) return;
        window.clearTimeout(toastTimer.current);
        setToast(next);
        if (!notice.locked) toastTimer.current = window.setTimeout(() => setToast(null), 7000);
      },
      onLocked: () => {
        setLocked(true);
        setRunning(false);
      },
      onStopped: (reason) => {
        engineRef.current = null;
        setRunning(false);
        setStatus(reason);
        setTone("attention");
      },
    });
    engineRef.current = engine;
    setStarting(true);
    // The engine asks for full-screen inside this call, while the click still counts.
    return engine
      .start()
      .then(() => {
        if (engineRef.current === engine) setRunning(true);
      })
      .catch((error: unknown) => {
        engine.stop();
        if (engineRef.current === engine) engineRef.current = null;
        setRunning(false);
        setStatus(error instanceof Error ? error.message : "Camera monitoring could not start.");
        setTone("attention");
      })
      .finally(() => setStarting(false));
  }, [locked, sessionId]);

  /** Waits a moment for queued warnings to reach the server, so a submit never outruns them. */
  const flush = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    await Promise.race([engine.flush(), new Promise((resolve) => window.setTimeout(resolve, FLUSH_WAIT_MS))]);
  }, []);

  return { videoRef, status, tone, warnings, limit, toast, notices, running, starting, locked, start, flush, dismiss, preload: preloadModels };
}
