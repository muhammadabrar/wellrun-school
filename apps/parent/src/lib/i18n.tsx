import { DEFAULT_LOCALE, dirOf, en, fmt, isLocale, ur, type Locale, type Messages } from "@wellrun/i18n";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const LOCALE_KEY = "wellrun-parent-locale";

export type ParentMessages = Messages["parent"];

function stored(): Locale | null {
  try {
    const value = localStorage.getItem(LOCALE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

type Ctx = {
  locale: Locale;
  m: ParentMessages;
  setLocale: (locale: Locale) => void;
  /** Adopts the language saved on the server, unless this phone already has a choice. */
  adoptServerLocale: (locale: string) => void;
  t: typeof fmt;
};

const LocaleContext = createContext<Ctx | null>(null);

export function LocaleProvider({ children, onChange }: { children: ReactNode; onChange?: (locale: Locale) => void }) {
  const [locale, setLocaleState] = useState<Locale>(() => stored() ?? DEFAULT_LOCALE);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dirOf(locale);
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      try {
        localStorage.setItem(LOCALE_KEY, next);
      } catch {
        /* private mode */
      }
      onChange?.(next);
    },
    [onChange],
  );

  const adoptServerLocale = useCallback((serverLocale: string) => {
    if (stored() || !isLocale(serverLocale)) return;
    setLocaleState(serverLocale);
  }, []);

  const value = useMemo<Ctx>(() => ({ locale, m: (locale === "ur" ? ur : en).parent, setLocale, adoptServerLocale, t: fmt }), [locale, setLocale, adoptServerLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside LocaleProvider");
  return ctx;
}
