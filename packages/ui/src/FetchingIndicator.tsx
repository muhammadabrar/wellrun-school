import { Spinner } from "./Spinner";

export function FetchingIndicator({ show, label = "Updating" }: { show: boolean; label?: string }) {
  if (!show) return null;
  return (
    <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
      <Spinner className="h-3.5 w-3.5 text-indigo" />
      {label}
    </p>
  );
}
