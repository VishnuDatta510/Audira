"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { useUser } from "@/lib/auth";
import { cx } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";

/** The hero call to action: recruiters publish, candidates are pointed at their link. */
export function HomeActions({
  className = "mt-9",
  sampleHref,
  inverse = false,
}: {
  className?: string;
  sampleHref?: string;
  /** For use on the dark green field. */
  inverse?: boolean;
}) {
  const user = useUser();
  const ready = useHydrated();

  if (ready && user && !user.workspace) {
    return (
      <div className={cx("max-w-lg rounded-2xl border border-line bg-surface p-5", className)}>
        <p className="font-display text-lg font-semibold text-ink">Signed in as {user.name}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          Open the interview link your recruiter sent you. The interview starts from that page. Hiring?{" "}
          <Link href="/admin" className="font-medium text-ink underline-offset-4 hover:underline">
            Start a workspace
          </Link>
          .
        </p>
      </div>
    );
  }
  return (
    <div className={cx("flex flex-wrap items-center gap-x-6 gap-y-3", className)}>
      <LinkButton
        href="/admin"
        size="lg"
        className={cx("group", inverse && "bg-field-ink! text-field! shadow-none! hover:bg-white!")}
      >
        {ready && user?.workspace ? "Your interviews" : "Publish an interview"}
        <ArrowRight className="size-4 transition-transform duration-300 ease-expo group-hover:translate-x-0.5" />
      </LinkButton>
      {sampleHref && (
        <a
          href={sampleHref}
          className="inline-flex h-12 items-center text-[15px] font-medium text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Read a sample report
        </a>
      )}
    </div>
  );
}
