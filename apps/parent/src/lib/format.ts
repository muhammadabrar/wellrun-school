import type { Locale } from "@wellrun/i18n";

/** Dates stay in Western digits in both languages: most parents read them that way on a phone. */
const tag = (locale: Locale) => (locale === "ur" ? "ur-PK-u-nu-latn" : "en-GB");

const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

export function formatDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(tag(locale), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(asDate(iso));
}

export function formatLongDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(tag(locale), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(asDate(iso));
}

export function formatMonth(month: string, locale: Locale) {
  return new Intl.DateTimeFormat(tag(locale), { month: "long", year: "numeric", timeZone: "UTC" }).format(asDate(`${month}-01`));
}

export function formatDateTime(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", numberingSystem: "latn" }).format(new Date(iso));
}

export const pkr = (amount: number) => `Rs. ${amount.toLocaleString("en-PK")}`;

export function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(iso: string, days: number) {
  const date = asDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addMonths(month: string, delta: number) {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** What the phone number looks like when shown back to the parent. */
export const showPhone = (digits: string) => (digits.startsWith("92") && digits.length === 12 ? `0${digits.slice(2, 5)} ${digits.slice(5)}` : digits);
