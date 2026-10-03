"use client";

import { useState } from "react";
import { Check, CircleAlert, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cx, testStatusLabel } from "@/lib/format";
import type { CustomRunResult, JudgeResult, Problem, TestResult } from "@/lib/types";

export type ConsoleTab = "tests" | "result" | "custom";

export type ConsoleOutcome = { id: number } & (
  | { kind: "judge"; data: JudgeResult }
  | { kind: "custom"; data: CustomRunResult }
  | { kind: "error"; message: string }
);

type Props = {
  problem: Problem;
  tab: ConsoleTab;
  onTabChange: (tab: ConsoleTab) => void;
  customInput: string;
  onCustomInputChange: (value: string) => void;
  running: "run" | "submit" | null;
  outcome: ConsoleOutcome | null;
};

const tabs: { id: ConsoleTab; label: string }[] = [
  { id: "tests", label: "Test cases" },
  { id: "result", label: "Result" },
  { id: "custom", label: "Custom input" },
];

export function ConsolePanel({ problem, tab, onTabChange, customInput, onCustomInputChange, running, outcome }: Props) {
  return (
    <div className="flex h-full flex-col bg-surface">
      <div role="tablist" className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-3">
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => onTabChange(item.id)}
            className={cx(
              "relative h-10 px-3 text-[13px] font-medium transition-colors",
              tab === item.id ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {item.label}
            {item.id === "result" && outcome && !running && <OutcomeDot outcome={outcome} />}
            {tab === item.id && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === "tests" && <SampleTests problem={problem} />}
        {tab === "custom" && (
          <div className="flex h-full flex-col gap-2">
            <label htmlFor="custom-input" className="text-xs font-medium text-ink-3">
              Standard input for your program. Run uses this input while this tab is open.
            </label>
            <textarea
              id="custom-input"
              value={customInput}
              onChange={(e) => onCustomInputChange(e.target.value)}
              spellCheck={false}
              className="min-h-24 flex-1 resize-none rounded-lg border border-line bg-surface-2/60 p-3 font-mono text-[13px] text-ink focus:border-accent focus:outline-none"
            />
          </div>
        )}
        {tab === "result" && <ResultView running={running} outcome={outcome} />}
      </div>
    </div>
  );
}

function OutcomeDot({ outcome }: { outcome: ConsoleOutcome }) {
  const ok =
    (outcome.kind === "judge" && outcome.data.all_passed) || (outcome.kind === "custom" && outcome.data.status === "finished");
  return <span className={cx("ml-1.5 inline-block size-1.5 rounded-full align-middle", ok ? "bg-accent" : "bg-danger")} />;
}

function SampleTests({ problem }: { problem: Problem }) {
  const [active, setActive] = useState(0);
  const test = problem.sample_tests[active];
  return (
    <div>
      <CaseTabs count={problem.sample_tests.length} active={active} onSelect={setActive} />
      {test && (
        <div className="mt-4 space-y-3">
          <IoBlock label="Input" value={test.input} />
          <IoBlock label="Expected output" value={test.expected} />
        </div>
      )}
      <p className="mt-4 text-xs text-ink-3">
        Submitting runs these {problem.sample_tests.length} cases plus {problem.total_tests - problem.sample_tests.length} hidden ones.
      </p>
    </div>
  );
}

function CaseTabs({ count, active, onSelect, results }: { count: number; active: number; onSelect: (i: number) => void; results?: TestResult[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: count }, (_, i) => {
        const result = results?.[i];
        return (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
              active === i ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2/60",
            )}
          >
            {result && <span className={cx("size-1.5 rounded-full", result.passed ? "bg-accent" : "bg-danger")} />}
            Case {i + 1}
          </button>
        );
      })}
    </div>
  );
}

function IoBlock({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-ink-3">{label}</p>
      <pre
        className={cx(
          "max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg px-3.5 py-2.5 font-mono text-[13px] leading-relaxed",
          tone === "danger" ? "bg-danger-soft text-danger" : "bg-surface-2 text-ink",
        )}
      >
        {value === "" ? <span className="text-ink-3">(empty)</span> : value}
      </pre>
    </div>
  );
}

