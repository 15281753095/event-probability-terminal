import Link from "next/link";
import type { ReactNode } from "react";
import type {
  MarketDataKlinesResponse,
  OhlcvInterval,
  ShortWindowCurrentResponse,
  ShortWindowInterval,
  ShortWindowMarker,
  ShortWindowMetrics,
  ShortWindowMetricsWindow,
  ShortWindowReplayResponse,
  ShortWindowSignalSide,
  SignalSymbol
} from "@ept/shared-types";
import { apiErrorMessage } from "../api-client";
import { AppTopNav } from "../components/AppTopNav";
import { ProfessionalKlineChart } from "../components/ProfessionalKlineChart";
import { getDictionary, resolveLocale, type AppLocale } from "../i18n/dictionaries";
import { I18nProvider } from "../i18n/useI18n";
import { RealTimePriceCard } from "../RealTimePriceCard";
import { ShortWindowRuntimePanel } from "./ShortWindowRuntimePanel";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  symbol?: string;
  interval?: string;
  eventInterval?: string;
  chartInterval?: string;
  range?: string;
  lang?: string;
  venue?: string;
  showSignals?: string;
  debug?: string;
}>;

type Filters = {
  symbol: SignalSymbol;
  eventInterval: ShortWindowInterval;
  chartInterval: OhlcvInterval;
  range: "1D" | "3D" | "1W" | "1M" | "3M" | "1Y" | "ALL";
  locale: AppLocale;
  showSignals: boolean;
  debug: boolean;
};

