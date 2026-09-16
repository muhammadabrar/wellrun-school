import type { ReactNode } from "react";
import { cx } from "./cx";

type Tone = "neutral" | "indigo" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-paper text-muted-foreground",
  indigo: "bg-indigo/10 text-indigo",
  success: "bg-success/10 text-success",
  warning: "bg-orange/10 text-orange",
  danger: "bg-danger/10 text-danger",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}
