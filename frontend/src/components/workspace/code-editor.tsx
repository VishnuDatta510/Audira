"use client";

import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { Spinner } from "@/components/ui/spinner";
import { EDITOR_THEME, defineEditorThemes } from "@/components/workspace/monaco-themes";

type Props = {
  language: string;
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  onSubmit: () => void;
  readOnly?: boolean;
  fontSize: number;
};

const TAB_SIZE: Record<string, number> = { javascript: 2, typescript: 2, ruby: 2, kotlin: 4, go: 4 };

function monoFontFamily() {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim();
  return `${value || "ui-monospace"}, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
}

export function CodeEditor({ language, value, onChange, onRun, onSubmit, readOnly, fontSize }: Props) {
  const { resolvedTheme } = useTheme();
  const handlers = useRef({ onRun, onSubmit });
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  useEffect(() => {
    handlers.current = { onRun, onSubmit };
  }, [onRun, onSubmit]);

  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize, lineHeight: Math.round(fontSize * 1.6) });
  }, [fontSize]);

  const beforeMount = (monaco: Monaco) => defineEditorThemes(monaco);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => handlers.current.onRun());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => handlers.current.onSubmit());
    document.fonts?.ready.then(() => monaco.editor.remeasureFonts());
    editor.focus();
  };

  return (
    <Editor
      language={language}
      value={value}
      onChange={(next) => onChange(next ?? "")}
      theme={resolvedTheme === "dark" ? EDITOR_THEME.dark : EDITOR_THEME.light}
      beforeMount={beforeMount}
      onMount={onMount}
      loading={
        <div className="flex items-center gap-2 text-sm text-ink-3">
          <Spinner className="size-4" /> Loading editor
        </div>
      }
      options={{
        readOnly,
        fontSize,
        lineHeight: Math.round(fontSize * 1.6),
        fontFamily: typeof document === "undefined" ? undefined : monoFontFamily(),
        fontLigatures: true,
        tabSize: TAB_SIZE[language] ?? 4,
        insertSpaces: language !== "go",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        renderLineHighlight: "all",
        bracketPairColorization: { enabled: true },
        guides: { indentation: true, bracketPairs: "active" },
        padding: { top: 16, bottom: 16 },
        automaticLayout: true,
        fixedOverflowWidgets: true,
        stickyScroll: { enabled: false },
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        wordWrap: "off",
        tabCompletion: "on",
        quickSuggestions: { other: true, comments: false, strings: false },
      }}
    />
  );
}
