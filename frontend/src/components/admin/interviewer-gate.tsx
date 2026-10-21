"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AudiraMark } from "@/components/brand";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, signOut } from "@/lib/api";
import { updateUser, useUser } from "@/lib/auth";
import { roleLabel } from "@/lib/format";
import type { MemberRole } from "@/lib/types";

const card = "rise mt-12 rounded-3xl border border-line bg-surface p-8 shadow-lift";

/** Shown on hiring pages to anyone who is not on a team, or whose role there is too low for the page. */
export function InterviewerGate({ next, minimum = "viewer" }: { next: string; minimum?: MemberRole }) {
  const router = useRouter();
  const user = useUser();
  const signIn = `/sign-in?next=${encodeURIComponent(next)}`;

  async function switchAccount() {
    await signOut();
    router.push(signIn);
  }

  if (!user) {
    return (
      <div className={card}>
        <AudiraMark live className="mb-6 size-11" />
        <p className="font-display text-xl font-semibold text-ink">Sign in to your hiring team</p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
          Interviews belong to a team workspace. Sign in, or create an account and start a workspace for your company.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <LinkButton href={signIn}>Sign in</LinkButton>
          <LinkButton href={`${signIn}&mode=create`} variant="secondary">
            Create an account
          </LinkButton>
        </div>
      </div>
    );
  }

  if (user.workspace) {
    return (
      <div className={card}>
        <AudiraMark live className="mb-6 size-11" />
        <p className="font-display text-xl font-semibold text-ink">This needs the {roleLabel[minimum].toLowerCase()} role</p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
          You are a {roleLabel[user.workspace.role].toLowerCase()} in {user.workspace.name}. Ask an owner to change your role if you need to do this.
        </p>
        <LinkButton href="/admin" variant="secondary" className="mt-6">
          Back to interviews
        </LinkButton>
      </div>
    );
  }

  return <StartWorkspace onSwitch={switchAccount} />;
}

/** A signed-in candidate can start a team of their own, or wait for an invite to someone else's. */
function StartWorkspace({ onSwitch }: { onSwitch: () => void }) {
  const user = useUser();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) return setError("Name your team or company. At least 2 characters.");
    setBusy(true);
    setError(null);
    try {
      updateUser(await api.createWorkspace(name.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the workspace.");
      setBusy(false);
    }
  }

  return (
    <div className={card}>
      <AudiraMark live className="mb-6 size-11" />
      <p className="font-display text-xl font-semibold text-ink">Start a hiring workspace</p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
        You are signed in as {user?.email} without a team. Start one and you own it, or ask a teammate for an invite link to theirs.
      </p>
      <form onSubmit={submit} noValidate className="mt-6 flex max-w-md flex-col gap-3 sm:flex-row sm:items-start">
        <Field label="Team or company" className="flex-1">
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" placeholder="Acme Hiring" />}
        </Field>
        <Button type="submit" loading={busy} className="sm:mt-[26px] sm:h-11">
          Create workspace
        </Button>
      </form>
      {error && (
        <p key={error} className="mt-4 max-w-md animate-shake rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
      <button onClick={onSwitch} className="mt-5 text-[13px] text-ink-3 underline-offset-4 transition-colors hover:text-ink hover:underline">
        Use a different account
      </button>
    </div>
  );
}
