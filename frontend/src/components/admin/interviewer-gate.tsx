"use client";

import { useRouter } from "next/navigation";
import { Button, LinkButton } from "@/components/ui/button";
import { setUser, useUser } from "@/lib/auth";

/** Shown on interviewer pages to anyone who is not signed in as an interviewer. */
export function InterviewerGate({ next }: { next: string }) {
  const router = useRouter();
  const user = useUser();
  const signIn = `/sign-in?next=${encodeURIComponent(next)}`;

  function switchAccount() {
    setUser(null);
    router.push(signIn);
  }

  return (
    <div className="mt-12 rounded-2xl border border-line bg-surface p-8">
      <p className="font-display text-xl font-semibold text-ink">Interviewer account needed</p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
        {user
          ? `You are signed in as a candidate (${user.email}). Sign out, then sign in with an interviewer account or create one with the access code.`
          : "Sign in with an interviewer account. Creating one needs the access code from whoever runs this BNB server."}
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
