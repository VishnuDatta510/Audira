import type { Difficulty, SectionStatus, TestStatus } from "@/lib/types";

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export const difficultyLabel: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export const sectionStatusLabel: Record<SectionStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  skipped: "Skipped",
};

export const testStatusLabel: Record<TestStatus | "finished", string> = {
  accepted: "Accepted",
  wrong_answer: "Wrong answer",
  runtime_error: "Runtime error",
  time_limit_exceeded: "Time limit exceeded",
  compile_error: "Compilation error",
  finished: "Finished",
};

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
