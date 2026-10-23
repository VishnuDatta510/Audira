"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/format";

/** Copies `text` and shows a check for two seconds. */
export function CopyButton({ text, label = "Copy link", failedLabel = "Copy the link below", className }: { text: string; label?: string; failedLabel?: string; className?: string }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    window.setTimeout(() => setCopied("idle"), 2000);
  }

  return (
    <Button variant={copied === "copied" ? "primary" : "secondary"} onClick={copy} className={cx("min-w-32", className)}>
      <span className="relative grid size-4 place-items-center">
        <Copy className={cx("absolute size-4 transition-[transform,opacity] duration-500 ease-spring", copied === "copied" ? "scale-50 opacity-0" : "scale-100 opacity-100")} />
        <Check className={cx("absolute size-4 transition-[transform,opacity] duration-500 ease-spring", copied === "copied" ? "scale-100 opacity-100" : "scale-50 opacity-0")} strokeWidth={3} />
      </span>
      {copied === "copied" ? "Copied" : copied === "failed" ? failedLabel : label}
    </Button>
  );
}
