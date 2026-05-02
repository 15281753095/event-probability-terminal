import Link from "next/link";
import type { DataSourceType, LiveMarketDataResponse, OhlcvInterval, SignalSymbol } from "@ept/shared-types";
import { apiErrorMessage } from "../../api-client";
import { ConsoleCandlestickChart } from "../../ConsoleCandlestickChart";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  symbol?: string;
  interval?: string;
  refresh?: string;
}>;

type LiveMarketPageFilters = {
  symbol: SignalSymbol;
  interval: OhlcvInterval;
  refresh: string;
};

type LiveMarketLoadState = {
  marketData?: LiveMarketDataResponse;
  error?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const symbols: SignalSymbol[] = ["BTC", "ETH"];
const intervals: OhlcvInterval[] = ["1m", "5m", "15m", "1h"];

export default async function LiveMarketDataPage({ searchParams }: { searchParams?: SearchParams }) {
  const filters = parseFilters((await searchParams) ?? {});
  const { marketData, error } = await loadLiveMarketData(filters);
  const sourceType: DataSourceType = marketData?.sourceType ?? "live";
  const unavailable = !marketData || marketData.failClosedReasons.length > 0 || marketData.candleCount === 0 || marketData.latestPrice === null;
  const badge = sourceType === "mock" ? "DEV MOCK" : unavailable ? "LIVE DATA UNAVAILABLE" : "LIVE";

  return (
    <main className="min-h-screen bg-[#070b12] px-4 py-4 text-slate-100">
      <section className="mx-auto grid max-w-[1500px] gap-3" data-testid="live-market-data-page">
        <header className="border border-slate-800 bg-[#0b111d] p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-slate-50">Live Market Data</h1>
                <DataBadge label={badge} sourceType={sourceType} unavailable={unavailable} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Coinbase Exchange public ticker and candles. Read-only, no API key, no private endpoints.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedLinks current={filters} label="Product" options={symbols} paramName="symbol" />
              <SegmentedLinks current={filters} label="Interval" options={intervals} paramName="interval" />
              <HeaderMetric label="Latest price" value={formatUsd(marketData?.latestPrice ?? null, filters.symbol)} strong />
              <HeaderMetric label="Last updated" value={formatTime(marketData?.tickerTime ?? null)} />
              <Link
                className="inline-flex min-h-10 items-center border border-cyan-400/60 bg-cyan-400/10 px-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/15"
                href={marketDataHref(filters, { refresh: String(Date.now()) })}
              >
                Refresh
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="border border-slate-800 bg-[#0b111d] p-3">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  {marketData?.productId ?? `${filters.symbol}-USD`} {filters.interval} Candles
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Granularity {marketData?.candleGranularity ?? intervalSeconds(filters.interval)}s, candle count {marketData?.candleCount ?? 0}, source {marketData?.provider ?? "coinbase-exchange"}.
                </p>
              </div>
              <div className="text-xs text-slate-500">
                Last candle {formatTime(marketData?.lastCandleTime ?? marketData?.latestCandleTime ?? null)}
              </div>
            </div>
            <ConsoleCandlestickChart
              candles={marketData?.candles ?? []}
              markers={[]}
              sourceMode="live"
              sourceType={sourceType}
            />
            {error ? <ErrorBanner message={error} /> : null}
            {marketData?.failClosedReasons.length ? <ReasonList items={marketData.failClosedReasons} title="Live data unavailable" /> : null}
          </section>

          <aside className="grid content-start gap-3">
            <section className="border border-slate-800 bg-[#0b111d] p-4">
              <h2 className="text-sm font-semibold text-slate-100">Market Snapshot</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Metric label="Bid" value={formatUsd(marketData?.bid ?? null, filters.symbol)} />
                <Metric label="Ask" value={formatUsd(marketData?.ask ?? null, filters.symbol)} />
                <Metric label="Ticker age" value={formatAge(marketData?.tickerFreshnessSeconds ?? null)} />
                <Metric label="Candle age" value={formatAge(marketData?.candleFreshnessSeconds ?? null)} />
                <Metric label="Source type" value={sourceType === "mock" ? "DEV mock" : sourceType} />
                <Metric label="Fixture backed" value={String(marketData?.isFixtureBacked ?? false)} />
              </div>
            </section>

            <section className="border border-slate-800 bg-[#0b111d] p-4">
              <h2 className="text-sm font-semibold text-slate-100">Data Provenance</h2>
              <div className="mt-3 grid gap-2 text-xs text-slate-300">
                <ProvenanceRow label="provider" value={marketData?.provider ?? "coinbase-exchange"} />
                <ProvenanceRow label="source" value={marketData?.source ?? "coinbase-exchange"} />
                <ProvenanceRow label="sourceType" value={sourceType} />
                <ProvenanceRow label="productId" value={marketData?.productId ?? `${filters.symbol}-USD`} />
                <ProvenanceRow label="fetchedAt" value={marketData?.fetchedAt ?? "Unavailable"} />
                <ProvenanceRow label="isLive" value={String(marketData?.isLive ?? false)} />
              </div>
            </section>

            <nav className="grid gap-2 text-xs">
              <Link className="border border-slate-700 bg-slate-950 px-3 py-2 text-slate-300" href="/">
                Back to terminal
              </Link>
              <Link className="border border-slate-700 bg-slate-950 px-3 py-2 text-slate-300" href={`/signals/console?symbol=${filters.symbol}`}>
                Open signals console
              </Link>
            </nav>
          </aside>
        </section>
      </section>
    </main>
  );
}

async function loadLiveMarketData(filters: LiveMarketPageFilters): Promise<LiveMarketLoadState> {
  const params = new URLSearchParams({
    symbol: filters.symbol,
    interval: filters.interval
  });
  try {
    const response = await fetch(`${apiBaseUrl}/market-data/live?${params.toString()}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return { error: await apiErrorMessage(response) };
    }
    return { marketData: (await response.json()) as LiveMarketDataResponse };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Live market data API request failed." };
  }
}

function parseFilters(params: Awaited<SearchParams>): LiveMarketPageFilters {
  return {
    symbol: params.symbol === "ETH" ? "ETH" : "BTC",
    interval: parseInterval(params.interval),
    refresh: typeof params.refresh === "string" ? params.refresh.slice(0, 32) : ""
  };
}

function parseInterval(value?: string): OhlcvInterval {
  return value === "5m" || value === "15m" || value === "1h" ? value : "1m";
}

function SegmentedLinks({
  current,
  options,
  paramName,
  label
}: {
  current: LiveMarketPageFilters;
  options: string[];
  paramName: "symbol" | "interval";
  label: string;
}) {
  return (
    <div className="flex min-h-10 items-center border border-slate-800 bg-slate-950 p-1">
      <span className="px-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {options.map((option) => {
        const active = current[paramName] === option;
        return (
          <Link
            className={`px-3 py-1.5 text-xs font-semibold ${
              active ? "bg-slate-100 text-slate-950" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
            }`}
            href={marketDataHref(current, { [paramName]: option } as Partial<LiveMarketPageFilters>)}
            key={option}
          >
            {option}
          </Link>
        );
      })}
    </div>
  );
}

function marketDataHref(current: LiveMarketPageFilters, updates: Partial<LiveMarketPageFilters>) {
  const next = { ...current, ...updates, refresh: updates.refresh ?? "" };
  const params = new URLSearchParams();
  if (next.symbol !== "BTC") {
    params.set("symbol", next.symbol);
  }
  if (next.interval !== "1m") {
    params.set("interval", next.interval);
  }
  if (next.refresh) {
    params.set("refresh", next.refresh);
  }
  const query = params.toString();
  return query ? `/market-data/live?${query}` : "/market-data/live";
}

function DataBadge({ label, sourceType, unavailable }: { label: string; sourceType: DataSourceType; unavailable: boolean }) {
  const className =
    sourceType === "mock"
      ? "border-amber-400/70 bg-amber-400/10 text-amber-100"
      : unavailable
        ? "border-rose-400/70 bg-rose-400/10 text-rose-100"
        : "border-emerald-400/70 bg-emerald-400/10 text-emerald-100";
  return (
    <span className={`border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${className}`} data-testid={sourceType === "live" && !unavailable ? "live-badge" : "data-source-badge"}>
      {label}
    </span>
  );
}

function HeaderMetric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-h-10 border border-slate-800 bg-slate-950 px-3 py-1.5">
      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className={`mt-0.5 whitespace-nowrap ${strong ? "text-base font-semibold text-slate-50" : "text-xs font-semibold text-slate-200"}`}>
        {value}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-800 bg-slate-950 px-2 py-1.5">
      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function ProvenanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border border-slate-800 bg-slate-950 px-2 py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="break-all text-right">{value}</span>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="mt-3 border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-100">{message}</div>;
}

function ReasonList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mt-3 border border-rose-500/40 bg-rose-500/10 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-100">{title}</h3>
      <ul className="mt-2 grid gap-1 text-xs leading-5 text-rose-100">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function formatUsd(value: number | null | undefined, symbol: SignalSymbol) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Unavailable";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: symbol === "BTC" ? 2 : 2,
    maximumFractionDigits: symbol === "BTC" ? 2 : 2
  }).format(value);
}

function formatAge(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) {
    return "Unavailable";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatTime(value: string | null) {
  if (!value) {
    return "Unavailable";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }
  return date.toISOString().slice(11, 19);
}

function intervalSeconds(interval: OhlcvInterval) {
  return interval === "1m" ? 60 : interval === "5m" ? 300 : interval === "15m" ? 900 : 3600;
}
