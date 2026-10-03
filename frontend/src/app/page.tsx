import Link from "next/link";
import { Brand, SiteHeader } from "@/components/site-header";
import { ClosingSection } from "@/components/landing/closing-section";
import { CodingSection } from "@/components/landing/coding-section";
import { FollowUps } from "@/components/landing/follow-ups";
import { Hero } from "@/components/landing/hero";
import { MonitoringSection } from "@/components/landing/monitoring-section";
import { ReportSection } from "@/components/landing/report-section";
import { WorkflowSection } from "@/components/landing/workflow-section";

const footerLinks = [
  { href: "#how-it-asks", label: "How it asks" },
  { href: "#coding", label: "Coding round" },
  { href: "#report", label: "Report" },
  { href: "#monitoring", label: "Monitoring" },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1" data-landing>
        <Hero />
        <FollowUps />
        <CodingSection />
        <ReportSection />
        <MonitoringSection />
        <WorkflowSection />
        <ClosingSection />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 sm:px-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <Brand />
            <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
              Camera and browser monitoring record observations for a person to review; they never decide that someone cheated. Candidates, transcripts,
              and scores on this page are illustrative.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]" aria-label="Page sections">
            {footerLinks.map((link) => (
              <a key={link.href} href={link.href} className="text-ink-2 transition-colors hover:text-ink">
                {link.label}
              </a>
            ))}
            <Link href="/sign-in" className="text-ink-2 transition-colors hover:text-ink">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
