import type { CSSProperties } from "react";
import { HomeActions } from "@/components/home-actions";
import { PlayOnView } from "@/components/landing/motion";
import { SpeakingVoiceField } from "@/components/landing/voice-field";

export function ClosingSection() {
  return (
    <section className="relative isolate overflow-hidden bg-field text-field-ink">
      <SpeakingVoiceField colorVar="--field-ink-2" className="absolute inset-x-0 bottom-0 -z-10 h-32 w-full opacity-70 lg:h-44" />
      <PlayOnView className="mx-auto max-w-7xl px-5 pb-44 pt-24 sm:px-8 lg:pb-56 lg:pt-32">
        <h2 className="play-rise max-w-[16ch] text-balance font-display text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[64px] xl:text-[76px]">
          Send the interview. <span className="claim-mark close-mark bg-transparent">Read what happened.</span>
        </h2>
        <p className="play-rise mt-7 max-w-lg text-[17px] leading-relaxed text-field-ink-2" style={{ "--d": "300ms" } as CSSProperties}>
          Publishing takes a minute or two. Interviewer accounts need an access code; candidates only need the link.
        </p>
        <div className="play-rise" style={{ "--d": "450ms" } as CSSProperties}>
          <HomeActions className="mt-10" inverse />
        </div>
      </PlayOnView>
    </section>
  );
}
