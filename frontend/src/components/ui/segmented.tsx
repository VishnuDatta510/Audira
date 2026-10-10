"use client";

import { useLayoutEffect, useRef } from "react";
import { cx } from "@/lib/format";

type Option<T extends string | number> = { value: T; label: React.ReactNode };

/** Radio group with a thumb that springs to the chosen option. Arrow keys move the choice. */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  label: string;
  size?: "sm" | "md";
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const thumb = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  useLayoutEffect(() => {
    const place = () => {
      const el = buttons.current[index];
      const t = thumb.current;
      if (!el || !t) return;
      if (!placed.current) t.style.transition = "none";
      t.style.width = `${el.offsetWidth}px`;
      t.style.transform = `translateX(${el.offsetLeft}px)`;
      t.style.opacity = "1";
      if (!placed.current) {
        void t.offsetWidth;
        t.style.transition = "";
        placed.current = true;
      }
    };
    place();
    const observer = new ResizeObserver(place);
    buttons.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [index, options.length]);

  function onKeyDown(event: React.KeyboardEvent) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    buttons.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="relative inline-flex rounded-xl border border-line bg-surface-2 p-[3px]">
      <span
        ref={thumb}
        aria-hidden
        className="absolute inset-y-[3px] left-0 rounded-[9px] bg-surface opacity-0 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.1),0_4px_12px_-4px_hsl(var(--shadow-color)/0.18)] ring-1 ring-line transition-[transform,width] duration-500 ease-spring"
      />
      {options.map((option, i) => {
        const active = i === index;
        return (
          <button
            key={String(option.value)}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cx(
              "relative z-10 rounded-[9px] font-medium transition-[color,transform] duration-300 active:scale-95",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-4 text-sm",
              active ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
