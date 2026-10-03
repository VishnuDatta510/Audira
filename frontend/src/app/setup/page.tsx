"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DocumentInput } from "@/components/setup/document-input";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { useUser } from "@/lib/auth";
import type { Difficulty, SessionProfile } from "@/lib/types";

const SAMPLE = {
  role: "Junior Software Engineer",
  job_description:
    "Build and maintain web applications with JavaScript and Python. Design REST APIs, write tests, and use data structures to keep features fast. Collaborate with designers and senior engineers in code review.",
  resume:
    "Built a React task manager with a Node.js API and PostgreSQL. Wrote a Python script that cut a weekly report from two hours to five minutes. Studied data structures and algorithms; solved 150 practice problems.",
  preparation_goal: "Explain my projects clearly and get faster at medium coding problems.",
};

function Group({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-line py-10 md:grid-cols-[15rem_1fr] md:gap-12">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{description}</p>
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const user = useUser();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resume, setResume] = useState("");
  const [goal, setGoal] = useState("");
  const [focus, setFocus] = useState("Prioritize the role responsibilities, project architecture, and required technologies.");
  const [dsaEnabled, setDsaEnabled] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [minutes, setMinutes] = useState(20);
  const [projectCount, setProjectCount] = useState(3);
  const [fundamentalsCount, setFundamentalsCount] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const candidateName = name || user?.name || "";
  const ready = candidateName.trim() && role.trim().length >= 2 && jobDescription.trim().length >= 30 && resume.trim().length >= 10 && goal.trim().length >= 5;

  function fillSample() {
    setName(candidateName || "Sample Candidate");
    setRole(SAMPLE.role);
    setJobDescription(SAMPLE.job_description);
    setResume(SAMPLE.resume);
    setGoal(SAMPLE.preparation_goal);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    const profile: SessionProfile = {
      candidate_name: candidateName.trim(),
      role: role.trim(),
      job_description: jobDescription.trim(),
      resume: resume.trim(),
      preparation_goal: goal.trim(),
      interview_focus: focus.trim(),
      difficulty,
      dsa_enabled: dsaEnabled,
      dsa_duration_minutes: minutes,
      project_question_count: projectCount,
      fundamentals_question_count: fundamentalsCount,
    };
    try {
      const { session_id } = await api.createSession(profile);
      router.push(`/session/${session_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the interview.");
      setBusy(false);
    }
  }

  const counts = [3, 4, 5].map((n) => ({ value: n, label: String(n) }));

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-24 pt-14 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-semibold text-ink">Set up your mock interview</h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2">
              The questions are written from the job description and your résumé, so the more specific they are, the closer this feels to the real thing. To send the same interview to several candidates,{" "}
              <Link href="/admin" className="font-medium text-ink underline">
                publish a link
              </Link>
              .
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={fillSample}>
            Use sample details
          </Button>
        </div>

        <form onSubmit={submit} className="mt-10">
          <Group title="The role" description="What you are interviewing for. Paste the posting or upload it.">
            <Field label="Job title">{(id) => <Input id={id} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Software Engineer" />}</Field>
            <Field label="Job description">
              {(id) => (
                <DocumentInput id={id} value={jobDescription} onChange={setJobDescription} minLength={30} placeholder="Responsibilities, required skills, the team's stack…" />
              )}
            </Field>
            <Field label="What should the interviewer focus on?" hint="Optional. Steers the project questions.">
              {(id) => <Textarea id={id} value={focus} onChange={(e) => setFocus(e.target.value)} className="min-h-20" />}
            </Field>
          </Group>

          <Group title="About you" description="Project questions come straight from your résumé.">
            <Field label="Your name">
              {(id) => <Input id={id} value={candidateName} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Ada Lovelace" />}
            </Field>
            <Field label="Résumé">
              {(id) => <DocumentInput id={id} value={resume} onChange={setResume} minLength={10} placeholder="Projects, what you built, the technologies you used…" />}
            </Field>
            <Field label="What do you want to get better at?">
              {(id) => <Textarea id={id} value={goal} onChange={(e) => setGoal(e.target.value)} className="min-h-20" placeholder="Explaining trade-offs, speed on medium problems…" />}
            </Field>
          </Group>

          <Group title="Rounds" description="The coding round comes first, then the spoken rounds.">
            <Switch checked={dsaEnabled} onChange={setDsaEnabled} label="Include the coding round" description="One timed problem, judged against hidden tests." />
            {dsaEnabled && (
              <div className="grid gap-6 sm:grid-cols-2">
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
                    Time limit <span className="font-mono text-[13px] text-ink-2">{minutes} min</span>
                  </label>
                  <input
                    id="minutes"
                    type="range"
                    min={5}
                    max={90}
                    step={5}
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                    className="mt-2 w-full accent-(--accent)"
                  />
                </div>
              </div>
            )}
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-ink">Project questions</p>
                <Segmented label="Project questions" value={projectCount} onChange={setProjectCount} options={counts} />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-ink">Fundamentals questions</p>
                <Segmented label="Fundamentals questions" value={fundamentalsCount} onChange={setFundamentalsCount} options={counts} />
              </div>
            </div>
          </Group>

          <div className="flex flex-wrap items-center gap-4 border-t border-line pt-8">
            <Button type="submit" size="lg" disabled={!ready} loading={busy}>
              Create interview
            </Button>
            {!ready && !error && <p className="text-[13px] text-ink-3">Fill in the role, job description, your name, résumé and goal to continue.</p>}
            {busy && <p className="text-[13px] text-ink-3">The interview agent is reading the job description and your résumé. This takes about ten seconds.</p>}
            {error && <p className="text-[13px] text-danger">{error}</p>}
          </div>
        </form>
      </main>
    </>
  );
}
