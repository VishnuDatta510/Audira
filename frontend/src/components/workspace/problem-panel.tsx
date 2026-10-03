"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Lightbulb } from "lucide-react";
import { DifficultyBadge } from "@/components/ui/badge";
import type { Problem } from "@/lib/types";

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-16 shrink-0 pt-0.5 text-xs font-medium text-ink-3">{label}</span>
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[13px] leading-relaxed text-ink">{value || "(empty)"}</pre>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

export function ProblemPanel({ problem }: { problem: Problem }) {
  const [hintsShown, setHintsShown] = useState(0);

  return (
    <div className="h-full overflow-y-auto">
      <article className="px-6 py-6 lg:px-8">
        <h1 className="font-display text-[26px] font-semibold leading-tight text-ink">{problem.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <DifficultyBadge difficulty={problem.difficulty} />
          {problem.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-ink-2">
              {tag}
            </span>
          ))}
        </div>

        <div className="prose-problem mt-6">
          <ReactMarkdown>{problem.description}</ReactMarkdown>
        </div>

        {problem.examples.length > 0 && (
          <Section title="Examples">
            <div className="space-y-3">
              {problem.examples.map((example, i) => (
                <div key={i} className="rounded-xl border border-line bg-surface-2/60 p-4">
                  <p className="mb-3 text-xs font-medium text-ink-2">Example {i + 1}</p>
                  <div className="space-y-2">
                    <Block label="Input" value={example.input} />
                    <Block label="Output" value={example.output} />
                  </div>
                  {example.explanation && <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-ink-2">{example.explanation}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Input and output">
          <div className="prose-problem space-y-3">
            <div>
              <p className="text-xs font-medium text-ink-3">Your program reads</p>
              <div className="mt-1 whitespace-pre-line">
                <ReactMarkdown>{problem.input_format}</ReactMarkdown>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-ink-3">and prints</p>
              <div className="mt-1">
                <ReactMarkdown>{problem.output_format}</ReactMarkdown>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Constraints">
          <ul className="space-y-1.5">
            {problem.constraints.map((constraint) => (
              <li key={constraint} className="flex gap-2.5 font-mono text-[13px] text-ink-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-3" />
                {constraint}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Hints">
          <div className="space-y-2">
            {problem.hints.slice(0, hintsShown).map((hint, i) => (
              <div key={i} className="flex gap-3 rounded-xl bg-amber-soft px-4 py-3 text-[13px] leading-relaxed text-ink">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber" />
                {hint}
              </div>
            ))}
            {hintsShown === problem.hints.length && (
              <p className="px-1 pt-1 text-[13px] text-ink-2">
                Target complexity: <span className="font-mono text-ink">{problem.expected_time}</span> time and{" "}
                <span className="font-mono text-ink">{problem.expected_space}</span> space.
              </p>
            )}
            {hintsShown < problem.hints.length && (
              <button onClick={() => setHintsShown((n) => n + 1)} className="text-[13px] font-medium text-accent hover:underline">
                {hintsShown === 0 ? "Show a hint" : "Show another hint"} ({problem.hints.length - hintsShown} left)
              </button>
            )}
          </div>
        </Section>
      </article>
    </div>
  );
}
