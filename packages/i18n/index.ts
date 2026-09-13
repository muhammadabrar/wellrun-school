import en from "./en.json";

export type Messages = typeof en;
export type Locale = "en" | "ur";

const dictionaries: Record<Locale, Messages> = {
  en,
  ur: en,
};

export function t(locale: Locale = "en"): Messages {
  return dictionaries[locale] ?? en;
}

export { en };