type LoadState<T> = {
  data?: T;
  error?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const chartIntervals: OhlcvInterval[] = ["1m", "5m", "10m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"];
const eventIntervals: ShortWindowInterval[] = ["5m", "10m", "15m"];
const ranges: Filters["range"][] = ["1D", "3D", "1W", "1M", "3M", "1Y", "ALL"];
const windows: ShortWindowMetricsWindow[] = ["1d", "3d", "1w", "1m"];

export default async function ShortWindowTerminalPage({ searchParams }: { searchParams?: SearchParams }) {
  const filters = parseFilters((await searchParams) ?? {});
  const dictionary = getDictionary(filters.locale);
  const [currentState, klineState, replayEntries] = await Promise.all([
    loadCurrent(filters),
    loadKlines(filters),
    Promise.all(windows.map(async (window) => [window, await loadReplay(filters, window)] as const))
  ]);

  const current = currentState.data;
  const kline = klineState.data;
  const replayByWindow = Object.fromEntries(replayEntries) as Record<ShortWindowMetricsWindow, LoadState<ShortWindowReplayResponse>>;
  const primaryReplay = replayByWindow["1d"]?.data;
  const metrics = windows
    .map((window) => replayByWindow[window]?.data?.metrics)
    .filter((value): value is ShortWindowMetrics => Boolean(value));
  const chartMarkers = markerPolicy({
    chartInterval: filters.chartInterval,
    showSignals: filters.showSignals,
    debug: filters.debug,
    markers: [
      ...(primaryReplay?.markers ?? []),
      ...(current ? [currentSignalMarker(current.signal)] : [])
    ]
  });

  return (
    <I18nProvider dictionary={dictionary} locale={filters.locale}>
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(241,245,249,0.92)_38%,_rgba(226,232,240,0.94)_100%)] text-slate-900">
        <AppTopNav current="shortWindow" dictionary={dictionary} locale={filters.locale} />
        <section className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6" data-testid="short-window-terminal">
          <section className="rounded-[34px] border border-black/5 bg-white px-6 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                    {dictionary.shortWindow.title}
                  </h1>
                  <Pill tone="emerald">{dictionary.nav.researchOnly}</Pill>
                  <Pill tone="sky">{dictionary.common.manualOnly}</Pill>
                  <Pill tone="amber">{dictionary.common.noAutoExecution}</Pill>
                  <Pill tone="amber">{dictionary.common.noTrading}</Pill>
                </div>
                <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-500">{dictionary.shortWindow.subtitle}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <SegmentedLinks
                  current={filters}
                  label={dictionary.common.symbol}
                  options={["BTC", "ETH"]}
                  paramName="symbol"
                />
                <SegmentedLinks
                  current={filters}
                  label={dictionary.common.eventInterval}
                  options={eventIntervals}
                  paramName="eventInterval"
                />
                <Link
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
                  href={shortWindowHref(filters, { refreshToken: String(Date.now()) })}
                >
                  {dictionary.common.refresh}
                </Link>
              </div>
            </div>
          </section>

          {currentState.error ? <ErrorBanner message={currentState.error} /> : null}
          {klineState.error ? <ErrorBanner message={klineState.error} /> : null}

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <ProfessionalKlineChart
              candles={kline?.candles ?? []}
              derivedFrom={kline?.derivedFrom}
              displaySymbol={kline?.displaySymbol ?? displaySymbol(filters.symbol)}
              error={klineState.error}
              interval={filters.chartInterval}
              intervalSource={kline?.intervalSource ?? (filters.chartInterval === "10m" ? "derived" : "native")}
              latestPrice={current?.event.currentPrice ?? kline?.candles.at(-1)?.close ?? null}
              locale={filters.locale}
              markers={chartMarkers}
              providerStatus={kline?.providerHealth.status ?? "unknown"}
              rangeControls={ranges.map((range) => ({
                href: shortWindowHref(filters, { range }),
                label: range,
                active: filters.range === range
              }))}
              showSignals={filters.showSignals}
              signalToggleHref={shortWindowHref(filters, { showSignals: !filters.showSignals })}
              sourceLabel={sourceBadgeLabel(kline?.sourceType ?? "live", dictionary)}
              sourceType={kline?.sourceType ?? "live"}
              startReferencePrice={current?.event.startReferencePrice ?? null}
              symbolControls={(["BTC", "ETH"] as const).map((symbol) => ({
                href: shortWindowHref(filters, { symbol }),
                label: symbol,
                active: filters.symbol === symbol
              }))}
              intervalControls={chartIntervals.map((interval) => ({
                href: shortWindowHref(filters, { chartInterval: interval, range: defaultRangeForInterval(interval) }),
                label: interval,
                active: filters.chartInterval === interval
              }))}
              warnings={unique([...(kline?.warnings ?? []), ...(current?.warnings ?? []).slice(0, 1)])}
            />

            <aside className="grid content-start gap-6">
              <RealTimePriceCard key={`realtime-${filters.symbol}`} symbol={filters.symbol} title={dictionary.common.latestPrice} />
              <ShortWindowRuntimePanel
                key={`runtime-${filters.symbol}-${filters.eventInterval}`}
                endTime={current?.event.endTime ?? new Date().toISOString()}
                initialPrice={current?.event.currentPrice ?? null}
                initialSecondsRemaining={current?.event.secondsRemaining ?? 0}
                initialSourceType={current?.sourceType ?? "live"}
                symbol={filters.symbol}
              />
              <SignalCard current={current} dictionary={dictionary} locale={filters.locale} />
              <EventSummaryCard current={current} dictionary={dictionary} locale={filters.locale} />
            </aside>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section
              className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
              data-testid="short-window-metrics"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">{dictionary.shortWindow.metricsTitle}</h2>
                  <p className="mt-1 text-sm text-slate-500">{dictionary.shortWindow.metricsSubtitle}</p>
                </div>
                <Pill tone={primaryReplay?.proxyBacktest ? "amber" : "emerald"}>
                  {primaryReplay?.proxyBacktest ? dictionary.shortWindow.ruleWarning : dictionary.shortWindow.ruleVerified}
                </Pill>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {metrics.length ? (
                  metrics.map((metric) => <MetricsCard dictionary={dictionary} key={metric.window} locale={filters.locale} metric={metric} />)
                ) : (
                  <EmptyPanel>{replayByWindow["1d"]?.error ?? dictionary.common.empty}</EmptyPanel>
                )}
              </div>
            </section>

            <section className="grid content-start gap-6">
              <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">{dictionary.shortWindow.recentActionableSignals}</h2>
                <RecentSignalsPanel
                  current={current}
                  dictionary={dictionary}
                  locale={filters.locale}
                  replay={primaryReplay}
                />
              </section>

              <details className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                <summary className="cursor-pointer text-lg font-semibold tracking-[-0.02em] text-slate-950">
                  {dictionary.common.debugDetails}
                </summary>
                <div className="mt-4 grid gap-4">
                  <RuleCard current={current} dictionary={dictionary} />
                  <WarningCard
                    items={unique([
                      ...(current?.warnings ?? []),
                      ...(kline?.warnings ?? []),
                      ...(primaryReplay?.warnings ?? [])
                    ])}
                    title={dictionary.common.warning}
                  />
                </div>
              </details>
            </section>
          </section>
        </section>
      </main>
    </I18nProvider>
  );
}

