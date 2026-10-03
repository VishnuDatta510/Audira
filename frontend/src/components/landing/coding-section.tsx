import type { CSSProperties } from "react";
import { CodingDemo } from "@/components/landing/coding-demo";
import { languages } from "@/components/landing/content";
import { PlayOnView } from "@/components/landing/motion";

const facts = [
  {
    title: "Written for your job",
    body: "The agent writes the problem, starter code, and tests from the job description. Expected outputs come from running a reference solution, which is not stored.",
  },
  {
    title: "Hidden tests stay hidden",
    body: "Samples run as often as the candidate likes. Submit runs the hidden tests and ends the round. Hidden inputs are never shown.",
  },
  {
    title: "Nothing is lost",
    body: "Drafts save per problem and language. The timer lives on the server, so a refresh doesn't reset it. When time runs out, the editor is submitted.",
  },
];

export function CodingSection() {
  return (
    <section id="coding" className="scroll-mt-16">
      <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
        <PlayOnView className="grid items-end gap-6 lg:grid-cols-2 lg:gap-20">
          <h2 className="play-rise text-balance font-display text-[36px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[52px]">
            The tests decide. The agent explains.
          </h2>
          <p className="play-rise max-w-lg text-[17px] leading-relaxed text-ink-2" style={{ "--d": "300ms" } as CSSProperties}>
            The coding round is a real editor and a real judge. Code runs in a sandbox against tests written for your job, and the review adds likely
            complexity, labelled as an estimate.
          </p>
        </PlayOnView>

        <CodingDemo className="mt-14 lg:mt-16" />

        <PlayOnView className="mt-16 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((fact, i) => (
            <div key={fact.title} className="play-rise border-t border-ink pt-5" style={{ "--i": i * 2 } as CSSProperties}>
              <h3 className="font-display text-[18px] font-semibold text-ink">{fact.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{fact.body}</p>
            </div>
          ))}
          <div className="play-rise border-t border-ink pt-5" style={{ "--i": facts.length * 2 } as CSSProperties}>
            <h3 className="font-display text-[18px] font-semibold text-ink">{languages.length} languages</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{languages.join(", ")}.</p>
          </div>
        </PlayOnView>
      </div>
    </section>
  );
}
