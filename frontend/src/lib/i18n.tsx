"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";

export type Locale = "en" | "ru";
const messages: Record<Locale, typeof en> = { en, ru };

function getNested(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split(".");
  let cur: unknown = obj;
  for (const k of keys) {
    cur = (cur as Record<string, unknown>)?.[k];
    if (cur === undefined) return undefined;
  }
  return typeof cur === "string" ? cur : undefined;
}

const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
} | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  useEffect(() => {
    const saved = localStorage.getItem("helpdesk_locale") as string | null;
    if (saved === "en" || saved === "ru") setLocaleState(saved);
  }, []);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") localStorage.setItem("helpdesk_locale", l);
  }, []);
  const t = useCallback(
    (key: string) => getNested(messages[locale] as Record<string, unknown>, key) ?? key,
    [locale]
  );
  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
