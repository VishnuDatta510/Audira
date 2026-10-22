"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { VoiceLoader } from "@/components/brand";
import { DocumentInput } from "@/components/setup/document-input";
import { InterviewerGate } from "@/components/admin/interviewer-gate";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Slider, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { hasRole, useUser } from "@/lib/auth";
import { useHydrated } from "@/lib/use-hydrated";
import type { Difficulty, InterviewDraft } from "@/lib/types";

const SAMPLE = {
  role: "Junior Software Engineer",
  job_description:
    "Build and maintain web applications with JavaScript and Python. Design REST APIs, write tests, and use data structures to keep features fast. Collaborate with designers and senior engineers in code review.",
  interview_focus: "Prioritize the role responsibilities, project architecture, and required technologies.",
};

export default function NewInterviewPage() {
  const router = useRouter();
  const user = useUser();
  const ready = useHydrated();
  const [role, setRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [focus, setFocus] = useState(SAMPLE.interview_focus);
  const [dsaEnabled, setDsaEnabled] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [minutes, setMinutes] = useState(20);
  const [projectCount, setProjectCount] = useState(3);
  const [fundamentalsCount, setFundamentalsCount] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const complete = role.trim().length >= 2 && jobDescription.trim().length >= 30 && focus.trim().length >= 5;
  const counts = [3, 4, 5].map((n) => ({ value: n, label: String(n) }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!complete) return;
    setBusy(true);
    setError(null);
    const draft: InterviewDraft = {
      role: role.trim(),
      job_description: jobDescription.trim(),
      interview_focus: focus.trim(),
      difficulty,
      dsa_enabled: dsaEnabled,
      dsa_duration_minutes: minutes,
      project_question_count: projectCount,
      fundamentals_question_count: fundamentalsCount,
    };
    try {
      const interview = await api.createInterview(draft);
      router.push(`/admin/interviews/${interview.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare the interview.");
      setBusy(false);
    }
  }

  if (!ready || !hasRole(user, "recruiter")) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-24 pt-14 sm:px-8">
          {ready && <InterviewerGate next="/admin/new" minimum="recruiter" />}
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-24 pt-14 sm:px-8">
        <h1 className="font-display text-[44px] font-semibold leading-[1.02] tracking-[-0.03em] text-ink">New interview</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2">
          The agent reads this job description once, writes a complete coding problem with tests, and later interviews each candidate out loud from the same criteria and their résumé.
        </p>
        <form onSubmit={submit} className="mt-10 space-y-8 rounded-3xl border border-line bg-surface p-6 shadow-lift sm:p-9">
          <Field label="Job title">{(id) => <Input id={id} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Software Engineer" />}</Field>
          <Field label="Job description">
            {(id) => <DocumentInput id={id} value={jobDescription} onChange={setJobDescription} minLength={30} placeholder="Responsibilities, required skills, the team's stack…" />}
          </Field>
          <Field label="What should the interviewer focus on?">
            {(id) => <Textarea id={id} value={focus} onChange={(e) => setFocus(e.target.value)} className="min-h-20" />}
          </Field>
          <Switch checked={dsaEnabled} onChange={setDsaEnabled} label="Include the coding round" description="The agent writes one original problem, with sample and hidden tests." />
          {dsaEnabled && (
            <div className="rise grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-ink">Difficulty</p>
                <Segmented
                  label="Difficulty"
                  value={difficulty}
                  onChange={setDifficulty}
                  options={[
                    { value: "easy", label: "Easy" },
                    { value: "medium", label: "Medium" },
                    { value: "hard", label: "Hard" },
                  ]}
                />
              </div>
              <div>
                <label htmlFor="minutes" className="mb-2 flex items-baseline justify-between text-sm font-medium text-ink">
                  Time limit <span key={minutes} className="animate-pop rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[12.5px] tabular-nums text-accent">{minutes} min</span>
                </label>
                <Slider id="minutes" min={5} max={90} step={5} value={minutes} onChange={setMinutes} className="mt-1" />
              </div>
            </div>
          )}
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Project topics</p>
              <Segmented label="Project topics" value={projectCount} onChange={setProjectCount} options={counts} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Fundamentals topics</p>
              <Segmented label="Fundamentals topics" value={fundamentalsCount} onChange={setFundamentalsCount} options={counts} />
            </div>
            <p className="text-[13px] text-ink-3 sm:col-span-2">Each topic gets an opening question and up to two follow-ups, depending on the answers.</p>
          </div>
          <div className="-mx-6 -mb-6 flex flex-wrap items-center gap-4 rounded-b-3xl border-t border-line bg-surface-2/50 px-6 py-5 sm:-mx-9 sm:-mb-9 sm:px-9">
            <Button type="submit" size="lg" disabled={!complete} loading={busy}>
              Prepare interview
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setRole(SAMPLE.role); setJobDescription(SAMPLE.job_description); setFocus(SAMPLE.interview_focus); }}>
              Use sample job
            </Button>
            {busy && (
              <p className="rise flex items-center gap-2.5 text-[13px] text-ink-2">
                <VoiceLoader className="h-3.5 text-accent" />
                The agent is reading the job and writing the coding problem. This can take a minute.
              </p>
            )}
            {error && (
              <p key={error} className="animate-shake text-[13px] text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        </form>
      </main>
    </>
  );
}
