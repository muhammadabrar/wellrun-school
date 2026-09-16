import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ink" | "danger";
type Size = "sm" | "md" | "lg";

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[0.8rem]",
  md: "h-8 px-2.5 text-sm",
  lg: "h-9 px-3 text-sm",
};

const idle: Record<Variant, string> = {
  primary: "bg-indigo text-white hover:bg-indigo/80",
  secondary: "border border-line bg-surface text-ink hover:bg-paper",
  ink: "bg-ink text-white hover:bg-ink/90",
  danger: "bg-danger/10 text-danger hover:bg-danger/20",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  icon,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-transparent font-medium whitespace-nowrap transition-colors select-none",
        "focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        sizes[size],
        isDisabled && !loading ? "bg-line text-muted-foreground" : idle[variant],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}
