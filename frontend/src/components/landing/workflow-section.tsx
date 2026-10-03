import type { CSSProperties } from "react";
import { Copy } from "lucide-react";
import { sampleScoreboard } from "@/components/landing/content";
import { PlayOnView } from "@/components/landing/motion";

function JobArtifact() {
  return (
    <div className="rounded-2xl border border-line bg-bg p-4">
      <p className="text-[14px] font-semibold text-ink">Backend Engineer, Payments</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">Go or Java, Postgres, queues. Owns production incidents end to end.</p>
      <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-ink-3">Focus: data modelling, debugging under pressure</p>
    </div>
  );
}

function LinkArtifact() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-bg p-4">
      <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">/i/k7q2-backend-payments</span>
      <span className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-ink-2" aria-hidden>
        <Copy className="size-3.5" />
      </span>
    </div>
  );
}

function ScoreboardArtifact() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-bg">
      <div className="flex items-center border-b border-line px-4 py-2.5">
        <span className="text-[12.5px] font-semibold text-ink">Backend Engineer, Payments</span>
        <span className="ml-auto text-[11.5px] text-ink-3">Sample</span>
      </div>
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line text-[11.5px] text-ink-3">
            <th className="px-4 py-2 font-medium">Candidate</th>
            <th className="px-2 py-2 text-right font-medium">Code</th>
            <th className="px-4 py-2 text-right font-medium">Overall</th>
          </tr>
        </thead>
        <tbody>
          {sampleScoreboard.map((row) => (
            <tr key={row.name} className="border-b border-line last:border-0">
              <td className="px-4 py-2.5">
                <p className="font-medium text-ink">{row.name}</p>
                <p className="text-[11.5px] text-ink-3">{row.status}</p>
              </td>
              <td className="px-2 py-2.5 text-right font-mono tabular-nums text-ink-2">{row.coding}</td>
              <td className="px-4 py-2.5 text-right font-display text-[18px] font-semibold tabular-nums text-ink">{row.overall ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const steps = [
  {
    title: "Publish the job",
    body: "Paste the job description and what you care about. The agent writes the coding problem and its tests, and plans the spoken rounds. It takes a minute or two.",
    artifact: <JobArtifact />,
  },
  {
    title: "Share one link",
    body: "Candidates sign in, add their résumé, and start. Spoken questions are written from that résumé and your job, so no two conversations are the same.",
    artifact: <LinkArtifact />,
  },
  {
    title: "Read the scoreboard",
    body: "Name, status, per-round scores, and the overall score for everyone who attempted it, each linked to their written report.",
    artifact: <ScoreboardArtifact />,
  },
];

export function WorkflowSection() {
  return (
    <section className="border-t border-line bg-surface">
      <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
        <PlayOnView className="max-w-2xl">
          <h2 className="play-rise text-balance font-display text-[34px] font-semibold leading-[1.06] tracking-[-0.03em] text-ink sm:text-[46px]">
            From a job description to a scoreboard.
          </h2>
        </PlayOnView>

        <PlayOnView className="relative mt-14 lg:mt-16">
          <span className="play-draw absolute left-0 right-0 top-[5px] hidden h-px bg-line-strong lg:block" aria-hidden />
          <ol className="grid gap-14 lg:grid-cols-3 lg:gap-10">
            {steps.map((step, i) => (
              <li key={step.title} className="play-rise relative" style={{ "--i": i * 3, "--d": "300ms" } as CSSProperties}>
                <span className="relative z-10 block size-[11px] rounded-full border-2 border-accent bg-surface" aria-hidden />
                <h3 className="mt-6 font-display text-[22px] font-semibold tracking-[-0.015em] text-ink">{step.title}</h3>
                <p className="mt-2.5 max-w-sm text-[15px] leading-relaxed text-ink-2">{step.body}</p>
                <div className="mt-6 max-w-sm">{step.artifact}</div>
              </li>
            ))}
          </ol>
        </PlayOnView>
      </div>
    </section>
  );
}
