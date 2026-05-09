"use client";

import { createContext, useContext } from "react";
import { getDictionary, type AppDictionary, type AppLocale } from "./dictionaries";

type I18nContextValue = {
  locale: AppLocale;
  dictionary: AppDictionary;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  dictionary,
  children
}: {
  locale: AppLocale;
  dictionary: AppDictionary;
  children: React.ReactNode;
}) {
  return <I18nContext.Provider value={{ locale, dictionary }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    return {
      locale: "zh-CN",
      dictionary: getDictionary("zh-CN")
    };
  }
  return value;
}
