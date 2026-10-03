"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listenSocketUrl } from "@/lib/api";
import { startMicCapture, type MicCapture } from "@/lib/capture-pcm";

export interface SpokenAnswerState {
  listening: boolean;
  transcript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

type ListenEvent =
  | { type: "ready" }
  | { type: "partial"; text: string }
  | { type: "final"; text: string }
  | { type: "error"; message: string };

function parseListenEvent(data: unknown): ListenEvent | null {
  if (typeof data !== "object" || data === null || !("type" in data)) return null;
  const event = data as { type?: unknown; text?: unknown; message?: unknown };
  switch (event.type) {
    case "ready":
      return { type: "ready" };
    case "partial":
      return typeof event.text === "string" ? { type: "partial", text: event.text } : null;
    case "final":
      return typeof event.text === "string" ? { type: "final", text: event.text } : null;
    case "error":
      return typeof event.message === "string" ? { type: "error", message: event.message } : null;
    default:
      return null;
  }
}

function applyListenEvent(
  event: ListenEvent,
  handlers: {
    onPartial: (text: string) => void;
    onFinal: (text: string) => void;
    onError: (message: string) => void;
  },
): void {
  switch (event.type) {
    case "ready":
      return;
    case "partial":
      handlers.onPartial(event.text);
      return;
    case "final":
      handlers.onFinal(event.text);
      return;
    case "error":
      handlers.onError(event.message);
      return;
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

export function useSpokenAnswer(sessionId: string): SpokenAnswerState {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const closingRef = useRef(false);
  const listeningRef = useRef(false);
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;

  const releaseMic = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;
  }, []);

  const closeSocket = useCallback(() => {
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) socket.close();
  }, []);

  const finish = useCallback(
    (text: string | null, message: string | null) => {
      closingRef.current = true;
      listeningRef.current = false;
      setListening(false);
      if (text !== null) setTranscript(text);
      if (message !== null) setError(message);
      releaseMic();
      closeSocket();
    },
    [closeSocket, releaseMic],
  );

  const stop = useCallback(() => {
    closingRef.current = true;
    listeningRef.current = false;
    setListening(false);
    releaseMic();
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "stop" }));
      return;
    }
    closeSocket();
  }, [closeSocket, releaseMic]);

  const start = useCallback(() => {
    if (sessionRef.current === "" || listeningRef.current) return;
    closingRef.current = false;
    listeningRef.current = true;
    setError(null);
    setTranscript("");
    setListening(true);

    const socket = new WebSocket(listenSocketUrl(sessionRef.current));
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;

    socket.onopen = () => {
      void startMicCapture((pcm) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(pcm);
      })
        .then((mic) => {
          if (closingRef.current || socketRef.current !== socket) {
            mic.stop();
            return;
          }
          micRef.current = mic;
        })
        .catch(() => {
          finish(null, "The microphone was blocked. Allow it in the browser, or type your answer.");
        });
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      let body: unknown;
      try {
        body = JSON.parse(event.data) as unknown;
      } catch {
        return;
      }
      const parsed = parseListenEvent(body);
      if (!parsed) return;
      applyListenEvent(parsed, {
        onPartial: (text) => setTranscript(text),
        onFinal: (text) => finish(text, null),
        onError: (message) => finish(null, message),
      });
    };

    socket.onerror = () => {
      if (closingRef.current) return;
      finish(null, "Listening failed. Try again, or type your answer.");
    };
  }, [finish]);

  useEffect(() => {
    return () => {
      closingRef.current = true;
      listeningRef.current = false;
      releaseMic();
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, [sessionId, releaseMic]);

  return { listening, transcript, error, start, stop };
}