async function loadCurrent(filters: Filters): Promise<LoadState<ShortWindowCurrentResponse>> {
  const params = new URLSearchParams({
    symbol: filters.symbol,
    interval: filters.eventInterval,
    venue: "proxy-generic"
  });
  try {
    const response = await fetch(`${apiBaseUrl}/short-window/current?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) {
      return { error: await apiErrorMessage(response) };
    }
    return { data: (await response.json()) as ShortWindowCurrentResponse };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Short-window current API request failed." };
  }
}

async function loadReplay(filters: Filters, window: ShortWindowMetricsWindow): Promise<LoadState<ShortWindowReplayResponse>> {
  const params = new URLSearchParams({
    symbol: filters.symbol,
    interval: filters.eventInterval,
    venue: "proxy-generic",
    window
  });
  try {
    const response = await fetch(`${apiBaseUrl}/short-window/replay?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) {
      return { error: await apiErrorMessage(response) };
    }
    return { data: (await response.json()) as ShortWindowReplayResponse };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Short-window replay API request failed." };
  }
}

async function loadKlines(filters: Filters): Promise<LoadState<MarketDataKlinesResponse>> {
  const params = new URLSearchParams({
    symbol: filters.symbol,
    interval: filters.chartInterval,
    range: filters.range
  });
  try {
    const response = await fetch(`${apiBaseUrl}/market-data/klines?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) {
      return { error: await apiErrorMessage(response) };
    }
    return { data: (await response.json()) as MarketDataKlinesResponse };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Kline history API request failed." };
  }
}

function parseFilters(params: Awaited<SearchParams>): Filters {
  const locale = resolveLocale(params.lang);
  const legacyInterval = parseChartInterval(params.interval);
  const eventInterval = parseEventInterval(params.interval) ?? parseEventInterval(params.eventInterval) ?? "5m";
  const chartInterval = parseChartInterval(params.chartInterval) ?? legacyInterval ?? eventInterval;
  return {
    symbol: params.symbol === "ETH" ? "ETH" : "BTC",
    eventInterval,
    chartInterval,
    range: parseRange(params.range) ?? defaultRangeForInterval(chartInterval),
    locale,
    showSignals: params.showSignals !== "false",
    debug: params.debug === "true"
  };
}

function parseEventInterval(value?: string): ShortWindowInterval | undefined {
  return value === "5m" || value === "10m" || value === "15m" ? value : undefined;
}

function parseChartInterval(value?: string): OhlcvInterval | undefined {
  return chartIntervals.includes(value as OhlcvInterval) ? (value as OhlcvInterval) : undefined;
}

function parseRange(value?: string): Filters["range"] | undefined {
  return ranges.includes(value as Filters["range"]) ? (value as Filters["range"]) : undefined;
}

function defaultRangeForInterval(interval: OhlcvInterval): Filters["range"] {
  switch (interval) {
    case "1m":
      return "1D";
    case "5m":
    case "10m":
    case "15m":
      return "3D";
    case "30m":
      return "1M";
    case "1h":
      return "1M";
    case "4h":
      return "3M";
    case "1d":
    case "1w":
    case "1M":
      return "1Y";
  }
}

function shortWindowHref(
  current: Filters,
  updates: Partial<Filters> & { refreshToken?: string | undefined }
): string {
  const next = { ...current, ...updates };
  const params = new URLSearchParams();
  params.set("symbol", next.symbol);
  params.set("interval", next.eventInterval);
  if (next.chartInterval !== next.eventInterval) {
    params.set("chartInterval", next.chartInterval);
  }
  if (next.range !== defaultRangeForInterval(next.chartInterval)) {
    params.set("range", next.range);
  }
  params.set("lang", next.locale === "en-US" ? "en" : "zh");
  if (!next.showSignals) {
    params.set("showSignals", "false");
  }
  if (next.debug) {
    params.set("debug", "true");
  }
  if (updates.refreshToken) {
    params.set("refresh", updates.refreshToken);
  }
  return `/short-window?${params.toString()}`;
}

function markerPolicy(input: {
  chartInterval: OhlcvInterval;
  showSignals: boolean;
  debug: boolean;
  markers: ShortWindowMarker[];
}) {
  if (!input.showSignals) {
    return [];
  }
  const actionable = input.markers.filter((marker) =>
    marker.side === "LONG_UP" ||
    marker.side === "LONG_DOWN" ||
    (input.debug && marker.side === "REJECTED")
  );
  if (input.chartInterval === "1d" || input.chartInterval === "1w" || input.chartInterval === "1M") {
    return [];
  }
  if (input.chartInterval === "1h" || input.chartInterval === "4h") {
    return actionable.slice(-1);
  }
  return actionable.slice(-16);
}

function currentSignalMarker(signal: ShortWindowCurrentResponse["signal"]): ShortWindowMarker {
  return {
    id: `current-${signal.signalTime}`,
    time: signal.signalTime,
    price: signal.currentPrice,
    side: signal.side,
    label: signal.side,
    reason: signal.reasons[0] ?? signal.rejectReasons[0] ?? signal.side,
    isResearchOnly: true
  };
}

function sourceBadgeLabel(sourceType: MarketDataKlinesResponse["sourceType"], dictionary: ReturnType<typeof getDictionary>) {
  return sourceType === "mock"
    ? dictionary.common.mock
    : sourceType === "stored"
      ? dictionary.common.stored
      : dictionary.common.live;
}

function displaySymbol(symbol: SignalSymbol) {
  return symbol === "BTC" ? "BTCUSDT" : "ETHUSDT";
}

function SegmentedLinks({
  current,
  label,
  options,
  paramName
}: {
  current: Filters;
  label: string;
  options: string[];
  paramName: "symbol" | "eventInterval";
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-black/5 bg-slate-100 p-1">
      <span className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      {options.map((option) => {
        const active = current[paramName] === option;
        return (
          <Link
            className={`rounded-full px-4 py-2 text-sm font-medium ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
            href={shortWindowHref(current, { [paramName]: option } as Partial<Filters>)}
            key={option}
          >
            {option}
          </Link>
        );
      })}
    </div>
  );
}

