"use client";

import { useCallback, useState } from "react";
import type { Problem } from "@/lib/types";

const LANGUAGE_KEY = "bnb:language";

function draftKey(scope: string, slug: string, language: string) {
  return `bnb:code:${scope}:${slug}:${language}`;
}

export function preferredLanguage(available: string[]): string {
  const saved = typeof window !== "undefined" ? window.localStorage.getItem(LANGUAGE_KEY) : null;
  if (saved && available.includes(saved)) return saved;
  return available.includes("python") ? "python" : available[0];
}

/** Keeps one draft per language, persisted locally so a refresh never loses work. */
export function useCodeDrafts(scope: string, problem: Problem, initialLanguage: string) {
  const [language, setLanguageState] = useState(initialLanguage);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => ({
    [initialLanguage]: load(scope, problem, initialLanguage),
  }));

  const code = drafts[language] ?? load(scope, problem, language);

  const setCode = useCallback(
    (next: string) => {
      setDrafts((current) => ({ ...current, [language]: next }));
      window.localStorage.setItem(draftKey(scope, problem.slug, language), next);
    },
    [language, problem.slug, scope],
  );

  const setLanguage = useCallback(
    (next: string) => {
      setDrafts((current) => (next in current ? current : { ...current, [next]: load(scope, problem, next) }));
      setLanguageState(next);
      window.localStorage.setItem(LANGUAGE_KEY, next);
    },
    [problem, scope],
  );

  const reset = useCallback(() => {
    const starter = problem.starter_code[language] ?? "";
    setDrafts((current) => ({ ...current, [language]: starter }));
    window.localStorage.removeItem(draftKey(scope, problem.slug, language));
  }, [language, problem, scope]);

  return { language, setLanguage, code, setCode, reset };
}

function load(scope: string, problem: Problem, language: string): string {
  const saved = typeof window !== "undefined" ? window.localStorage.getItem(draftKey(scope, problem.slug, language)) : null;
  return saved ?? problem.starter_code[language] ?? "";
}
