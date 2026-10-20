"use client";

import { useSyncExternalStore } from "react";
import { migrateLegacyStorage } from "@/lib/legacy-storage";
import type { MemberRole, User } from "@/lib/types";

const KEY = "audira:user";
const listeners = new Set<() => void>();

function read(): string | null {
  migrateLegacyStorage();
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

/** Stores a fresh copy of the signed-in user from the server, keeping this device's token. */
export function updateUser(me: Omit<User, "token">) {
  const token = currentToken();
  if (token) setUser({ ...me, token });
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

const RANK: Record<MemberRole, number> = { viewer: 0, recruiter: 1, owner: 2 };

/** Whether the user holds at least `minimum` in their workspace. A candidate holds nothing. */
export function hasRole(user: User | null, minimum: MemberRole): boolean {
  const role = user?.workspace?.role;
  return role !== undefined && RANK[role] >= RANK[minimum];
}
