"use client";

import { useEffect, useRef } from "react";
import { cx } from "@/lib/format";

/**
 * A number that counts up from zero. With `immediate` it runs on mount (data that just arrived);
 * otherwise it waits until it scrolls into view, and stays put if it was already on screen.
 * The real value is always in the markup, so nothing is hidden without JavaScript.
 */
export function CountUp({ value, duration = 1400, delay = 0, immediate = false, className }: { value: number; duration?: number; delay?: number; immediate?: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let timer = 0;
    const run = () => {
      timer = window.setTimeout(() => {
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
          el.textContent = String(Math.round(value * eased));
          if (p < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      }, delay);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      el.textContent = String(value);
    };

    if (immediate) {
      el.textContent = "0";
      run();
      return stop;
    }
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.textContent = "0";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        run();
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      stop();
    };
  }, [value, duration, delay, immediate]);

  return (
    <span ref={ref} className={cx("tabular-nums", className)}>
      {value}
    </span>
  );
}
