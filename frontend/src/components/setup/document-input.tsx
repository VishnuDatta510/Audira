"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/field";
import { api } from "@/lib/api";

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

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-line-strong bg-surface transition-colors focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-36 rounded-none border-0 hover:border-0 focus:ring-0"
        />
        <div className="flex items-center gap-3 border-t border-line bg-surface-2/50 px-3 py-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-accent hover:bg-accent-soft disabled:opacity-60"
          >
            {busy ? <Spinner className="size-3.5" /> : <FileUp className="size-3.5" />}
            {busy ? "Reading file" : "Upload PDF, DOCX or TXT"}
          </button>
          <span className="ml-auto truncate text-xs text-ink-3">
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
      </div>
      {error && <p className="mt-1.5 text-[13px] text-danger">{error}</p>}
      {!error && short && <p className="mt-1.5 text-[13px] text-amber">Add a little more detail: at least {minLength} characters.</p>}
    </div>
  );
}
