"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { useReducedMotion } from "@/components/landing/motion";

const LINES = [
  { alpha: 0.55, width: 1.6, speed: 1, freq: 1, phase: 0 },
  { alpha: 0.28, width: 1.2, speed: 0.72, freq: 1.35, phase: 1.7 },
  { alpha: 0.16, width: 1, speed: 1.3, freq: 0.8, phase: 3.1 },
];

function readColor(variable: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || "#1f6b57";
}

/**
 * A full-width waveform whose amplitude follows who is speaking.
 * `level` is 0 (silent) to 1 (the interviewer asking).
 */
export function VoiceField({ level, className, colorVar = "--accent" }: { level: number; className?: string; colorVar?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(level);
  const reduced = useReducedMotion();

  useEffect(() => {
    targetRef.current = level;
  }, [level]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let color = readColor(colorVar);
    const themeObserver = new MutationObserver(() => {
      color = readColor(colorVar);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    let amp = targetRef.current;
    let t = 0;
    let frame = 0;
    let visible = true;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const mid = height / 2;
      const maxAmp = height * 0.34;
      ctx.strokeStyle = color;
      ctx.lineCap = "round";
      for (const line of LINES) {
        ctx.globalAlpha = line.alpha;
        ctx.lineWidth = line.width;
        ctx.beginPath();
        for (let x = 0; x <= width; x += 4) {
          const u = x / width;
          const envelope = Math.pow(Math.sin(Math.PI * u), 1.6);
          const k = u * Math.PI * 2 * line.freq;
          const wave =
            Math.sin(k * 3 + t * line.speed * 2.2 + line.phase) * 0.6 +
            Math.sin(k * 7.3 - t * line.speed * 3.1) * 0.28 * amp +
            Math.sin(k * 1.4 + t * 0.9) * 0.2;
          const y = mid + wave * envelope * maxAmp * (0.12 + amp * 0.88);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      amp += (targetRef.current - amp) * 0.045;
      t += 0.016;
      draw();
      frame = requestAnimationFrame(loop);
    };

    const start = () => {
      cancelAnimationFrame(frame);
      if (reduced) {
        amp = 0.35;
        draw();
      } else if (visible && !document.hidden) {
        frame = requestAnimationFrame(loop);
      }
    };

    const viewObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    });
    viewObserver.observe(canvas);
    const onVisibility = () => start();
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      cancelAnimationFrame(frame);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      viewObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced, colorVar]);

  return <canvas ref={canvasRef} aria-hidden className={cx("pointer-events-none block", className)} />;
}

const SPEECH_CYCLE = [0.95, 0.7, 1, 0.55, 0.12, 0.1, 0.8, 0.9, 0.35, 0.12];

/** A waveform that keeps speaking and pausing on its own, for sections with no live conversation. */
export function SpeakingVoiceField({ className, colorVar }: { className?: string; colorVar?: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => (s + 1) % SPEECH_CYCLE.length), 900);
    return () => window.clearInterval(id);
  }, []);
  return <VoiceField level={SPEECH_CYCLE[step]} className={className} colorVar={colorVar} />;
}
