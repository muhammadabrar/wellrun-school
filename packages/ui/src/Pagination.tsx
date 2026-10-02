import { Button } from "./Button";

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "left" ? "M10 3 5 8l5 5" : "m6 3 5 5-5 5"} />
    </svg>
  );
}

/**
 * Previous / next controls under a table or list. Shows which rows are on screen ("21–40 of 132")
 * so people know how much is left. Renders nothing when everything fits on one page.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  noun = "result",
  busy = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Singular label for the rows, e.g. "invoice". Pluralised with an "s". */
  noun?: string;
  busy?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (total <= pageSize) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground tabular-nums" aria-live="polite">
        Showing {first.toLocaleString("en-PK")}–{last.toLocaleString("en-PK")} of {total.toLocaleString("en-PK")} {noun}s
        <span className="ml-2">· Page {page} of {pages}</span>
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" icon={<Chevron dir="left" />} disabled={busy || page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={busy || page >= pages} onClick={() => onPageChange(page + 1)}>
          Next
          <Chevron dir="right" />
        </Button>
      </div>
    </nav>
  );
}
