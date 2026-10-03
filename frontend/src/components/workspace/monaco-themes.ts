import type { Monaco } from "@monaco-editor/react";

export const EDITOR_THEME = { light: "bnb-light", dark: "bnb-dark" } as const;

let defined = false;

export function defineEditorThemes(monaco: Monaco) {
  if (defined) return;
  defined = true;

  monaco.editor.defineTheme(EDITOR_THEME.light, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "8a94a3", fontStyle: "italic" },
      { token: "keyword", foreground: "1f6b57", fontStyle: "bold" },
      { token: "string", foreground: "9a5b13" },
      { token: "number", foreground: "b4403a" },
      { token: "type", foreground: "2f5d8a" },
      { token: "type.identifier", foreground: "2f5d8a" },
      { token: "delimiter", foreground: "4a5565" },
      { token: "identifier", foreground: "17202c" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#17202c",
      "editor.lineHighlightBackground": "#f4f6f8",
      "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": "#b5bcc6",
      "editorLineNumber.activeForeground": "#4a5565",
      "editorCursor.foreground": "#1f6b57",
      "editor.selectionBackground": "#1f6b5726",
      "editor.inactiveSelectionBackground": "#1f6b5714",
      "editorIndentGuide.background1": "#eceff3",
      "editorIndentGuide.activeBackground1": "#c7ced7",
      "editorBracketMatch.background": "#1f6b571a",
      "editorBracketMatch.border": "#1f6b5766",
      "editorWidget.background": "#ffffff",
      "editorWidget.border": "#dde2e8",
      "editorSuggestWidget.selectedBackground": "#e2efe9",
      "scrollbarSlider.background": "#17202c1a",
      "scrollbarSlider.hoverBackground": "#17202c33",
    },
  });

  monaco.editor.defineTheme(EDITOR_THEME.dark, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6f7b89", fontStyle: "italic" },
      { token: "keyword", foreground: "6cc6a9", fontStyle: "bold" },
      { token: "string", foreground: "e3b36a" },
      { token: "number", foreground: "f0968e" },
      { token: "type", foreground: "8db4e2" },
      { token: "type.identifier", foreground: "8db4e2" },
      { token: "delimiter", foreground: "a2adba" },
      { token: "identifier", foreground: "e6ebf1" },
    ],
    colors: {
      "editor.background": "#171d25",
      "editor.foreground": "#e6ebf1",
      "editor.lineHighlightBackground": "#1d242d",
      "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": "#46505d",
      "editorLineNumber.activeForeground": "#a2adba",
      "editorCursor.foreground": "#52b596",
      "editor.selectionBackground": "#52b59633",
      "editor.inactiveSelectionBackground": "#52b5961f",
      "editorIndentGuide.background1": "#232b35",
      "editorIndentGuide.activeBackground1": "#36414e",
      "editorBracketMatch.background": "#52b59624",
      "editorBracketMatch.border": "#52b59666",
      "editorWidget.background": "#1e252f",
      "editorWidget.border": "#28313c",
      "editorSuggestWidget.selectedBackground": "#19302a",
      "scrollbarSlider.background": "#e6ebf11a",
      "scrollbarSlider.hoverBackground": "#e6ebf133",
    },
  });
}
