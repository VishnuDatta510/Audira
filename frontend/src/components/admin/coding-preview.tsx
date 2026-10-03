import type { Problem } from "@/lib/types";

export function CodingPreview({ problem }: { problem: Problem }) {
  const hidden = Math.max(0, problem.total_tests - problem.sample_tests.length);
  return (
    <section className="mt-12 border-t border-line pt-10">
      <h2 className="font-display text-xl font-semibold text-ink">Coding problem the agent wrote</h2>
      <p className="mt-1 text-sm text-ink-3">
        Candidates see this after they start the round. {hidden} hidden {hidden === 1 ? "test stays" : "tests stay"} on the server.
      </p>
      <h3 className="mt-6 font-display text-lg font-semibold text-ink">{problem.title}</h3>
      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">{problem.description}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Input</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{problem.input_format}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Output</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{problem.output_format}</p>
        </div>
      </div>
      {problem.sample_tests.length > 0 && (
        <ol className="mt-6 space-y-3">
          {problem.sample_tests.map((sample) => (
            <li key={sample.index} className="rounded-xl border border-line bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Sample {sample.index + 1}</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-ink">{sample.input}</pre>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-3">Expected</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-ink">{sample.expected}</pre>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
