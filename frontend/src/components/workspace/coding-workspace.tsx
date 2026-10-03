"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { ArrowLeft, Minus, Play, Plus, RotateCcw, Send } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { CodeEditor } from "@/components/workspace/code-editor";
import { ConsolePanel, type ConsoleOutcome, type ConsoleTab } from "@/components/workspace/console-panel";
import { LanguageSelect } from "@/components/workspace/language-select";
import { ProblemPanel } from "@/components/workspace/problem-panel";
import { preferredLanguage, useCodeDrafts } from "@/components/workspace/use-code-drafts";
import { api, ApiError } from "@/lib/api";
import { useMediaQuery } from "@/lib/use-media-query";
import type { JudgeResult, Language, Problem } from "@/lib/types";

type Props = {
  problem: Problem;
  languages: Language[];
  /** Namespaces saved drafts, e.g. "session:<id>". */
  scope: string;
  backHref: string;
  backLabel: string;
  headerExtras?: React.ReactNode;
  submitLabel?: string;
  onSubmit: (language: string, code: string) => Promise<Omit<JudgeResult, "mode">>;
  locked?: boolean;
  /** Flip to true to submit the current code once, e.g. when a timer runs out. */
  autoSubmit?: boolean;
};

const FONT_SIZES = [12, 13, 14, 15, 16, 18];

function errorMessage(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : "Something went wrong while running your code.";
}

export function CodingWorkspace(props: Props) {
  const [initialLanguage] = useState(() => preferredLanguage(props.languages.map((l) => l.id)));
  return <Workspace key={props.problem.slug} {...props} initialLanguage={initialLanguage} />;
}

function Workspace({
  problem,
  languages,
  scope,
  backHref,
  backLabel,
  headerExtras,
  submitLabel = "Submit",
  onSubmit,
  locked,
  autoSubmit,
  initialLanguage,
}: Props & { initialLanguage: string }) {
  const { language, setLanguage, code, setCode, reset } = useCodeDrafts(scope, problem, initialLanguage);
  const [tab, setTab] = useState<ConsoleTab>("tests");
  const [customInput, setCustomInput] = useState(problem.sample_tests[0]?.input ?? "");
  const [running, setRunning] = useState<"run" | "submit" | null>(null);
  const [outcome, setOutcome] = useState<ConsoleOutcome | null>(null);
  const [fontSize, setFontSize] = useState(14);
  const wide = useMediaQuery("(min-width: 1024px)");

  const current = languages.find((l) => l.id === language);
  const canRun = Boolean(current?.runnable) && !locked && running === null;

  const run = useCallback(async () => {
    if (!canRun) return;
    const useCustom = tab === "custom";
    setRunning("run");
    setTab("result");
    try {
      const data = await api.runProblem(problem.slug, language, code, useCustom ? customInput : undefined);
      setOutcome(data.mode === "custom" ? { id: Date.now(), kind: "custom", data } : { id: Date.now(), kind: "judge", data });
    } catch (error) {
      setOutcome({ id: Date.now(), kind: "error", message: errorMessage(error) });
    } finally {
      setRunning(null);
    }
  }, [canRun, code, customInput, language, problem.slug, tab]);

  const submit = useCallback(async () => {
    if (!canRun) return;
    setRunning("submit");
    setTab("result");
    try {
      const data = await onSubmit(language, code);
      setOutcome({ id: Date.now(), kind: "judge", data: { ...data, mode: "submit" } });
    } catch (error) {
      setOutcome({ id: Date.now(), kind: "error", message: errorMessage(error) });
    } finally {
      setRunning(null);
    }
  }, [canRun, code, language, onSubmit]);

  const latestSubmit = useRef(submit);
  useEffect(() => {
    latestSubmit.current = submit;
  }, [submit]);

  useEffect(() => {
    if (autoSubmit) latestSubmit.current();
  }, [autoSubmit]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
      event.preventDefault();
      if (event.shiftKey) submit();
      else run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, submit]);

  const confirmReset = () => {
    if (window.confirm("Replace your code with the starter template for this language?")) reset();
  };

  const stepFont = (direction: 1 | -1) => {
    const index = FONT_SIZES.indexOf(fontSize) + direction;
    if (index >= 0 && index < FONT_SIZES.length) setFontSize(FONT_SIZES[index]);
  };

  const editorPane = (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <LanguageSelect languages={languages} value={language} onChange={setLanguage} />
        {current && !current.runnable && (
          <span className="hidden text-xs text-amber sm:inline">Needs a code runner for {current.label}. The editor still works.</span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton label="Smaller text" onClick={() => stepFont(-1)} disabled={fontSize === FONT_SIZES[0]}>
            <Minus className="size-3.5" />
          </IconButton>
          <span className="w-7 text-center font-mono text-[11px] text-ink-3" aria-live="polite">
            {fontSize}
          </span>
          <IconButton label="Larger text" onClick={() => stepFont(1)} disabled={fontSize === FONT_SIZES.at(-1)}>
            <Plus className="size-3.5" />
          </IconButton>
          <span className="mx-1.5 h-4 w-px bg-line" />
          <IconButton label="Reset to starter code" onClick={confirmReset} disabled={locked}>
            <RotateCcw className="size-3.5" />
          </IconButton>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <CodeEditor
          language={current?.monaco ?? language}
          value={code}
          onChange={setCode}
          onRun={run}
          onSubmit={submit}
          readOnly={locked}
          fontSize={fontSize}
        />
      </div>
    </div>
  );

  const consolePane = (
    <ConsolePanel
      problem={problem}
      tab={tab}
      onTabChange={setTab}
      customInput={customInput}
      onCustomInputChange={setCustomInput}
      running={running}
      outcome={outcome}
    />
  );

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
        <Link href={backHref} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">{backLabel}</span>
        </Link>
        <span className="h-5 w-px bg-line" />
        <p className="min-w-0 truncate font-display text-[15px] font-semibold text-ink">{problem.title}</p>
        <div className="ml-auto flex items-center gap-2">
          {headerExtras}
          <Button variant="secondary" size="sm" onClick={run} disabled={!canRun} loading={running === "run"} title="Run sample tests (Ctrl+Enter)">
            {running !== "run" && <Play className="size-3.5" />}
            Run
          </Button>
          <Button size="sm" onClick={submit} disabled={!canRun} loading={running === "submit"} title="Submit (Ctrl+Shift+Enter)">
            {running !== "submit" && <Send className="size-3.5" />}
            {submitLabel}
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <Group orientation={wide ? "horizontal" : "vertical"} className="min-h-0 flex-1">
        <Panel id="problem" defaultSize="40%" minSize="22%" className="bg-surface">
          <ProblemPanel problem={problem} />
        </Panel>
        <Separator className={wide ? "w-px" : "h-px"} />
        <Panel id="code" minSize="30%">
          <Group orientation="vertical" className="h-full">
            <Panel id="editor" defaultSize="64%" minSize="25%">
              {editorPane}
            </Panel>
            <Separator className="h-px" />
            <Panel id="console" defaultSize="36%" minSize="12%">
              {consolePane}
            </Panel>
          </Group>
        </Panel>
      </Group>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}
