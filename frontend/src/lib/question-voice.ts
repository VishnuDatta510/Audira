import { api } from "@/lib/api";

export type SpeakResult = "played" | "blocked" | "fallback" | "failed" | "cancelled";

type Hooks = {
  onStart?: () => void;
  onEnd?: () => void;
};

const CLIP_LIMIT = 8;

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Plays the interviewer question. Cartesia audio comes from the API; the browser voice is only a fallback. */
export class QuestionSpeaker {
  private audio: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private token = 0;
  private abort: AbortController | null = null;
  private clips = new Map<string, Blob>();

  constructor(private readonly sessionId: string) {}

  /** Call from a click so later questions can play without another gesture. */
  unlock(): void {
    const context = this.context();
    if (context.state === "suspended") void context.resume();
    const buffer = context.createBuffer(1, 1, 22050);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    try {
      source.start();
    } catch {
      // resume() was issued in this gesture; playback can start once the context is running.
    }
  }

  stop(): void {
    this.token += 1;
    this.abort?.abort();
    this.halt();
  }

  async ask(question: string, hooks: Hooks = {}): Promise<SpeakResult> {
    const token = ++this.token;
    this.halt();
    try {
      let blob = this.clips.get(question);
      if (!blob) {
        const fetched = await this.fetchClip(token);
        if (!fetched || token !== this.token) return "cancelled";
        blob = fetched;
        this.remember(question, blob);
      }
      if (token !== this.token) return "cancelled";
      return await this.play(blob, token, hooks);
    } catch (error) {
      if (token !== this.token || isAbort(error)) return "cancelled";
      console.warn("Cartesia question audio failed; using the browser voice.", error);
      if (this.browserSpeak(question, token, hooks)) return "fallback";
      return "failed";
    }
  }

  private context(): AudioContext {
    this.audio ??= new AudioContext();
    return this.audio;
  }

  private halt(): void {
    window.speechSynthesis?.cancel();
    if (!this.source) return;
    try {
      this.source.stop();
    } catch {
      // The buffer had already ended.
    }
    this.source = null;
  }

  private remember(question: string, blob: Blob): void {
    this.clips.delete(question);
    this.clips.set(question, blob);
    while (this.clips.size > CLIP_LIMIT) {
      const oldest = this.clips.keys().next().value;
      if (oldest === undefined) break;
      this.clips.delete(oldest);
    }
  }

  private async fetchClip(token: number): Promise<Blob | null> {
    this.abort?.abort();
    const controller = new AbortController();
    this.abort = controller;
    const blob = await api.questionSpeech(this.sessionId, controller.signal);
    if (token !== this.token) return null;
    return blob;
  }

  private async play(blob: Blob, token: number, hooks: Hooks): Promise<SpeakResult> {
    const context = this.context();
    if (context.state !== "running") {
      try {
        await context.resume();
      } catch {
        // Autoplay is still blocked until the candidate clicks Hear the question.
      }
    }
    if (context.state !== "running") return "blocked";
    if (token !== this.token) return "cancelled";
    const bytes = await blob.arrayBuffer();
    if (token !== this.token) return "cancelled";
    const buffer = await context.decodeAudioData(bytes.slice(0));
    if (token !== this.token) return "cancelled";
    this.halt();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.source = source;
    source.onended = () => {
      if (this.source === source) this.source = null;
      if (token === this.token) hooks.onEnd?.();
    };
    hooks.onStart?.();
    source.start();
    return "played";
  }

  private browserSpeak(text: string, token: number, hooks: Hooks): boolean {
    if (!window.speechSynthesis || !text) return false;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    const alive = () => token === this.token;
    utterance.onstart = () => {
      if (alive()) hooks.onStart?.();
    };
    utterance.onend = () => {
      if (alive()) hooks.onEnd?.();
    };
    utterance.onerror = () => {
      if (alive()) hooks.onEnd?.();
    };
    window.setTimeout(() => {
      if (alive()) window.speechSynthesis.speak(utterance);
    }, 0);
    return true;
  }
}
