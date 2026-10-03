"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { JobDescription } from "@/components/interview/job-description";
import { DocumentInput } from "@/components/setup/document-input";
import { SiteHeader } from "@/components/site-header";
import { PageError, PageLoading } from "@/components/page-state";
import { Button, LinkButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { DifficultyBadge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { setUser, useUser } from "@/lib/auth";
import { useHydrated } from "@/lib/use-hydrated";
import { useLoad } from "@/lib/use-load";

export default function InterviewLinkPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const user = useUser();
  const { data, error, reload } = useLoad(() => api.publicInterview(token), `${token}|${user?.email ?? ""}`);
  const ready = useHydrated();

  useEffect(() => {
    if (user && data?.signed_in === false) setUser(null);
  }, [user, data]);
  const [resume, setResume] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canStart = resume.trim().length >= 10;
  const next = `/i/${token}`;

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (!canStart) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const { session_id } = await api.joinInterview(token, resume.trim());
      router.push(`/session/${session_id}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not start the interview.");
      setBusy(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-24 pt-14 sm:px-8">
        {error && !data && <PageError message={error} onRetry={reload} />}
        {!data && !error && <PageLoading label="Loading the interview" />}
        {data && (
          <>
            <p className="text-sm text-ink-3">Interview</p>
            <h1 className="mt-1 font-display text-4xl font-semibold text-ink">{data.role}</h1>
            <div className="mt-4">
              <DifficultyBadge difficulty={data.difficulty} />
            </div>
            <JobDescription text={data.job_description} />
            <ul className="mt-6 space-y-1 text-sm text-ink-2">
              {data.dsa_enabled && <li>Coding round, {data.dsa_duration_minutes} minutes, written for this job</li>}
              <li>A spoken project round covering {data.project_question_count} topics from your résumé, with follow-ups</li>
              <li>A spoken fundamentals round covering {data.fundamentals_question_count} topics this job relies on, with follow-ups</li>
            </ul>
            {!ready ? null : !user ? (
              <div className="mt-10 rounded-2xl border border-line bg-surface p-6">
                <p className="font-display text-lg font-semibold text-ink">Sign in to begin</p>
                <p className="mt-1 text-sm text-ink-2">The interview is tied to your name and email so the recruiter knows whose answers they are reading.</p>
                <LinkButton href={`/sign-in?next=${encodeURIComponent(next)}`} className="mt-5">
                  Sign in
                </LinkButton>
              </div>
            ) : user.role === "admin" ? (
              <div className="mt-10 rounded-2xl border border-line bg-surface p-6">
                <p className="font-display text-lg font-semibold text-ink">This is the candidate&apos;s page</p>
                <p className="mt-1 text-sm text-ink-2">
                  You are signed in as an interviewer ({user.email}). Candidates open this link and sign in with their own account. Attempts show up on your scoreboard.
                </p>
                <LinkButton href="/admin" variant="secondary" className="mt-5">
                  Back to your interviews
                </LinkButton>
              </div>
            ) : data.my_session_id ? (
              <div className="mt-10 rounded-2xl border border-line bg-surface p-6">
                <p className="font-display text-lg font-semibold text-ink">You already started this interview</p>
                <p className="mt-1 text-sm text-ink-2">Each candidate gets one attempt. Pick up where you left off, {user.name}.</p>
                <LinkButton href={`/session/${data.my_session_id}`} className="mt-5">
                  Continue the interview
                </LinkButton>
              </div>
            ) : (
              <form onSubmit={start} className="mt-10 space-y-6">
                <p className="text-sm text-ink-2">
                  Continuing as {user.name} ({user.email}). You get one attempt. Your answers, your code and the monitoring observations go to the recruiter.
                </p>
                <Field label="Résumé">
                  {(id) => <DocumentInput id={id} value={resume} onChange={setResume} minLength={10} placeholder="Projects, what you built, the technologies you used…" />}
                </Field>
                {submitError && <p className="text-[13px] text-danger">{submitError}</p>}
                <Button type="submit" size="lg" disabled={!canStart} loading={busy}>
                  Start interview
                </Button>
              </form>
            )}
          </>
        )}
      </main>
    </>
  );
}
