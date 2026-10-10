"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, PasswordInput } from "@/components/ui/field";
import { api } from "@/lib/api";
import { setUser, useUser } from "@/lib/auth";
import { useHydrated } from "@/lib/use-hydrated";

export default function AccountPage() {
  const user = useUser();
  const ready = useHydrated();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-24 pt-14 sm:px-8">
        <h1 className="font-display text-[44px] font-semibold leading-[1.02] tracking-[-0.03em] text-ink">Account</h1>
        {ready && !user && (
          <div className="rise mt-10 rounded-3xl border border-line bg-surface p-8 shadow-lift">
            <p className="text-[15px] text-ink-2">Sign in to manage your account.</p>
            <LinkButton href="/sign-in?next=/account" className="mt-6">
              Sign in
            </LinkButton>
          </div>
        )}
        {ready && user && (
          <>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
              {user.name} · {user.email} · {user.role === "admin" ? "Interviewer" : "Candidate"}
            </p>
            <ChangePassword />
            <SignOutEverywhere />
          </>
        )}
      </main>
    </>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);
    if (next.length < 8) return setError("The new password needs at least 8 characters.");
    if (next !== confirm) return setError("The new passwords do not match.");
    if (next === current) return setError("Pick a password different from the current one.");
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-10 space-y-5 rounded-3xl border border-line bg-surface p-6 shadow-lift sm:p-8">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">Change password</h2>
        <p className="mt-1 text-[13px] text-ink-3">Every other device is signed out. This one stays signed in.</p>
      </div>
      <Field label="Current password">
        {(id) => <PasswordInput id={id} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />}
      </Field>
      <Field label="New password" hint="At least 8 characters. Common passwords are not allowed.">
        {(id) => <PasswordInput id={id} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />}
      </Field>
      <Field label="Confirm new password">
        {(id) => <PasswordInput id={id} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />}
      </Field>
      {error && (
        <p key={error} className="animate-shake rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="rise rounded-xl bg-accent-soft px-3.5 py-2.5 text-[13px] text-accent" role="status">
          Password changed. Other devices were signed out.
        </p>
      )}
      <Button type="submit" loading={busy} disabled={!current || !next || !confirm}>
        Change password
      </Button>
    </form>
  );
}

function SignOutEverywhere() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signOutEverywhere() {
    setBusy(true);
    setError(null);
    try {
      await api.signOutEverywhere();
      setUser(null);
      router.replace("/sign-in");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out everywhere.");
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-line bg-surface p-6 shadow-lift sm:p-8">
      <h2 className="font-display text-xl font-semibold text-ink">Sign out everywhere</h2>
      <p className="mt-1 text-[13px] text-ink-3">Ends every session on every device, including this one. Use it if you signed in on a computer you do not own.</p>
      {error && (
        <p key={error} className="mt-4 animate-shake rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
      <Button variant="secondary" className="mt-5" loading={busy} onClick={signOutEverywhere}>
        Sign out everywhere
      </Button>
    </section>
  );
}
