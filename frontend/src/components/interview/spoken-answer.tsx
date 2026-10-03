"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useSpokenAnswer } from "@/lib/use-spoken-answer";

type Props = {
  sessionId: string;
  epoch: string;
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onListeningChange: (listening: boolean) => void;
};

export function SpokenAnswer({ sessionId, epoch, disabled = false, onTranscript, onListeningChange }: Props) {
  const spoken = useSpokenAnswer(sessionId);
  const skip = useRef(false);
  const started = useRef(false);
  const seenEpoch = useRef(epoch);
  const wasDisabled = useRef(disabled);

  useEffect(() => {
    onListeningChange(spoken.listening);
  }, [spoken.listening, onListeningChange]);

  useEffect(() => {
    if (!started.current || skip.current) return;
    onTranscript(spoken.transcript);
  }, [spoken.transcript, spoken.listening, onTranscript]);

  useEffect(() => {
    if (seenEpoch.current === epoch) return;
    seenEpoch.current = epoch;
    skip.current = true;
    started.current = false;
    spoken.stop();
  }, [epoch, spoken.stop]);

  useEffect(() => {
    if (disabled && !wasDisabled.current) {
      skip.current = true;
      spoken.stop();
    }
    wasDisabled.current = disabled;
  }, [disabled, spoken.stop]);

  function speak() {
    skip.current = false;
    started.current = true;
    onTranscript("");
    spoken.start();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" onClick={spoken.listening ? spoken.stop : speak} disabled={disabled}>
        {spoken.listening ? "Stop speaking" : "Speak your answer"}
      </Button>
      {spoken.error ? (
        <p className="text-sm text-danger" role="status">
          {spoken.error}
        </p>
      ) : null}
      {spoken.listening ? (
        <p className="text-sm text-ink-2" role="status">
          Listening. A pause keeps the microphone on.
        </p>
      ) : null}
    </div>
  );
}