function SignalCard({
  current,
  dictionary,
  locale
}: {
  current: ShortWindowCurrentResponse | undefined;
  dictionary: ReturnType<typeof getDictionary>;
  locale: AppLocale;
}) {
  const side = current?.signal.side ?? "WAIT";
  return (
    <section className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]" data-testid="short-window-signal-card">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">{dictionary.shortWindow.signalTitle}</h2>
        <Pill tone="amber">{dictionary.common.notTradingAdvice}</Pill>
      </div>
      <div className={`mt-4 text-4xl font-semibold tracking-[-0.04em] ${sideTone(side)}`}>{side}</div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <StatCell label={dictionary.shortWindow.confidence} value={formatPercent(current?.signal.confidence ?? null)} />
        <StatCell label={dictionary.shortWindow.score} value={formatNumber(current?.signal.score ?? null, 2)} />
        <StatCell label={dictionary.shortWindow.countdown} value={`${current?.signal.secondsRemaining ?? 0}s`} />
        <StatCell label={dictionary.shortWindow.phase} value={current?.signal.phase ?? dictionary.common.unavailable} />
      </div>
      <ReasonBlock empty={dictionary.common.empty} items={current?.signal.reasons ?? []} title={dictionary.shortWindow.signalReasons} />
      <ReasonBlock empty={dictionary.common.empty} items={current?.signal.rejectReasons ?? []} title={dictionary.shortWindow.rejectReasons} />
      <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
        {dictionary.common.manualOnly}
      </div>
    </section>
  );
}

