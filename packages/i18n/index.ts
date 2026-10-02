import en from "./en.json";
import ur from "./ur.json";

/** `ur` is typed against `en`, so a missing or extra key fails the type-check instead of showing English by accident. */
export type Messages = typeof en;
export type Locale = "en" | "ur";

export const LOCALES: readonly Locale[] = ["en", "ur"];
export const DEFAULT_LOCALE: Locale = "en";

const dictionaries: Record<Locale, Messages> = { en, ur };

export function t(locale: Locale = DEFAULT_LOCALE): Messages {
  return dictionaries[locale] ?? en;
}

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ur";
}

/** Urdu reads right to left. */
export function dirOf(locale: Locale): "ltr" | "rtl" {
  return locale === "ur" ? "rtl" : "ltr";
}

/** Fills `{name}` style placeholders: fmt(m.login.codeIntro, { phone }). */
export function fmt(template: string, vars: Record<string, string | number> = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

export { en, ur };
