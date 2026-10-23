"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AudiraMark, Brand, Wordmark } from "@/components/brand";
import { SpeakingVoiceField } from "@/components/landing/voice-field";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { PageLoading } from "@/components/page-state";
import { api } from "@/lib/api";
import { setUser } from "@/lib/auth";
import type { User } from "@/lib/types";

type Mode = "sign-in" | "create";
type Purpose = "interviewing" | "hiring";

function safeNext(value: string | null, user: User): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return user.workspace ? "/admin" : "/";
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  // Someone following a team invite joins that team, so they do not start a workspace of their own.
  const joiningTeam = next?.startsWith("/invite/") ?? false;
  const [mode, setMode] = useState<Mode>(params.get("mode") === "create" ? "create" : "sign-in");
  const [purpose, setPurpose] = useState<Purpose>("interviewing");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const hiring = mode === "create" && purpose === "hiring" && !joiningTeam;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    // Manual validation — gives a visible error instead of a silent browser tooltip
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (mode === "create") {
      if (name.trim().length < 2) {
        setError("Name must be at least 2 characters.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (hiring && workspaceName.trim().length < 2) {
        setError("Name your team or company. At least 2 characters.");
        return;
      }
    }

    setBusy(true);
    try {
      const user =
        mode === "create"
          ? await api.register(name.trim(), email.trim(), password, hiring ? workspaceName.trim() : undefined)
          : await api.login(email.trim(), password);
      setUser(user);
      router.push(safeNext(next, user));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <BrandPanel />
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <span className="lg:hidden">
            <Brand />
          </span>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <form onSubmit={submit} noValidate className="w-full max-w-sm">
            <h1 key={mode} className="rise font-display text-[32px] font-semibold leading-tight tracking-[-0.025em] text-ink">
              {mode === "create" ? "Create your account" : "Welcome back"}
            </h1>
            <p key={`${mode}-sub`} className="rise mt-2 text-[15px] leading-relaxed text-ink-2" style={{ "--d": "60ms" } as React.CSSProperties}>
              {mode === "create"
                ? joiningTeam
                  ? "Create an account with the email your invite was sent to, then you join the team."
                  : "Candidates take the interview link a recruiter sent. Hiring teams publish one."
                : "Your account keeps interviews under your email."}
            </p>
            <div className="mt-7">
              <Segmented
                label="Account action"
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  setError(null);
                }}
                options={[
                  { value: "sign-in", label: "Sign in" },
                  { value: "create", label: "Create account" },
                ]}
              />
            </div>
            <div className="mt-7 space-y-4">
              {mode === "create" && (
                <div className="rise space-y-4">
                  {!joiningTeam && (
                    // Segmented is not a labellable input, so it gets a plain text label instead of a dangling htmlFor
                    <div className="flex flex-col items-start gap-1.5">
                      <p className="text-sm font-medium text-ink">I&apos;m</p>
                      <Segmented
                        label="What the account is for"
                        value={purpose}
                        onChange={setPurpose}
                        options={[
                          { value: "interviewing", label: "Interviewing" },
                          { value: "hiring", label: "Hiring" },
                        ]}
                      />
                    </div>
                  )}
                  <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}</Field>
                  {hiring && (
                    <div className="rise">
                      <Field label="Team or company" hint="This is your workspace. You can invite the rest of your team after.">
                        {(id) => (
                          <Input id={id} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} autoComplete="organization" placeholder="Acme Hiring" />
                        )}
                      </Field>
                    </div>
                  )}
                </div>
              )}
              <Field label="Email">
                {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@company.com" />}
              </Field>
              <Field label="Password" hint={mode === "create" ? "At least 8 characters. Common passwords are not allowed." : undefined}>
                {(id) => (
                  <PasswordInput
                    id={id}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "create" ? "new-password" : "current-password"}
                  />
                )}
              </Field>
            </div>
            {error && (
              <p key={error} className="mt-4 animate-shake rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="mt-7 w-full" loading={busy}>
              {mode === "create" ? "Create account" : "Sign in"}
            </Button>
            {next && (
              <p className="mt-4 text-center text-[13px] text-ink-3">
                {joiningTeam ? "You will return to your invite after signing in." : "You will return to the interview after signing in."}{" "}
                <Link href={next} className="text-ink-2 underline">
                  Cancel
                </Link>
              </p>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}

/** The left half on wide screens: the mark, speaking, over the green field. */
function BrandPanel() {
  return (
    <aside className="grain relative isolate hidden flex-col justify-between overflow-hidden bg-field p-10 text-field-ink lg:flex xl:p-14">
      <SpeakingVoiceField colorVar="--field-ink-2" className="absolute inset-x-0 bottom-0 -z-10 h-56 w-full opacity-60" />
      <Link href="/" className="brand inline-flex w-fit items-center gap-3 rounded-lg text-[19px]">
        <AudiraMark className="size-8" intro />
        <Wordmark intro />
      </Link>
      <div className="max-w-md pb-24">
        <AudiraMark live className="size-20 animate-pop" />
        <p className="rise mt-10 font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] xl:text-[48px]" style={{ "--d": "300ms" } as React.CSSProperties}>
          The interview that <span className="claim-mark close-mark bg-transparent">listens</span> before it scores.
        </p>
        <p className="rise mt-5 text-[16px] leading-relaxed text-field-ink-2" style={{ "--d": "420ms" } as React.CSSProperties}>
          A coding round against hidden tests, two spoken rounds that follow up on what was said, and a report that shows its evidence.
        </p>
      </div>
    </aside>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="flex min-h-dvh"><PageLoading /></main>}>
      <SignInForm />
    </Suspense>
  );
}
