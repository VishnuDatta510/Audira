"use client";

import { useSyncExternalStore } from "react";
import type { User } from "@/lib/types";

const KEY = "bnb:user";
const listeners = new Set<() => void>();

function read(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
}

export function setUser(user: User | null) {
  if (user) window.localStorage.setItem(KEY, JSON.stringify(user));
  else window.localStorage.removeItem(KEY);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function currentToken(): string | null {
  const raw = read();
  if (!raw) return null;
  try {
    const token = (JSON.parse(raw) as { token?: string }).token;
    return token || null;
  } catch {
    return null;
  }
}

export function useUser(): User | null {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}
