import { cx } from "./cx";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-line", className)} />;
}

type LoadingVariant = "metrics" | "table" | "tableBody" | "form" | "list" | "profile" | "page";

export function LoadingState({ variant = "page" }: { variant?: LoadingVariant }) {
  if (variant === "metrics") {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading dashboard</span>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-9 w-56" />
        <div className="mt-8 grid grid-cols-3 gap-4">
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-32 rounded-3xl" />
        </div>
        <Skeleton className="mt-6 h-4 w-80" />
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading list</span>
        <div className="flex items-end justify-between">
          <div>
            <Skeleton className="h-9 w-48" />
            <Skeleton className="mt-2 h-4 w-36" />
          </div>
          <Skeleton className="h-11 w-36" />
        </div>
        <div className="mt-6 rounded-3xl bg-surface p-5">
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
          </div>
        </div>
        <div className="mt-6 overflow-hidden rounded-3xl bg-surface">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 border-t border-line px-5 py-4 first:border-t-0">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="ml-auto h-8 w-28" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div className="max-w-4xl" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading form</span>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        <div className="mt-8 space-y-4 rounded-3xl bg-surface p-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
          <Skeleton className="mt-2 h-11 w-36" />
        </div>
      </div>
    );
  }

  if (variant === "tableBody") {
    return (
      <>
        {Array.from({ length: 6 }, (_, i) => (
          <tr key={i}>
            <td className="px-5 py-4">
              <Skeleton className="h-8 w-16" />
            </td>
            <td className="px-5 py-4">
              <Skeleton className="h-8 w-40" />
            </td>
            <td className="px-5 py-4">
              <Skeleton className="h-8 w-24" />
            </td>
            <td className="px-5 py-4">
              <Skeleton className="h-8 w-28" />
            </td>
            <td className="px-5 py-4">
              <Skeleton className="h-8 w-32" />
            </td>
            <td className="px-5 py-4">
              <Skeleton className="h-8 w-24" />
            </td>
            <td className="px-5 py-4">
              <Skeleton className="h-8 w-16" />
            </td>
          </tr>
        ))}
      </>
    );
  }

  if (variant === "list") {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading records</span>
        <Skeleton className="h-9 w-48" />
        <div className="mt-6 flex gap-3">
          <Skeleton className="h-11 w-40" />
          <Skeleton className="h-11 w-36" />
        </div>
        <div className="mt-6 overflow-hidden rounded-3xl bg-surface">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center justify-between border-t border-line px-5 py-4 first:border-t-0">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-8 w-40" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "profile") {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading student</span>
        <Skeleton className="h-4 w-24" />
        <div className="mt-6 flex gap-4">
          <Skeleton className="h-24 w-24 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="mt-3 h-4 w-40" />
            <div className="mt-4 flex gap-2">
              <Skeleton className="h-11 w-24" />
              <Skeleton className="h-11 w-28" />
            </div>
          </div>
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Skeleton className="h-80 rounded-3xl" />
          <Skeleton className="h-80 rounded-3xl" />
        </div>
      </div>
    );
  }

  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-40 rounded-3xl bg-surface" />
    </div>
  );
}
