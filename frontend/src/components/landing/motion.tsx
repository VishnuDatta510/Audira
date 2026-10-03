"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { useMediaQuery } from "@/lib/use-media-query";
import { cx } from "@/lib/format";

/** static: shown as-is (already on screen, or reduced motion). armed: waiting below the fold. playing: entered view. */
export type PlayState = "static" | "armed" | "playing";

export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)", false);
}

/** Arms an element only when it starts below the viewport, so content is never hidden on first paint. */
export function usePlayOnView<T extends Element>(rootMargin = "0px 0px -15% 0px") {
  const ref = useRef<T>(null);
  const [state, setState] = useState<PlayState>("static");
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    let first = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (first) {
          first = false;
          if (entry.boundingClientRect.top > window.innerHeight) {
            setState("armed");
          } else {
            observer.disconnect();
          }
          return;
        }
        if (entry.isIntersecting) {
          setState("playing");
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced, rootMargin]);

  return [ref, state] as const;
}

export function PlayOnView({ className, children, id }: { className?: string; children: React.ReactNode; id?: string }) {
  const [ref, state] = usePlayOnView<HTMLDivElement>();
  return (
    <div ref={ref} id={id} data-play={state} className={className}>
      {children}
    </div>
  );
}

/** Splits a heading into words that resolve one after another inside a PlayOnView. */
export function SplitWords({ text, delay = 0, className }: { text: string; delay?: number; className?: string }) {
  const words = text.split(" ");
  return words.map((word, i) => (
    <Fragment key={`${i}-${word}`}>
      <span className={cx("play-rise inline-block", className)} style={{ "--i": i, "--d": `${delay}ms` } as CSSProperties}>
        {word}
      </span>
      {i < words.length - 1 ? " " : null}
    </Fragment>
  ));
}

export function VoiceBars({ on, count = 5, className }: { on: boolean; count?: number; className?: string }) {
  return (
    <span data-voice={on ? "on" : "off"} className={cx("flex h-4 items-center gap-[3px]", className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="voice-bar h-full w-[3px] rounded-full bg-current" style={{ "--i": i } as CSSProperties} />
      ))}
    </span>
  );
}
