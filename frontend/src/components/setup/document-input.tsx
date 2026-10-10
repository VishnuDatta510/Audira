"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/field";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minLength: number;
};

export function DocumentInput({ id, value, onChange, placeholder, minLength }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.extractDocument(file);
      if (!result.text) throw new Error(`No text could be read from ${file.name}. Paste the text instead.`);
      onChange(result.text);
      setFileName(result.file_name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const short = value.trim().length > 0 && value.trim().length < minLength;

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !busy) void upload(file);
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
        className={cx(
          "relative overflow-hidden rounded-[11px] border bg-surface transition-[border-color,box-shadow] duration-300 ease-expo focus-within:border-accent focus-within:shadow-[0_0_0_4px_var(--accent-glow)]",
          dragging ? "border-accent shadow-[0_0_0_4px_var(--accent-glow)]" : "border-line-strong hover:border-ink-3",
        )}
      >
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-36 rounded-none border-0 shadow-none hover:border-0 focus:shadow-none"
        />
        <div className="flex items-center gap-3 border-t border-line bg-surface-2/50 px-3 py-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-accent transition-[background-color,transform] duration-300 hover:bg-accent-soft active:scale-95 disabled:opacity-60"
          >
            {busy ? <Spinner className="size-3.5" /> : <FileUp className="size-3.5 transition-transform duration-500 ease-spring group-hover:-translate-y-0.5" />}
            {busy ? "Reading file" : "Upload PDF, DOCX or TXT"}
          </button>
          <span className="hidden text-xs text-ink-3 sm:inline">or drop it here</span>
          <span className="ml-auto truncate text-xs tabular-nums text-ink-3">
            {fileName ? `${fileName}, ` : ""}
            {value.trim().length.toLocaleString()} characters
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </div>
        <div
          aria-hidden
          className={cx(
            "pointer-events-none absolute inset-1.5 grid place-items-center rounded-lg border-2 border-dashed border-accent bg-accent-soft/90 text-sm font-medium text-accent backdrop-blur-[2px] transition-[opacity,transform] duration-300 ease-expo",
            dragging ? "scale-100 opacity-100" : "scale-[0.98] opacity-0",
          )}
        >
          <span className="flex items-center gap-2">
            <FileUp className="size-4" />
            Drop to read the file
          </span>
        </div>
      </div>
      {error && (
        <p key={error} className="rise mt-1.5 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
      {!error && short && <p className="rise mt-1.5 text-[13px] text-amber">Add a little more detail: at least {minLength} characters.</p>}
    </div>
  );
}
