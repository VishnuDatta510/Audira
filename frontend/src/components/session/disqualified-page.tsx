import { Brand } from "@/components/site-header";
import { LinkButton } from "@/components/ui/button";
import { describeWarning } from "@/lib/proctor/warning-copy";

export type ListedWarning = { type: string; details: string };

export function DisqualifiedPage({
  sessionId,
  warnings,
  limit,
  events,
  recruiterSession,
}: {
  sessionId: string;
  warnings: number;
  limit: number;
  events: ListedWarning[];
  recruiterSession: boolean;
}) {
  const count = warnings || events.length;
  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-6 pb-20 pt-8">
      <Brand />
      <p className="mt-16 text-sm font-medium text-danger">Interview stopped</p>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink">This interview has ended</h1>
      <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-ink-2">
        Monitoring recorded {count} of {limit} warnings, so the session is locked and cannot continue.{" "}
        {recruiterSession
          ? "The recruiter will see these observations and the answers you gave, and decides what happens next."
          : "These observations are for a person to review; none of them is proof of misconduct."}
      </p>
      <ol className="mt-10 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {events.map((event, index) => {
          const copy = describeWarning(event.type, event.details);
          return (
            <li key={`${event.type}-${index}`} className="flex gap-4 p-5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-danger-soft font-display text-sm font-semibold text-danger">{index + 1}</span>
              <div>
                <p className="font-medium text-ink">{copy.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{copy.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-8 flex flex-wrap gap-3">
        <LinkButton href="/" variant="secondary">Back home</LinkButton>
        {!recruiterSession && <LinkButton href={`/report/${sessionId}`}>View report</LinkButton>}
      </div>
    </main>
  );
}
