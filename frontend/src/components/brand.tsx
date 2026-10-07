"use client";

import Link from "next/link";
import { useEffect, useId, useState, type CSSProperties } from "react";
import { cx } from "@/lib/format";

/** One sine wave, long enough to slide one wavelength (4.4) inside the crossbar without showing an end. */
const WAVE = `M2 19 q1.1 -2.1 2.2 0${" t2.2 0".repeat(12)}`;

let introPlayed = false;

/** Plays the intro on the first render of the session only, not on every client-side navigation. */
function useIntro(requested: boolean) {
  const [intro] = useState(() => requested && !introPlayed);
  useEffect(() => {
    if (intro) introPlayed = true;
  }, [intro]);
  return intro;
}

/**
 * The Audira mark: an A whose crossbar is a voice. The wave idles quietly and speaks up on hover or while `live`.
 */
export function AudiraMark({ className, intro = false, live = false, title }: { className?: string; intro?: boolean; live?: boolean; title?: string }) {
  const clip = useId();
  return (
    <svg
      viewBox="0 0 32 32"
      className={cx("mark shrink-0 overflow-visible", className)}
      data-intro={intro}
      data-live={live}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <clipPath id={clip}>
          <rect x="11.2" y="14" width="9.6" height="10" />
        </clipPath>
      </defs>
      <rect className="mark-tile" width="32" height="32" rx="9.5" fill="var(--mark-tile, var(--field))" />
      <path
        className="mark-leg"
        pathLength={1}
        d="M8.6 25 L16 7.2 L23.4 25"
        fill="none"
        stroke="var(--mark-ink, var(--field-ink))"
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g className="mark-wave" clipPath={`url(#${clip})`}>
        <g className="mark-wave-amp">
          <path className="mark-wave-run" d={WAVE} fill="none" stroke="var(--field-mark)" strokeWidth="2.3" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

export function Wordmark({ intro = false, className }: { intro?: boolean; className?: string }) {
  return (
    <span className={cx("font-display font-semibold tracking-[-0.03em]", className)} data-intro={intro} aria-label="Audira">
      {"Audira".split("").map((letter, i) => (
        <span key={i} className="wordmark-letter" style={{ "--i": i } as CSSProperties} aria-hidden>
          {letter}
        </span>
      ))}
    </span>
  );
}

/** Mark plus wordmark, linking home. Plays its intro once per visit. */
export function Brand({ className, href = "/", intro = true }: { className?: string; href?: string; intro?: boolean }) {
  const play = useIntro(intro);
  return (
    <Link href={href} className={cx("brand group inline-flex items-center gap-2.5 rounded-lg text-[19px] text-ink", className)}>
      <AudiraMark className="size-8" intro={play} />
      <Wordmark intro={play} />
    </Link>
  );
}

/** Five bars breathing like a voice, for anything that waits on the interviewer. */
export function VoiceLoader({ className }: { className?: string }) {
  return (
    <span className={cx("voice-loader inline-flex h-4 items-center gap-[3px]", className)} aria-hidden>
      {[0.55, 0.85, 1, 0.7, 0.45].map((h, i) => (
        <span key={i} className="w-[3px] rounded-full bg-current" style={{ height: `${h * 100}%`, "--i": i } as CSSProperties} />
      ))}
    </span>
  );
}