function EventSummaryCard({
  current,
  dictionary,
  locale
}: {
  current: ShortWindowCurrentResponse | undefined;
  dictionary: ReturnType<typeof getDictionary>;
  locale: AppLocale;
}) {
  return (
    <section className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">{dictionary.shortWindow.eventTitle}</h2>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <StatCell label="start" value={formatDateTime(current?.event.startTime ?? null, locale)} />
        <StatCell label="end" value={formatDateTime(current?.event.endTime ?? null, locale)} />
        <StatCell label={dictionary.shortWindow.referencePrice} value={formatUsd(current?.event.startReferencePrice ?? null, locale)} />
        <StatCell label={dictionary.shortWindow.currentPrice} value={formatUsd(current?.event.currentPrice ?? null, locale)} />
        <StatCell label="distance" value={formatSigned(current?.event.distanceFromStart ?? null)} />
        <StatCell label="bps" value={formatNumber(current?.event.distanceBps ?? null, 2)} />
      </div>
    </section>
  );
}

function MetricsCard({
  metric,
  dictionary,
  locale
}: {
  metric: ShortWindowMetrics;
  dictionary: ReturnType<typeof getDictionary>;
  locale: AppLocale;
}) {
  return (
    <section className="rounded-[24px] border border-black/5 bg-slate-50 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{metric.window}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <StatCell label="winRate" value={formatPercent(metric.winRate)} />
        <StatCell label="actionable" value={String(metric.actionableCount)} />
        <StatCell label="longUp" value={formatPercent(metric.longUpWinRate)} />
        <StatCell label="longDown" value={formatPercent(metric.longDownWinRate)} />
        <StatCell label={dictionary.markers.wait} value={String(metric.waitCount)} />
        <StatCell label={dictionary.markers.rejected} value={String(metric.rejectedCount)} />
        <StatCell label="avgConf" value={formatPercent(metric.avgConfidence)} />
        <StatCell label="maxDD" value={formatNumber(metric.maxDrawdown ?? null, 2)} />
      </div>
      {metric.warnings.length ? <p className="mt-3 text-xs text-amber-700">{metric.warnings[0]}</p> : null}
    </section>
  );
}

