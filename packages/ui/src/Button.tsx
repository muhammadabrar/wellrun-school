import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ink" | "danger";
type Size = "sm" | "md" | "lg";

const sizes: Record<Size, string> = {
  sm: "h-10 px-3 text-sm",
  md: "h-11 px-4",
  lg: "h-12 px-5 text-base",
};

const idle: Record<Variant, string> = {
  primary: "bg-indigo text-white hover:bg-indigo-deep",
  secondary: "bg-paper text-ink hover:bg-line",
  ink: "bg-ink text-white hover:bg-ink/90",
  danger: "bg-danger text-white hover:bg-danger/90",
};

const loadingTone: Record<Variant, string> = {
  primary: "bg-indigo-deep text-white",
  secondary: "bg-line text-muted",
  ink: "bg-muted text-white",
  danger: "bg-danger/80 text-white",
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
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl font-medium transition-colors",
        sizes[size],
        isDisabled && !loading ? "cursor-not-allowed bg-line text-muted" : loading ? `cursor-wait ${loadingTone[variant]}` : idle[variant],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}
