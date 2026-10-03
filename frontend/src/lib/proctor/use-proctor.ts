"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { ProctorEngine, type ProctorSignals, type WarningNotice } from "@/lib/proctor/engine";
import { describeWarning } from "@/lib/proctor/warning-copy";

export type ProctorToast = WarningNotice & { id: number; title: string; detail: string };

export function useProctor(sessionId: string) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<ProctorEngine | null>(null);
  const toastId = useRef(0);
  const [status, setStatus] = useState("Camera monitoring is not active yet.");
  const [warnings, setWarnings] = useState(0);
  const [limit, setLimit] = useState(5);
  const [toasts, setToasts] = useState<ProctorToast[]>([]);
  const [signals, setSignals] = useState<ProctorSignals | null>(null);
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
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  const start = useCallback(async () => {
    const video = videoRef.current;
    if (!video || engineRef.current || locked) return;
    const engine = new ProctorEngine(sessionId, video, {
      onStatus: setStatus,
      onWarnings: (count, max) => {
        setWarnings(count);
        setLimit(max);
      },
      onSignals: setSignals,
      onWarning: (notice) => {
        const copy = describeWarning(notice.type, notice.details);
        const id = toastId.current + 1;
        toastId.current = id;
        setToasts((current) => [...current, { ...notice, ...copy, id }]);
        window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), notice.locked ? 12000 : 7000);
      },
      onLocked: () => {
        setLocked(true);
        setRunning(false);
      },
    });
    engineRef.current = engine;
    setStarting(true);
    try {
      await engine.start();
      setRunning(true);
    } catch (error) {
      engine.stop();
      engineRef.current = null;
      setSignals(null);
      setRunning(false);
      setStatus(error instanceof Error ? error.message : "Camera monitoring could not start.");
    } finally {
      setStarting(false);
    }
  }, [locked, sessionId]);

  return { videoRef, status, warnings, limit, toasts, signals, running, starting, locked, start };
}