function RecentSignalsPanel({
  current,
  dictionary,
  locale,
  replay
}: {
  current: ShortWindowCurrentResponse | undefined;
  dictionary: ReturnType<typeof getDictionary>;
  locale: AppLocale;
  replay: ShortWindowReplayResponse | undefined;
}) {
  const rows = [
    ...(current && isActionable(current.signal.side) ? [{
      id: current.signal.id,
      time: current.signal.signalTime,
      side: current.signal.side,
      confidence: current.signal.confidence,
      price: current.signal.currentPrice,
      note: current.signal.reasons[0] ?? ""
    }] : []),
    ...(replay?.results
      .filter((result) => isActionable(result.signal.side))
      .slice(-8)
      .reverse()
      .map((result) => ({
        id: result.signal.id,
        time: result.signal.signalTime,
        side: result.signal.side,
        confidence: result.signal.confidence,
        price: result.signal.currentPrice,
        note: result.signal.reasons[0] ?? ""
      })) ?? [])
  ];
  if (!rows.length) {
    return <EmptyPanel>{dictionary.shortWindow.noSignalRow}</EmptyPanel>;
  }
  return (
    <div className="mt-4 grid gap-3">
      {rows.map((row) => (
        <div className="grid gap-2 rounded-[22px] border border-black/5 bg-slate-50 px-4 py-3 text-sm text-slate-700 lg:grid-cols-[auto_auto_auto_1fr]" key={row.id}>
          <span className={`font-semibold ${sideTone(row.side)}`}>{row.side === "LONG_UP" ? dictionary.markers.up : dictionary.markers.down}</span>
          <span>{formatDateTime(row.time, locale)}</span>
          <span>{formatUsd(row.price, locale)}</span>
          <span className="truncate text-slate-500">{row.note}</span>
        </div>
      ))}
    </div>
  );
}

function RuleCard({
  current,
  dictionary
}: {
  current: ShortWindowCurrentResponse | undefined;
  dictionary: ReturnType<typeof getDictionary>;
}) {
  return (
    <section className="rounded-[24px] border border-black/5 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">{dictionary.shortWindow.ruleTitle}</h3>
        <Pill tone={current?.rule.isVerifiedRule ? "emerald" : "amber"}>
          {current?.rule.isVerifiedRule ? dictionary.shortWindow.ruleVerified : dictionary.shortWindow.ruleWarning}
        </Pill>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <StatCell label={dictionary.shortWindow.venue} value={current?.rule.venue ?? dictionary.common.unavailable} />
        <StatCell label="rule" value={current?.rule.ruleType ?? dictionary.common.unavailable} />
        <StatCell label="ref" value={current?.rule.referenceSource ?? dictionary.common.unavailable} />
        <StatCell label="confidence" value={current?.rule.ruleConfidence ?? dictionary.common.unavailable} />
      </div>
      <ReasonBlock empty={dictionary.common.empty} items={current?.rule.notes ?? []} title={dictionary.shortWindow.ruleNotes} />
    </section>
  );
}

function WarningCard({ title, items }: { title: string; items: string[] }) {
  return <ReasonBlock empty="No active warnings." items={items} title={title} />;
}

function ReasonBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="mt-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h3>
      {items.length ? (
        <ul className="mt-3 grid gap-2 text-sm text-slate-600">
          {items.slice(0, 8).map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      )}
    </div>
  );
}

function Pill({ children, tone = "emerald" }: { children: string; tone?: "emerald" | "amber" | "sky" }) {
  const className =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "sky"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${className}`}>{children}</span>;
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 break-words font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">{children}</div>;
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="rounded-[28px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{message}</div>;
}

function isActionable(side: ShortWindowSignalSide) {
  return side === "LONG_UP" || side === "LONG_DOWN";
}

function sideTone(side: ShortWindowSignalSide | string) {
  if (side === "LONG_UP") {
    return "text-emerald-700";
  }
  if (side === "LONG_DOWN") {
    return "text-rose-700";
  }
  if (side === "REJECTED") {
    return "text-slate-500";
  }
  return "text-slate-600";
}

function formatUsd(value: number | null | undefined, locale: AppLocale) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return locale === "zh-CN" ? "待定" : "Pending";
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined, digits = 1) {
  return value === null || value === undefined || !Number.isFinite(value) ? "n/a" : value.toFixed(digits);
}

function formatSigned(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "n/a";
  }
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function formatDateTime(value: string | null | undefined, locale: AppLocale) {
  if (!value) {
    return locale === "zh-CN" ? "待定" : "Pending";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? locale === "zh-CN" ? "待定" : "Pending"
    : new Intl.DateTimeFormat(locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
