"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export const SECTION_TITLES: Record<string, string> = {
  dsa: "Coding round",
  project: "Project round",
  fundamentals: "Fundamentals round",
  general: "Opening questions",
};

export const OBSERVATION_LABELS: Record<string, string> = {
  tab_hidden: "Left the interview tab",
  fullscreen_exit: "Tried to leave full-screen",
  face_missing: "Face not visible",
  multiple_people: "More than one person",
  low_light: "Lighting",
  suspicious_gaze: "Eyes off the screen",
  suspicious_lip_movement: "Mouth movement",
  suspicious_phone: "Phone in view",
  camera_unavailable: "Camera unavailable",
  mouth_motion: "Mouth movement (for review)",
};

export const COMMUNICATION_LABELS: Record<string, string> = {
  clarity: "Clarity",
  answer_structure: "Structure",
  evidence: "Evidence",
};

export function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-xl font-semibold text-ink">{children}</h2>;
}

export function Points({ items, tone }: { items: string[]; tone: "accent" | "amber" }) {
  return (
    <ul className="mt-3 space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-ink-2">
          <span className={tone === "accent" ? "mt-2 size-1.5 shrink-0 rounded-full bg-accent" : "mt-2 size-1.5 shrink-0 rounded-full bg-amber"} />
          {item}
        </li>
      ))}
    </ul>
  );
}

/** The browser's print dialog saves a PDF. Collapsed code opens first, and the title becomes the file name. */
export function DownloadPdfButton({ fileName }: { fileName: string }) {
  function download() {
    const closed = [...document.querySelectorAll("details:not([open])")];
    closed.forEach((el) => el.setAttribute("open", ""));
    const title = document.title;
    document.title = fileName;
    window.print();
    document.title = title;
    closed.forEach((el) => el.removeAttribute("open"));
  }

  return (
    <Button variant="secondary" size="sm" onClick={download} className="print:hidden">
      <FileDown className="size-4" />
      Download PDF
    </Button>
  );
}
