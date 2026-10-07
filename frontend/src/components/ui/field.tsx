import { forwardRef, useId } from "react";
import { cx } from "@/lib/format";

export const controlClass =
  "w-full rounded-[11px] border border-line-strong bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-3 " +
  "shadow-[inset_0_1px_2px_hsl(var(--shadow-color)/0.05)] transition-[border-color,box-shadow,background-color] duration-300 ease-expo " +
  "hover:border-ink-3 focus:border-accent focus:outline-none focus:shadow-[0_0_0_4px_var(--accent-glow)] " +
  "aria-invalid:border-danger aria-invalid:focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--danger)_22%,transparent)] " +
  "read-only:bg-surface-2/60 disabled:opacity-60";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: (id: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cx("field flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink transition-colors duration-300">
        {label}
      </label>
      <div key={error ?? ""} className={error ? "animate-shake" : undefined}>
        {children(id)}
      </div>
      {error ? (
        <p className="rise text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(controlClass, "h-11", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cx(controlClass, "min-h-28 py-3 leading-relaxed resize-y", className)} {...rest} />;
});

/** A range input whose track fills with the accent up to its value. */
export function Slider({
  id,
  value,
  min,
  max,
  step,
  onChange,
  className,
}: {
  id?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cx("slider w-full", className)}
      style={{ "--fill": `${fill}%` } as React.CSSProperties}
    />
  );
}
