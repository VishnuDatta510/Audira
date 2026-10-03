"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => undefined;

/** False during server render and hydration, true after. Pages that depend on the signed-in user wait for it. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
