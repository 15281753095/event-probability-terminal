import Link from "next/link";
import type { AppDictionary, AppLocale } from "../i18n/dictionaries";
import { withLang } from "../i18n/dictionaries";
import { LanguageSwitcher } from "./LanguageSwitcher";

type NavKey = "home" | "shortWindow" | "replay" | "strategyLab" | "dataStore";

const navItems: Array<{ key: NavKey; href: string }> = [
  { key: "home", href: "/" },
  { key: "shortWindow", href: "/short-window" },
  { key: "replay", href: "/signals/replay" },
  { key: "strategyLab", href: "/strategy-lab" },
  { key: "dataStore", href: "/data-store" }
];

export function AppTopNav({
  locale,
  dictionary,
  current
}: {
  locale: AppLocale;
  dictionary: AppDictionary;
  current: NavKey;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-black/5 bg-white/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Link className="text-lg font-semibold tracking-[-0.02em] text-slate-900" href={withLang("/", locale)}>
              {dictionary.nav.product}
            </Link>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
              {dictionary.nav.researchOnly}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{dictionary.nav.publicReadOnly}</p>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <nav className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => {
              const active = item.key === current;
              return (
                <Link
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${active ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-600 shadow-sm ring-1 ring-black/5 hover:bg-slate-50"}`}
                  href={withLang(item.href, locale)}
                  key={item.key}
                >
                  {dictionary.nav[item.key]}
                </Link>
              );
            })}
          </nav>
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
