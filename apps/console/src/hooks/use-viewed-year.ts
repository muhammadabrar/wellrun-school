import { useEffect, useState } from "react";
import { readSchoolContext, readYearId, type SessionYear } from "@/lib/school-context";

function viewedYear(): SessionYear | null {
  const ctx = readSchoolContext();
  if (!ctx) return null;
  const id = readYearId();
  return ctx.years.find((year) => year.id === id) ?? ctx.currentYear ?? null;
}

/** The academic year the console is looking at, and whether it's closed (read-only). */
export function useViewedYear() {
  const [year, setYear] = useState(viewedYear);
  useEffect(() => {
    const sync = () => setYear(viewedYear());
    window.addEventListener("wellrun-context", sync);
    return () => window.removeEventListener("wellrun-context", sync);
  }, []);
  return { year, locked: year?.status === "CLOSED" };
}
