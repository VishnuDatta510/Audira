import Link from "next/link";
import { forwardRef } from "react";
import { cx } from "@/lib/format";
import { Spinner } from "@/components/ui/spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none outline-offset-3 " +
  "transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-300 ease-expo " +
  "active:scale-[0.965] active:duration-100 disabled:pointer-events-none disabled:opacity-45 disabled:saturate-50";

const variants: Record<Variant, string> = {
  primary:
    "btn-sheen bg-accent text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.16),var(--shadow-press)] " +
    "hover:-translate-y-px hover:bg-accent-hover hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_10px_24px_-10px_var(--accent-glow),var(--shadow-press)] active:translate-y-0",
  secondary:
    "bg-surface text-ink border border-line-strong shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] hover:-translate-y-px hover:border-ink-3 hover:shadow-lift active:translate-y-0",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
  danger: "btn-sheen bg-danger text-white shadow-(--shadow-press) hover:-translate-y-px hover:bg-danger-strong active:translate-y-0",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-lg",
  md: "h-10 px-4 text-sm rounded-[11px]",
  lg: "h-12 px-6 text-[15px] rounded-[14px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cx(base, variants[variant], sizes[size], className);
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      <span
        className={cx(
          "grid overflow-hidden transition-[width,opacity,margin] duration-300 ease-expo",
          loading ? "w-4 opacity-100" : "-mr-2 w-0 opacity-0",
        )}
        aria-hidden
      >
        <Spinner className="size-4" />
      </span>
      {children}
    </button>
  );
});

type LinkButtonProps = React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function LinkButton({ variant = "primary", size = "md", className, ...rest }: LinkButtonProps) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}
