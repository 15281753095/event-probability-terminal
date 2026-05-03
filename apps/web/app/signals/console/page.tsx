import Link from "next/link";
import type {
  DataSourceType,
  EventSignalConsoleResponse,
  LiveMarketDataSource,
  ResearchSignalSourceMode,
  SignalDirection,
  SignalHorizon,
  SignalSymbol
} from "@ept/shared-types";
import { apiErrorMessage } from "../../api-client";
import { ConsoleCandlestickChart } from "../../ConsoleCandlestickChart";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  symbol?: string;
  horizon?: string;
  sourceMode?: string;
  provider?: string;
  profile?: string;
  refresh?: string;
}>;

type SignalsConsoleFilters = {
  symbol: SignalSymbol;
  horizon: SignalHorizon;
  sourceMode: ResearchSignalSourceMode;
  provider: LiveMarketDataSource;
  profile: "balanced" | "conservative" | "aggressive";
  refresh: string;
};

type ConsoleLoadState = {
  console?: EventSignalConsoleResponse;
  error?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default async function SignalsConsolePage({ searchParams }: { searchParams?: SearchParams }) {
  const filters = parseFilters((await searchParams) ?? {});
  const { console, error } = await loadEventSignalConsole(filters);
  const sourceType: DataSourceType =
    console?.dataProvenance.sourceType ?? (filters.sourceMode === "fixture" ? "fixture" : "live");
  const unavailable =
    !console ||
    (sourceType === "live" &&
      (console.currentSignal.failClosedReasons.length > 0 || console.currentSignal.dataQuality.candleCount === 0));
  const badge =
    sourceType === "mock"
      ? "DEV MOCK"
      : filters.sourceMode === "fixture" || sourceType === "fixture"
        ? "DEV FIXTURE"
        : unavailable
          ? "LIVE DATA UNAVAILABLE"
          : "LIVE";
  const displaySymbol = console?.dataProvenance.displaySymbol ?? productFor(filters.symbol, filters.provider);
  const providerLabel = providerDisplayName(console?.dataProvenance.provider ?? filters.provider);
  const vetoItems = [...(console?.confluence.vetoReasons ?? []), ...(console?.currentSignal.failClosedReasons ?? [])];

  return (
    <main className="min-h-screen bg-[#070b12] px-4 py-4 text-slate-100">
      <section className="mx-auto grid max-w-[1500px] gap-3" data-testid="signals-console-page">
        <header className="border border-slate-800 bg-[#0b111d] p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-slate-50">Signals Console</h1>
                <DataBadge label={badge} sourceType={sourceType} unavailable={unavailable} />
                <span className="border border-cyan-400/50 bg-cyan-400/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100">
                  Experimental model
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {displaySymbol} {filters.horizon} research bias from {providerLabel} public candles. No real-money trading action.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedLinks current={filters} label="Symbol" options={["BTC", "ETH"]} paramName="symbol" />
              <SegmentedLinks current={filters} label="Horizon" options={["5m", "10m"]} paramName="horizon" />
              <ProviderLinks current={filters} />
              <HeaderMetric label="Live price" value={formatUsd(console?.eventWindow.currentPrice ?? null, filters.symbol)} strong />
              <HeaderMetric label="Generated" value={formatTime(console?.meta.generatedAt ?? null)} />
              <Link
                className="inline-flex min-h-10 items-center border border-cyan-400/60 bg-cyan-400/10 px-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/15"
                href={signalsHref(filters, { refresh: String(Date.now()) })}
              >
                Refresh
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="grid gap-3">
            <section className="border border-slate-800 bg-[#0b111d] p-3">
              <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    {displaySymbol} Underlying Candles
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Interval {console?.dataProvenance.candleInterval ?? "1m"}, candles {console?.dataProvenance.candleCount ?? 0}, provider {providerLabel}.
                  </p>
                </div>
                <div className="text-xs text-slate-500">
                  Last candle {formatTime(console?.dataProvenance.lastCandleTime ?? null)}
                </div>
              </div>
              <ConsoleCandlestickChart
                candles={console?.recentCandles ?? []}
                markers={console?.recentMarkers ?? []}
                sourceMode={filters.sourceMode}
                sourceType={sourceType}
              />
              {error ? <ErrorBanner message={error} /> : null}
            </section>

            <section className="grid gap-3 lg:grid-cols-3">
              <MetricCard title="Signal" value={displayDirection(console?.currentSignal.direction ?? "NO_SIGNAL")} tone={directionClass(console?.currentSignal.direction ?? "NO_SIGNAL")} />
              <MetricCard title="Confidence" value={formatPercent(console?.currentSignal.confidence ?? 0)} />
              <MetricCard title="Provider" value={providerLabel} />
            </section>
          </section>

          <aside className="grid content-start gap-3">
            <section className="border border-slate-800 bg-[#0b111d] p-4" data-testid="signals-console-card">
              <h2 className="text-sm font-semibold text-slate-100">Research Bias</h2>
              <div className={`mt-3 text-3xl font-semibold ${directionClass(console?.currentSignal.direction ?? "NO_SIGNAL")}`}>
                {displayDirection(console?.currentSignal.direction ?? "NO_SIGNAL")}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Metric label="Profile" value={console?.profileName ?? filters.profile} />
                <Metric label="Source type" value={sourceType === "mock" ? "DEV MOCK" : sourceType} />
                <Metric label="Product" value={displaySymbol} />
                <Metric label="Interval" value={console?.dataProvenance.candleInterval ?? "1m"} />
                <Metric label="Candle count" value={`${console?.dataProvenance.candleCount ?? 0}`} />
                <Metric label="No trading action" value="true" />
              </div>
              <ReasonBlock title="Reasons" items={console?.confluence.reasons ?? []} empty="No directional reason." />
              <ReasonBlock title="Veto / limits" items={vetoItems} empty="No active veto." />
            </section>

            <section className="border border-slate-800 bg-[#0b111d] p-4">
              <h2 className="text-sm font-semibold text-slate-100">Data Provenance</h2>
              <div className="mt-3 grid gap-2 text-xs text-slate-300">
                <ProvenanceRow label="provider" value={console?.dataProvenance.provider ?? filters.provider} />
                <ProvenanceRow label="sourceType" value={sourceType} />
                <ProvenanceRow label="productId" value={console?.dataProvenance.productId ?? displaySymbol} />
                <ProvenanceRow label="displaySymbol" value={displaySymbol} />
                <ProvenanceRow label="fetchedAt" value={console?.dataProvenance.fetchedAt ?? "Unavailable"} />
                <ProvenanceRow label="isLive" value={String(console?.dataProvenance.isLive ?? false)} />
                <ProvenanceRow label="fixtureBacked" value={String(console?.dataProvenance.isFixtureBacked ?? false)} />
              </div>
            </section>

            <details className="border border-slate-800 bg-[#0b111d] p-3" data-testid="advanced-drawer">
              <summary className="cursor-pointer text-sm font-semibold text-slate-100">Advanced</summary>
              <div className="mt-3 grid gap-2 text-xs text-slate-400">
                <Link
                  className="border border-amber-400/50 bg-amber-400/10 px-3 py-2 font-semibold text-amber-100"
                  href={signalsHref(filters, { sourceMode: filters.sourceMode === "fixture" ? "live" : "fixture" })}
                >
                  {filters.sourceMode === "fixture" ? "Return to LIVE" : "Open DEV FIXTURE"}
                </Link>
                <Link className="border border-slate-700 bg-slate-950 px-3 py-2 text-slate-300" href={`/market-data/live?symbol=${filters.symbol}&provider=${providerQueryValue(filters.provider)}`}>
                  Open market data
                </Link>
              </div>
            </details>
          </aside>
        </section>
      </section>
    </main>
  );
}

async function loadEventSignalConsole(filters: SignalsConsoleFilters): Promise<ConsoleLoadState> {
  const params = new URLSearchParams({
    symbol: filters.symbol,
    horizon: filters.horizon,
    sourceMode: filters.sourceMode,
    provider: providerQueryValue(filters.provider),
    profile: filters.profile
  });
  try {
    const response = await fetch(`${apiBaseUrl}/signals/console?${params.toString()}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return { error: await apiErrorMessage(response) };
    }
    return { console: (await response.json()) as EventSignalConsoleResponse };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Event Signal Console API request failed." };
  }
}

function parseFilters(params: Awaited<SearchParams>): SignalsConsoleFilters {
  return {
    symbol: params.symbol === "ETH" ? "ETH" : "BTC",
    horizon: params.horizon === "10m" ? "10m" : "5m",
    sourceMode: params.sourceMode === "fixture" ? "fixture" : "live",
    provider: parseProvider(params.provider),
    profile:
      params.profile === "conservative" || params.profile === "aggressive"
        ? params.profile
        : "balanced",
    refresh: typeof params.refresh === "string" ? params.refresh.slice(0, 32) : ""
  };
}

function SegmentedLinks({
  current,
  options,
  paramName,
  label
}: {
  current: SignalsConsoleFilters;
  options: string[];
  paramName: "symbol" | "horizon";
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
            href={signalsHref(current, { [paramName]: option } as Partial<SignalsConsoleFilters>)}
            key={option}
          >
            {option}
          </Link>
        );
      })}
    </div>
  );
}

function ProviderLinks({ current }: { current: SignalsConsoleFilters }) {
  const options: Array<{ label: string; provider: LiveMarketDataSource }> = [
    { label: "Binance", provider: "binance-spot-public" },
    { label: "Coinbase", provider: "coinbase-exchange" }
  ];
  return (
    <div className="flex min-h-10 items-center border border-slate-800 bg-slate-950 p-1">
      <span className="px-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">Provider</span>
      {options.map((option) => {
        const active = current.provider === option.provider;
        return (
          <Link
            className={`px-3 py-1.5 text-xs font-semibold ${
              active ? "bg-slate-100 text-slate-950" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
            }`}
            href={signalsHref(current, { provider: option.provider })}
            key={option.provider}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}

function signalsHref(current: SignalsConsoleFilters, updates: Partial<SignalsConsoleFilters>) {
  const next = { ...current, ...updates, refresh: updates.refresh ?? "" };
  const params = new URLSearchParams();
  if (next.symbol !== "BTC") {
    params.set("symbol", next.symbol);
  }
  if (next.horizon !== "5m") {
    params.set("horizon", next.horizon);
  }
  if (next.sourceMode !== "live") {
    params.set("sourceMode", next.sourceMode);
  }
  if (next.provider !== "binance-spot-public") {
    params.set("provider", providerQueryValue(next.provider));
  }
  if (next.profile !== "balanced") {
    params.set("profile", next.profile);
  }
  if (next.refresh) {
    params.set("refresh", next.refresh);
  }
  const query = params.toString();
  return query ? `/signals/console?${query}` : "/signals/console";
}

function DataBadge({ label, sourceType, unavailable }: { label: string; sourceType: DataSourceType; unavailable: boolean }) {
  const className =
    sourceType === "mock"
      ? "border-amber-400/70 bg-amber-400/10 text-amber-100"
      : sourceType === "fixture"
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

function MetricCard({ title, value, tone = "text-slate-100" }: { title: string; value: string; tone?: string }) {
  return (
    <section className="border border-slate-800 bg-[#0b111d] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h3>
      <div className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</div>
    </section>
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

function ReasonBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h3>
      {items.length ? (
        <ul className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">
          {items.slice(0, 4).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-slate-500">{empty}</p>
      )}
    </section>
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

function displayDirection(direction: SignalDirection) {
  return direction === "LONG" ? "LONG BIAS" : direction === "SHORT" ? "SHORT BIAS" : "NO_SIGNAL";
}

function directionClass(direction: SignalDirection) {
  return direction === "LONG" ? "text-emerald-200" : direction === "SHORT" ? "text-rose-200" : "text-slate-200";
}

function parseProvider(value?: string): LiveMarketDataSource {
  return value === "coinbase" || value === "coinbase-exchange" ? "coinbase-exchange" : "binance-spot-public";
}

function providerQueryValue(provider: LiveMarketDataSource): string {
  return provider === "coinbase-exchange" ? "coinbase" : "binance";
}

function providerDisplayName(provider: LiveMarketDataSource | string): string {
  return provider === "coinbase-exchange" ? "Coinbase Exchange" : "Binance public";
}

function productFor(symbol: SignalSymbol, provider: LiveMarketDataSource): string {
  if (provider === "coinbase-exchange") {
    return symbol === "BTC" ? "BTC-USD" : "ETH-USD";
  }
  return symbol === "BTC" ? "BTCUSDT" : "ETHUSDT";
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

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
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
