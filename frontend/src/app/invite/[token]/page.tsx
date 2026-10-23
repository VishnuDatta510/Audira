"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AudiraMark } from "@/components/brand";
import { PageError, PageLoading } from "@/components/page-state";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { api, signOut } from "@/lib/api";
import { updateUser, useUser } from "@/lib/auth";
import { roleHint, roleLabel, timeUntil } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import { useLoad } from "@/lib/use-load";
import type { InvitePreview } from "@/lib/types";

function Accept({ token, invite }: { token: string; invite: InvitePreview }) {
  const router = useRouter();
  const user = useUser();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = `/invite/${token}`;
  const signIn = (mode: "create" | "sign-in") =>
    `/sign-in?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invite.email)}${mode === "create" ? "&mode=create" : ""}`;

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      updateUser(await api.acceptInvite(token));
      router.push("/admin");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not accept the invite.");
      setBusy(false);
    }
  }

  async function switchAccount() {
    await signOut();
    router.push(signIn("sign-in"));
  }

  if (!user) {
    return (
      <div className="mt-8 flex flex-wrap gap-2">
        <LinkButton href={signIn("create")} size="lg">
          Create an account
        </LinkButton>
        <LinkButton href={signIn("sign-in")} variant="secondary" size="lg">
          I have an account
        </LinkButton>
      </div>
    );
  }
  if (user.email !== invite.email) {
    return (
      <Note>
        <p>
          You are signed in as <span className="font-medium text-ink">{user.email}</span>. This invite only works for {invite.email}.
        </p>
        <Button variant="secondary" className="mt-5" onClick={switchAccount}>
          Sign in as {invite.email}
        </Button>
      </Note>
    );
  }
  if (user.workspace) {
    return (
      <Note>
        <p>
          You are already in <span className="font-medium text-ink">{user.workspace.name}</span>. Each account belongs to one team, so leave it from the Team page first.
        </p>
        <LinkButton href="/team" variant="secondary" className="mt-5">
          Go to your team
        </LinkButton>
      </Note>
    );
  }
  return (
    <>
      {error && (
        <p key={error} className="mt-6 animate-shake rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
      <Button size="lg" className="mt-8 w-full sm:w-auto" loading={busy} onClick={accept}>
        Join {invite.workspace_name}
      </Button>
    </>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="rise mt-8 flex flex-col items-start rounded-2xl border border-line bg-surface-2/60 p-5 text-sm leading-relaxed text-ink-2">{children}</div>;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const ready = useHydrated();
  const { data, error } = useLoad(() => api.previewInvite(token), token);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-5 pb-24 pt-14 sm:px-8">
        {error && !data && (
          <PageError
            message={error}
            action={
              <LinkButton href="/" variant="secondary" size="sm">
                Go home
              </LinkButton>
            }
          />
        )}
        {!data && !error && <PageLoading label="Opening your invite" />}
        {data && (
          <div className="rise mt-6 rounded-3xl border border-line bg-surface p-8 shadow-lift sm:p-10">
            <AudiraMark live className="size-12 animate-pop" />
            <p className="mt-8 text-sm text-ink-3">You are invited to join</p>
            <h1 className="mt-1 font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">{data.workspace_name}</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
              {data.invited_by_name} invited <span className="font-medium text-ink">{data.email}</span> to hire with them on Audira.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Badge tone="accent">{roleLabel[data.role]}</Badge>
              <span className="text-[13px] text-ink-3">{roleHint[data.role]}</span>
            </div>
            {ready && <Accept token={token} invite={data} />}
            <p className="mt-8 border-t border-line pt-5 text-[12px] text-ink-3">This link works once and expires {timeUntil(data.expires_at)}.</p>
          </div>
        )}
      </main>
    </>
  );
}
