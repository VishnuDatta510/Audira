import { cx } from "@/lib/format";

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-start justify-between gap-4 rounded-xl text-left"
    >
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-ink-3">{description}</span>}
      </span>
      <span
        className={cx(
          "relative mt-0.5 inline-flex h-[26px] w-11 shrink-0 rounded-full p-[3px] transition-[background-color,box-shadow] duration-300",
          checked ? "bg-accent shadow-[0_0_0_4px_var(--accent-glow)]" : "bg-line-strong group-hover:bg-ink-3",
        )}
      >
        {/* The thumb stretches while pressed, then springs across. */}
        <span
          className={cx(
            "h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-[transform,width,margin] duration-500 ease-spring group-active:w-6",
            checked ? "translate-x-[18px] group-active:-ml-1" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}
