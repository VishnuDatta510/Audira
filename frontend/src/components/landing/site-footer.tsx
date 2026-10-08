import Link from "next/link";
import type { CSSProperties } from "react";
import { AudiraMark, Brand } from "@/components/brand";
import { PlayOnView } from "@/components/landing/motion";

const footerLinks = [
  { href: "#how-it-asks", label: "How it asks" },
  { href: "#coding", label: "Coding round" },
  { href: "#report", label: "Report" },
  { href: "#monitoring", label: "Monitoring" },
];

export function SiteFooter() {
  return (
    <footer className="overflow-hidden border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 pt-12 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-md">
          <Brand intro={false} />
          <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
            Camera and browser monitoring record observations for a person to review; they never decide that someone cheated. Candidates, transcripts,
            and scores on this page are illustrative.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]" aria-label="Page sections">
          {footerLinks.map((link) => (
            <a key={link.href} href={link.href} className="text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline">
              {link.label}
            </a>
          ))}
          <Link href="/sign-in" className="text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline">
            Sign in
          </Link>
        </nav>
      </div>

      {/* The sign-off: the wordmark at full width, rising out of the page edge. */}
      <PlayOnView className="mx-auto mt-10 max-w-7xl px-3 sm:px-6">
        <p
          aria-hidden
          className="flex select-none items-end justify-between overflow-hidden font-display text-[22vw] font-semibold leading-[0.78] tracking-[-0.06em] text-ink xl:text-[290px]"
        >
          <span className="flex">
            {"Audira".split("").map((letter, i) => (
              <span key={i} className="giant-letter" style={{ "--i": i } as CSSProperties}>
                {letter}
              </span>
            ))}
          </span>
          <span className="giant-letter mb-[0.08em] hidden sm:block" style={{ "--i": 6 } as CSSProperties}>
            <AudiraMark live className="size-[0.4em]" />
          </span>
        </p>
      </PlayOnView>
    </footer>
  );
}
