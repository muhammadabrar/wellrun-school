import { defaultCampusId, readCampusId, writeCampusId } from "./campus";
import { queryClient, queryKeys } from "./query";

export const CONTEXT_STORAGE_KEY = "wellrun-school-context";
export const YEAR_STORAGE_KEY = "wellrun-year-id";

export type SchoolContext = {
  setupCompleted: boolean;
  setupStep: number;
  campuses: { id: string; name: string; isMain: boolean; code: string }[];
  years: { id: string; name: string; current: boolean; startsOn: string; endsOn: string }[];
  currentYear: { id: string; name: string; current: boolean; startsOn: string; endsOn: string } | null;
  classes: { id: string; name: string; section: string; yearId: string; campusId: string | null }[];
};

export function readSchoolContext(): SchoolContext | null {
  const raw = localStorage.getItem(CONTEXT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SchoolContext;
  } catch {
    return null;
  }
}

export function writeSchoolContext(ctx: SchoolContext | null) {
  if (!ctx) {
    localStorage.removeItem(CONTEXT_STORAGE_KEY);
    localStorage.removeItem(YEAR_STORAGE_KEY);
    return;
  }
  localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(ctx));
  hydrateSchoolQueries(ctx);
  ensureYearId(ctx);
  ensureCampusId(ctx);
  window.dispatchEvent(new Event("wellrun-context"));
}

export function readYearId() {
  return localStorage.getItem(YEAR_STORAGE_KEY) ?? readSchoolContext()?.currentYear?.id ?? "";
}

export function writeYearId(id: string) {
  if (id) localStorage.setItem(YEAR_STORAGE_KEY, id);
  else localStorage.removeItem(YEAR_STORAGE_KEY);
}

export function classesForCampus(campusId: string) {
  const ctx = readSchoolContext();
  const classes = ctx?.classes ?? [];
  const yearId = readYearId() || ctx?.currentYear?.id;
  return classes.filter((cls) => {
    if (yearId && cls.yearId !== yearId) return false;
    if (campusId && cls.campusId && cls.campusId !== campusId) return false;
    return true;
  });
}

export function hydrateSchoolQueries(ctx: SchoolContext) {
  queryClient.setQueryData(queryKeys.schoolSession, ctx);
  queryClient.setQueryData(queryKeys.setupStatus, { setupCompleted: ctx.setupCompleted, setupStep: ctx.setupStep });
  queryClient.setQueryData(queryKeys.classes, ctx.classes);
}

function ensureYearId(ctx: SchoolContext) {
  const stored = readYearId();
  const valid = ctx.years.some((year) => year.id === stored) || ctx.currentYear?.id === stored;
  if (valid && stored) return;
  const year = ctx.currentYear ?? ctx.years.find((row) => row.current) ?? ctx.years[0];
  if (year) writeYearId(year.id);
}

function ensureCampusId(ctx: SchoolContext) {
  const next = defaultCampusId(ctx.campuses);
  if (next && next !== readCampusId()) writeCampusId(next);
}

export async function refreshSchoolContext() {
  const { api } = await import("./api");
  const ctx = await api.schoolSession();
  writeSchoolContext(ctx);
  for (const key of [
    queryKeys.studentsRoot,
    queryKeys.dashboard,
    ["admissions"],
    ["attendance"],
    ["absent"],
    queryKeys.invoices,
    ["timetable"],
  ] as const) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
  return ctx;
}

const existingContext = readSchoolContext();
if (existingContext) {
  hydrateSchoolQueries(existingContext);
  ensureYearId(existingContext);
  ensureCampusId(existingContext);
}
