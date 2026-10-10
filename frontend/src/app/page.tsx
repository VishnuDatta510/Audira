import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { ClosingSection } from "@/components/landing/closing-section";
import { CodingSection } from "@/components/landing/coding-section";
import { FollowUps } from "@/components/landing/follow-ups";
import { Hero } from "@/components/landing/hero";
import { MonitoringSection } from "@/components/landing/monitoring-section";
import { ReportSection } from "@/components/landing/report-section";
import { WorkflowSection } from "@/components/landing/workflow-section";

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
      <SiteFooter />
    </>
  );
}
