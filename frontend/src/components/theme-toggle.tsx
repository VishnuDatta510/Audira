"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cx } from "@/lib/format";

const noop = () => () => {};

type TransitionDocument = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } };

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";

  function toggle(event: React.MouseEvent<HTMLButtonElement>) {
    const next = dark ? "light" : "dark";
    const doc = document as TransitionDocument;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || reduced) {
      setTheme(next);
      return;
    }
    // The new theme opens as a circle from the button that asked for it.
    const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const root = document.documentElement;
    const transition = doc.startViewTransition(() => {
      root.classList.remove("light", "dark");
      root.classList.add(next);
      root.style.colorScheme = next;
      setTheme(next);
    });
    void transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 700, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
  }

  return (
    <button
      onClick={toggle}
      className="relative grid size-9 place-items-center overflow-hidden rounded-[10px] text-ink-2 transition-[background-color,color,transform] duration-300 hover:bg-surface-2 hover:text-ink active:scale-90"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      <Sun
        className={cx("absolute size-4 transition-[transform,opacity] duration-500 ease-spring", mounted && dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0")}
      />
      <Moon
        className={cx("absolute size-4 transition-[transform,opacity] duration-500 ease-spring", mounted && !dark ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0")}
      />
    </button>
  );
}
