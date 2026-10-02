import { BadRequestException } from "@nestjs/common";
import { addDays, type ReportCell, type ReportRow } from "@wellrun/shared";

const KARACHI = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" });

/** The calendar day a moment falls on in Pakistan, so a 11 pm payment lands on the day the school saw it. */
export const karachiDay = (date: Date) => KARACHI.format(date);

export const karachiMonth = (date: Date) => karachiDay(date).slice(0, 7);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`;

/** YYYY-MM moved by whole months. */
export function shiftMonth(month: string, delta: number) {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The period a report covers. Dates are plain days; a backwards range is a mistake worth saying out loud. */
export function dateRange(params: { from?: string; to?: string }, today: string, defaultFrom = firstOfMonth(today)) {
  const from = params.from || defaultFrom;
  const to = params.to || today;
  if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) throw new BadRequestException("Pick a valid date range");
  if (from > to) throw new BadRequestException("The start date is after the end date");
  if (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 800 * 86_400_000) throw new BadRequestException("Pick a range of two years or less");
  return { from, to };
}

/** Start of the first day and end of the last day, Pakistan time, as moments. */
export const startOf = (day: string) => new Date(`${day}T00:00:00+05:00`);
export const endOf = (day: string) => new Date(`${day}T23:59:59.999+05:00`);

/** Every month label from `from` to `to` inclusive. */
export function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = shiftMonth(month, 1)) out.push(month);
  return out;
}

export function monthName(month: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}

export function dayName(day: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

export const sumOf = (rows: ReportRow[], key: string) => rows.reduce((total, row) => total + (typeof row[key] === "number" ? (row[key] as number) : 0), 0);

export const percentOf = (part: number, whole: number): ReportCell => (whole ? Math.round((part / whole) * 1000) / 10 : null);

/** Sorts "Grade 2 A" before "Grade 10 A". */
export const byLabel = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export const personName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

/** Days from `from` through `to`, for counting what a range spans. */
export const daySpan = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

export { addDays };
