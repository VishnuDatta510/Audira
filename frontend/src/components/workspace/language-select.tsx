import { ChevronDown } from "lucide-react";
import type { Language } from "@/lib/types";

export function LanguageSelect({ languages, value, onChange }: { languages: Language[]; value: string; onChange: (id: string) => void }) {
  const runnable = languages.filter((l) => l.runnable);
  const editorOnly = languages.filter((l) => !l.runnable);
  return (
    <div className="relative">
      <select
        aria-label="Language"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none rounded-md border border-line bg-surface pl-3 pr-8 text-[13px] font-medium text-ink transition-colors hover:border-line-strong focus:border-accent focus:outline-none"
      >
        <optgroup label="Run and submit">
          {runnable.map((lang) => (
            <option key={lang.id} value={lang.id}>
              {lang.label}
            </option>
          ))}
        </optgroup>
        {editorOnly.length > 0 && (
          <optgroup label="Editor only on this server">
            {editorOnly.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.label}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
    </div>
  );
}
