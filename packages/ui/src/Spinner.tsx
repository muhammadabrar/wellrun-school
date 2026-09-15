import { cx } from "./cx";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-block h-4 w-4 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin",
        className,
      )}
      aria-hidden
    />
  );
}
