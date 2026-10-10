"use client";

import { useRouter } from "next/navigation";
import { AudiraMark } from "@/components/brand";
import { Button, LinkButton } from "@/components/ui/button";
import { signOut } from "@/lib/api";
import { useUser } from "@/lib/auth";

/** Shown on interviewer pages to anyone who is not signed in as an interviewer. */
export function InterviewerGate({ next }: { next: string }) {
  const router = useRouter();
  const user = useUser();
  const signIn = `/sign-in?next=${encodeURIComponent(next)}`;

  async function switchAccount() {
    await signOut();
    router.push(signIn);
  }

  return (
    <div className="rise mt-12 rounded-3xl border border-line bg-surface p-8 shadow-lift">
      <AudiraMark live className="mb-6 size-11" />
      <p className="font-display text-xl font-semibold text-ink">Interviewer account needed</p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
        {user
          ? `You are signed in as a candidate (${user.email}). Sign out, then sign in with an interviewer account or create one with the access code.`
          : "Sign in with an interviewer account. Creating one needs the access code from whoever runs this Audira workspace."}
      </p>
      {user ? (
        <Button className="mt-6" onClick={switchAccount}>
          Sign out and switch
        </Button>
      ) : (
        <LinkButton href={signIn} className="mt-6">
          Sign in
        </LinkButton>
      )}
    </div>
  );
}