function Headline({ ok, title, detail }: { ok: boolean; title: string; detail?: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <h3 className={cx("font-display text-xl font-semibold", ok ? "text-accent" : "text-danger")}>{title}</h3>
      {detail && <span className="text-[13px] text-ink-3">{detail}</span>}
    </div>
  );
}

function ResultView({ running, outcome }: { running: "run" | "submit" | null; outcome: ConsoleOutcome | null }) {
  if (running) {
    return (
      <div className="flex h-full items-center justify-center gap-2.5 text-sm text-ink-2">
        <Spinner className="size-4 text-accent" />
        {running === "submit" ? "Running every test, including hidden ones" : "Running your code"}
      </div>
    );
  }
  if (!outcome) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm text-ink-2">Run your code to see results here.</p>
        <p className="text-xs text-ink-3">
          <Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd> runs the sample tests. <Kbd>Ctrl</Kbd> <Kbd>Shift</Kbd> <Kbd>Enter</Kbd> submits.
        </p>
      </div>
    );
  }
  if (outcome.kind === "error") {
    return (
      <div className="flex gap-3 rounded-xl bg-danger-soft p-4 text-sm text-danger">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        {outcome.message}
      </div>
    );
  }
  if (outcome.data.compile_error) {
    return (
      <div>
        <Headline ok={false} title="Compilation error" />
        <IoBlock label="Compiler output" value={outcome.data.compile_error} tone="danger" />
      </div>
    );
  }
  if (outcome.kind === "custom") return <CustomResult data={outcome.data} />;
  return <JudgeView key={outcome.id} data={outcome.data} />;
}

function CustomResult({ data }: { data: CustomRunResult }) {
  const ok = data.status === "finished";
  return (
    <div>
      <Headline ok={ok} title={testStatusLabel[data.status]} detail={data.duration_ms !== undefined ? `${data.duration_ms} ms` : undefined} />
      <div className="space-y-3">
        <IoBlock label="Output" value={data.stdout ?? ""} />
        {data.stderr && <IoBlock label="Error output" value={data.stderr} tone="danger" />}
      </div>
    </div>
  );
}

function JudgeView({ data }: { data: JudgeResult }) {
  const visible = data.results.filter((r) => !r.hidden);
  const hidden = data.results.filter((r) => r.hidden);
  const firstFailure = data.results.find((r) => !r.passed);
  const [active, setActive] = useState(() => Math.max(0, visible.findIndex((r) => !r.passed)));
  const slowest = Math.max(0, ...data.results.map((r) => r.duration_ms ?? 0));
  const test = visible[active];
  const scope = data.mode === "submit" ? "tests" : "sample tests";

  return (
    <div>
      <Headline
        ok={data.all_passed}
        title={data.all_passed ? "Accepted" : testStatusLabel[firstFailure?.status ?? "wrong_answer"]}
        detail={`${data.passed} of ${data.total} ${scope} passed, slowest ${slowest} ms`}
      />
      {visible.length > 0 && <CaseTabs count={visible.length} active={active} onSelect={setActive} results={visible} />}
      {test && (
        <div className="mt-4 space-y-3">
          {!test.passed && <p className="text-[13px] font-medium text-danger">{testStatusLabel[test.status]}</p>}
          <IoBlock label="Input" value={test.input ?? ""} />
          <IoBlock label="Your output" value={test.actual ?? ""} tone={test.passed ? undefined : "danger"} />
          <IoBlock label="Expected output" value={test.expected ?? ""} />
          {test.stderr && <IoBlock label="Error output" value={test.stderr} tone="danger" />}
        </div>
      )}
      {hidden.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium text-ink-3">Hidden tests</p>
          <div className="flex flex-wrap gap-2">
            {hidden.map((result) => (
              <span
                key={result.index}
                title={`Test ${result.index + 1}: ${testStatusLabel[result.status]}`}
                className={cx(
                  "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium",
                  result.passed ? "bg-accent-soft text-accent" : "bg-danger-soft text-danger",
                )}
              >
                {result.passed ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                {result.index + 1}
                {!result.passed && <span className="font-normal">{testStatusLabel[result.status]}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{children}</kbd>;
}
