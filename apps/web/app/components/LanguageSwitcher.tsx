"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { localeQueryValue, resolveLocale } from "../i18n/dictionaries";
import { useI18n } from "../i18n/useI18n";

const STORAGE_KEY = "ept-language";

export function LanguageSwitcher() {
  const { locale, dictionary } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const current = searchParams.get("lang");
    if (!current && stored && resolveLocale(stored) !== locale) {
      const next = new URLSearchParams(searchParams.toString());
      next.set("lang", localeQueryValue(resolveLocale(stored)));
      router.replace(`${pathname}?${next.toString()}`);
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, localeQueryValue(locale));
    }
  }, [locale, pathname, router, searchParams]);

  const setLanguage = (value: "zh" | "en") => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("lang", value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, value);
    }
    router.push(`${pathname}?${next.toString()}`);
  };

  const current = localeQueryValue(locale);
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 p-1 shadow-sm backdrop-blur"
      data-testid="language-switcher"
    >
      <span className="px-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
        {dictionary.locale.switchLabel}
      </span>
      <button
        className={`rounded-full px-3 py-1.5 text-sm font-medium ${current === "zh" ? "bg-slate-900 text-white" : "text-slate-600"}`}
        onClick={() => setLanguage("zh")}
        type="button"
      >
        中文
      </button>
      <button
        className={`rounded-full px-3 py-1.5 text-sm font-medium ${current === "en" ? "bg-slate-900 text-white" : "text-slate-600"}`}
        onClick={() => setLanguage("en")}
        type="button"
      >
        English
      </button>
    </div>
  );
}
