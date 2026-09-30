import { LockIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useViewedYear } from "@/hooks/use-viewed-year";
import { currentUser } from "@/lib/api";

/** Slim notice while the console is looking at a closed (read-only) academic year. */
export function ClosedYearBanner() {
  const { year, locked } = useViewedYear();
  if (!locked || !year) return null;
  const admin = currentUser()?.role === "SCHOOL_ADMIN";
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-orange/10 px-4 py-2 text-sm text-ink">
      <LockIcon className="size-4 shrink-0 text-orange" aria-hidden />
      <span>
        Viewing <strong>{year.name}</strong> (closed) — records are read-only. Old invoices can still be paid.
      </span>
      {admin ? (
        <Link to="/academics/years" className="ml-auto font-medium text-indigo underline-offset-4 hover:underline">
          Manage years
        </Link>
      ) : null}
    </div>
  );
}
