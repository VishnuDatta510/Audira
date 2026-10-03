"use client";

import { useCallback, useEffect, useState } from "react";

type State<T> = { data: T | null; error: string | null; loading: boolean };

/** Loads data on mount (and when `key` changes); `reload` refetches without clearing current data. */
export function useLoad<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error: Error) => !cancelled && setState((s) => ({ data: s.data, error: error.message, loading: false })));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const setData = useCallback((data: T) => setState({ data, error: null, loading: false }), []);
  return { ...state, reload, setData };
}
