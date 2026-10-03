"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Brand } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { api } from "@/lib/api";
import { setUser } from "@/lib/auth";
import type { AccountRole } from "@/lib/types";

type Mode = "sign-in" | "create";

function safeNext(value: string | null, role: AccountRole): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return role === "admin" ? "/admin" : "/";
}

function SignInForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [mode, setMode] = useState<Mode>("sign-in");
  const [accountRole, setAccountRole] = useState<AccountRole>("candidate");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    // Manual validation — gives a visible error instead of a silent browser tooltip
    if (mode === "create") {
      if (name.trim().length < 2) {
        setError("Name must be at least 2 characters.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (accountRole === "admin" && !accessCode.trim()) {
        setError("Enter the interviewer access code.");
        return;
      }
    }

    setBusy(true);
    try {
      const user =
        mode === "create" ? await api.register(name, email, password, accountRole, accessCode) : await api.login(email, password);
      setUser(user);
      router.push(safeNext(next, user.role));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-16">
      <Brand />
      <form onSubmit={submit} noValidate className="mt-10 w-full max-w-sm rounded-2xl border border-line bg-surface p-7 shadow-lift">
        <h1 className="font-display text-2xl font-semibold text-ink">{mode === "create" ? "Create your account" : "Welcome back"}</h1>
        <p className="mt-1.5 text-sm text-ink-2">
          {mode === "create" ? "Candidates take the interview link a recruiter sent. Interviewers publish one." : "Your account keeps interviews under your email."}
        </p>
        <div className="mt-6">
          <Segmented
            label="Account action"
            value={mode}
            onChange={setMode}
            options={[
              { value: "sign-in", label: "Sign in" },
              { value: "create", label: "Create account" },
            ]}
          />
        </div>
        <div className="mt-6 space-y-4">
          {mode === "create" && (
            <>
              {/* Segmented is not a labellable input — use a plain label div to avoid a dangling htmlFor */}
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium text-ink">I am</p>
                <Segmented
                  label="Account role"
                  value={accountRole}
                  onChange={setAccountRole}
                  options={[
                    { value: "candidate", label: "Candidate" },
                    { value: "admin", label: "Interviewer" },
                  ]}
                />
              </div>
              <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}</Field>
              {accountRole === "admin" && (
                <Field label="Interviewer access code" hint="Ask whoever runs this BNB server for the code.">
                  {(id) => <Input id={id} value={accessCode} onChange={(e) => setAccessCode(e.target.value)} autoComplete="off" />}
                </Field>
              )}
            </>
          )}
          <Field label="Email">
            {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />}
          </Field>
          <Field label="Password" hint={mode === "create" ? "At least 8 characters." : undefined}>
            {(id) => (
              <Input
                id={id}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "create" ? "new-password" : "current-password"}
              />
            )}
          </Field>
        </div>
        {error && <p className="mt-4 text-[13px] text-danger">{error}</p>}
        <Button type="submit" className="mt-6 w-full" loading={busy}>
          {mode === "create" ? "Create account" : "Sign in"}
        </Button>
        {next && (
          <p className="mt-4 text-center text-[13px] text-ink-3">
            You will return to the interview after signing in. <Link href={next} className="text-ink-2 underline">Cancel</Link>
          </p>
        )}
      </form>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="flex min-h-dvh items-center justify-center text-sm text-ink-3">Loading</main>}>
      <SignInForm />
    </Suspense>
  );
}
