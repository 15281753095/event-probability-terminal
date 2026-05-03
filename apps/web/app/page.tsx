import Link from "next/link";
import type {
  EventSignalConsoleResponse,
  LiveMarketDataResponse,
  DataSourceType,
  ResearchSignalSourceMode,
  SignalDirection,
  SignalHorizon,
  SignalSymbol
} from "@ept/shared-types";
import { apiErrorMessage } from "./api-client";
import { ConsoleCandlestickChart } from "./ConsoleCandlestickChart";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  symbol?: string;
  horizon?: string;
  sourceMode?: string;
  profile?: string;
  refresh?: string;
}>;

type TerminalFilters = {
  symbol: SignalSymbol;
  horizon: SignalHorizon;
  sourceMode: ResearchSignalSourceMode;
  profile: "balanced" | "conservative" | "aggressive";
  refresh: string;
};

type ConsoleLoadState = {
  console?: EventSignalConsoleResponse;
  error?: string;
};

type LiveLoadState = {
  marketData?: LiveMarketDataResponse;
  error?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default async function Home({ searchParams }: { searchParams?: SearchParams }) {
  const params = (await searchParams) ?? {};
  const filters = parseFilters(params);
  const liveMarketDataPromise: Promise<LiveLoadState> =
    filters.sourceMode === "live" ? loadLiveMarketData(filters.symbol) : Promise.resolve({});
  const [consoleState, liveState] = await Promise.all([
    loadEventSignalConsole(filters),
    liveMarketDataPromise
  ]);
  const console = consoleState.console;
  const marketData = liveState.marketData;
  const dataSourceType: DataSourceType =
    marketData?.sourceType ?? console?.dataProvenance.sourceType ?? (filters.sourceMode === "fixture" ? "fixture" : "live");
  const liveUnavailable =
    filters.sourceMode === "live" &&
    dataSourceType === "live" &&
    (!marketData || marketData.failClosedReasons.length > 0 || marketData.latestPrice === null || Boolean(liveState.error));
  const latestPrice = filters.sourceMode === "live" ? marketData?.latestPrice ?? null : console?.eventWindow.currentPrice ?? null;
  const statusLabel =
    dataSourceType === "mock"
      ? "DEV MOCK"
      : filters.sourceMode === "fixture" || dataSourceType === "fixture"
        ? "DEV FIXTURE"
        : liveUnavailable
          ? "LIVE DATA UNAVAILABLE"
          : "LIVE";
  const vetoReasons = topItems([
    ...(console?.confluence.vetoReasons ?? []),
    ...(console?.currentSignal.failClosedReasons ?? []),
    ...(marketData?.failClosedReasons ?? []),
    ...(liveState.error ? [liveState.error] : [])
  ]);

  return (
    <main className="min-h-screen bg-[#070b12] text-slate-100">
      <section className="mx-auto grid min-h-screen max-w-[1500px] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 px-4 py-4">
        <header className="border border-slate-800 bg-[#0b111d] px-4 py-3" data-testid="terminal-header">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-normal text-slate-50">Event Probability Terminal</h1>
                <StatusBadge label={statusLabel} sourceMode={filters.sourceMode} sourceType={dataSourceType} unavailable={liveUnavailable} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                BTC/ETH 5m/10m event prediction research. Live data is public read-only.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SegmentedLinks
                current={filters}
                label="Symbol"
                options={["BTC", "ETH"]}
                paramName="symbol"
              />
              <SegmentedLinks
                current={filters}
                label="Horizon"
                options={["5m", "10m"]}
                paramName="horizon"
              />
              <HeaderMetric label="Latest price" value={formatUsd(latestPrice, filters.symbol)} strong />
              <HeaderMetric
                label="Price updated"
                value={filters.sourceMode === "live" ? formatTime(marketData?.tickerTime ?? null) : "dev fixture"}
              />
              <HeaderMetric
                label="Price freshness"
                value={filters.sourceMode === "live" ? formatAge(marketData?.tickerFreshnessSeconds ?? null) : "n/a"}
              />
              <HeaderMetric
                label="Candle freshness"
                value={filters.sourceMode === "live" ? formatAge(marketData?.candleFreshnessSeconds ?? null) : formatAge(msToSeconds(console?.currentSignal.dataQuality.freshnessAgeMs))}
              />
              <Link
                className="inline-flex min-h-10 items-center border border-cyan-400/60 bg-cyan-400/10 px-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/15"
                href={terminalHref(filters, { refresh: String(Date.now()) })}
              >
                Refresh
              </Link>
            </div>
          </div>
        </header>

        <section className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_390px]" data-testid="minimal-prediction-terminal">
          <section className="grid min-h-0 gap-3">
            <div className="min-h-0 border border-slate-800 bg-[#0b111d] p-3">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">Candlestick Terminal</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {marketData?.productId ?? console?.dataProvenance.productId ?? `${filters.symbol}-USD`} {console?.dataProvenance.candleInterval ?? "1m"} candles, showing {console?.recentCandles.length ?? 0} of {marketData?.candleCount ?? console?.dataProvenance.candleCount ?? console?.recentCandles.length ?? 0}. Latest closed candle {formatUsd(console?.recentCandles.at(-1)?.close ?? null, filters.symbol)}; provider {marketData?.provider ?? console?.dataProvenance.provider ?? "coinbase-exchange"}.
                  </p>
                </div>
                <div className="flex gap-2 text-xs text-slate-500">
                  <span>Markers {console?.recentMarkers.length ?? 0}/10</span>
                  <span>{dataSourceType}</span>
                </div>
              </div>
              <ConsoleCandlestickChart
                candles={console?.recentCandles ?? []}
                markers={console?.recentMarkers ?? []}
                sourceMode={filters.sourceMode}
                sourceType={dataSourceType}
              />
            </div>

            <section className="grid gap-3 lg:grid-cols-[1fr_1fr_1.15fr]">
              <ConfluenceSummary console={console} />
              <RiskSummary console={console} vetoReasons={vetoReasons} />
              <ObservationSummary console={console} />
            </section>
          </section>

          <aside className="grid content-start gap-3">
            <SignalCard
              console={console}
              consoleError={consoleState.error}
              latestPrice={latestPrice}
              liveUnavailable={liveUnavailable}
              marketDataError={liveState.error}
              sourceType={dataSourceType}
              vetoReasons={vetoReasons}
            />
            <details className="border border-slate-800 bg-[#0b111d] p-3" data-testid="advanced-drawer">
              <summary className="cursor-pointer text-sm font-semibold text-slate-100">Advanced</summary>
              <div className="mt-3 grid gap-3 text-xs text-slate-400">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Link
                    className="border border-amber-400/50 bg-amber-400/10 px-3 py-2 font-semibold text-amber-100"
                    href={terminalHref(filters, { sourceMode: filters.sourceMode === "fixture" ? "live" : "fixture" })}
                  >
                    {filters.sourceMode === "fixture" ? "Return to LIVE" : "Open DEV FIXTURE"}
                  </Link>
                  <Link className="border border-slate-700 bg-slate-950 px-3 py-2 text-slate-300" href="/scanner">
                    Open old scanner
                  </Link>
                </div>
                <Diagnostics console={console} marketData={marketData} consoleError={consoleState.error} marketDataError={liveState.error} />
              </div>
            </details>
          </aside>
        </section>
      </section>
    </main>
  );
}

async function loadEventSignalConsole(filters: TerminalFilters): Promise<ConsoleLoadState> {
  const params = new URLSearchParams({
    symbol: filters.symbol,
    horizon: filters.horizon,
    sourceMode: filters.sourceMode,
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

async function loadLiveMarketData(symbol: SignalSymbol): Promise<LiveLoadState> {
  try {
    const response = await fetch(`${apiBaseUrl}/market-data/live?symbol=${symbol}`, {
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

function parseFilters(params: Awaited<SearchParams>): TerminalFilters {
  return {
    symbol: params.symbol === "ETH" ? "ETH" : "BTC",
    horizon: params.horizon === "10m" ? "10m" : "5m",
    sourceMode: params.sourceMode === "fixture" ? "fixture" : "live",
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
  current: TerminalFilters;
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
            href={terminalHref(current, { [paramName]: option } as Partial<TerminalFilters>)}
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
  console,
  consoleError,
  latestPrice,
  liveUnavailable,
  marketDataError,
  sourceType,
  vetoReasons
}: {
  console: EventSignalConsoleResponse | undefined;
  consoleError: string | undefined;
  latestPrice: number | null;
  liveUnavailable: boolean;
  marketDataError: string | undefined;
  sourceType: DataSourceType;
  vetoReasons: string[];
}) {
  const direction = liveUnavailable || !console ? "NO_SIGNAL" : console.currentSignal.direction;
  const confidence = liveUnavailable ? 0 : console?.currentSignal.confidence ?? 0;
  const score = liveUnavailable ? 0 : console?.currentSignal.score ?? 0;
  const reasons = topItems(
    liveUnavailable
      ? ["Live data unavailable."]
      : [...(console?.confluence.reasons ?? []), ...(console?.currentSignal.reasons ?? [])]
  );

  return (
    <section className="border border-slate-800 bg-[#0b111d] p-4" data-testid="prediction-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Main Signal</div>
          <div className={`mt-2 text-3xl font-semibold ${directionClass(direction)}`}>{displayDirection(direction)}</div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>{console?.symbol ?? "BTC"} {console?.horizon ?? "5m"}</div>
          <div>{console?.profileName ?? "balanced"}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric label="Data source" value={sourceType === "mock" ? "DEV mock" : sourceType} />
        <Metric label="Model" value="Experimental" />
        <Metric label="Confidence" value={formatPercent(confidence)} />
        <Metric label="Score" value={formatSigned(score)} />
        <Metric label="Resolve time" value={formatTime(console?.eventWindow.expectedResolveAt ?? null)} />
        <Metric label="Reference" value={formatUsd(console?.eventWindow.referencePrice ?? null, console?.symbol ?? "BTC")} />
        <Metric label="Current" value={formatUsd(latestPrice ?? console?.eventWindow.currentPrice ?? null, console?.symbol ?? "BTC")} />
        <Metric label="Distance" value={formatDistance(console?.eventWindow.distanceFromReferencePct ?? null)} />
      </div>

      {consoleError || marketDataError ? (
        <div className="mt-3 border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-100">
          {consoleError ?? marketDataError}
        </div>
      ) : null}

      <ReasonBlock title="Primary reasons" items={reasons} empty="No directional reason." />
      <ReasonBlock title="Veto / no-trade" items={vetoReasons} empty="No active veto." />
      <p className="mt-3 border border-slate-800 bg-slate-950 p-2 text-xs text-slate-400">
        Research-only output. No trading action, order, wallet, private endpoint, or real-money execution is available.
      </p>
    </section>
  );
}

function ConfluenceSummary({ console }: { console: EventSignalConsoleResponse | undefined }) {
  const items = [
    ["Trend", console?.confluence.trendScore ?? 0],
    ["Momentum", console?.confluence.momentumScore ?? 0],
    ["Volatility", console?.confluence.volatilityScore ?? 0],
    ["Volume", console?.confluence.volumeScore ?? 0]
  ] as const;
  return (
    <section className="border border-slate-800 bg-[#0b111d] p-3">
      <h3 className="text-sm font-semibold text-slate-100">Strategy Confluence</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {items.map(([label, value]) => (
          <Metric key={label} label={label} value={formatSigned(value)} />
        ))}
      </div>
    </section>
  );
}

function RiskSummary({
  console,
  vetoReasons
}: {
  console: EventSignalConsoleResponse | undefined;
  vetoReasons: string[];
}) {
  return (
    <section className="border border-slate-800 bg-[#0b111d] p-3">
      <h3 className="text-sm font-semibold text-slate-100">Risk / No-trade Filter</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Freshness" value={console?.riskFilters.dataFreshness ?? "unknown"} />
        <Metric label="Volatility" value={console?.riskFilters.volatility ?? "unknown"} />
        <Metric label="Chop" value={console?.riskFilters.chop ?? "unknown"} />
        <Metric label="Conflict" value={console?.riskFilters.conflict ?? "unknown"} />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        {vetoReasons[0] ?? "No active veto in the current snapshot."}
      </p>
    </section>
  );
}

function ObservationSummary({ console }: { console: EventSignalConsoleResponse | undefined }) {
  return (
    <section className="border border-slate-800 bg-[#0b111d] p-3" data-testid="observation-log">
      <h3 className="text-sm font-semibold text-slate-100">Observation Log</h3>
      <div className="mt-3 grid gap-2 text-xs text-slate-300">
        <div className="flex justify-between border border-slate-800 bg-slate-950 px-2 py-1">
          <span className="text-slate-500">Created</span>
          <span>{formatTime(console?.observationCandidate.createdAt ?? null)}</span>
        </div>
        <div className="flex justify-between border border-slate-800 bg-slate-950 px-2 py-1">
          <span className="text-slate-500">Expected resolve</span>
          <span>{formatTime(console?.observationCandidate.expectedResolveAt ?? null)}</span>
        </div>
        <div className="flex justify-between border border-slate-800 bg-slate-950 px-2 py-1">
          <span className="text-slate-500">Observe</span>
          <span>{console?.observationCandidate.canObserve ? "ready" : "limited"}</span>
        </div>
      </div>
    </section>
  );
}

function Diagnostics({
  console,
  marketData,
  consoleError,
  marketDataError
}: {
  console: EventSignalConsoleResponse | undefined;
  marketData: LiveMarketDataResponse | undefined;
  consoleError: string | undefined;
  marketDataError: string | undefined;
}) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">API raw status</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <Metric label="Console mode" value={console?.sourceMode ?? "unavailable"} />
        <Metric label="Console source" value={console?.meta.sourceName ?? "unavailable"} />
        <Metric label="Fixture backed" value={String(console?.meta.isFixtureBacked ?? false)} />
        <Metric label="Live product" value={marketData?.productId ?? "n/a"} />
        <Metric label="Candles" value={`${marketData?.candleCount ?? console?.recentCandles.length ?? 0}`} />
        <Metric label="Warnings" value={`${(console?.warnings.length ?? 0) + (marketData?.warnings.length ?? 0)}`} />
      </div>
      {[consoleError, marketDataError, ...(console?.warnings ?? []), ...(marketData?.warnings ?? [])].filter(Boolean).slice(0, 4).map((item) => (
        <p className="border border-slate-800 bg-slate-950 p-2 text-xs leading-5 text-slate-400" key={item}>
          {item}
        </p>
      ))}
    </section>
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

function ReasonBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h3>
      {items.length ? (
        <ul className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">
          {items.slice(0, 3).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-slate-500">{empty}</p>
      )}
    </section>
  );
}

function StatusBadge({
  label,
  sourceMode,
  sourceType,
  unavailable
}: {
  label: string;
  sourceMode: ResearchSignalSourceMode;
  sourceType: DataSourceType;
  unavailable: boolean;
}) {
  const className =
    sourceType === "mock" || sourceMode === "fixture"
      ? "border-amber-400/70 bg-amber-400/10 text-amber-100"
      : unavailable
        ? "border-rose-400/70 bg-rose-400/10 text-rose-100"
        : "border-emerald-400/70 bg-emerald-400/10 text-emerald-100";
  return (
    <span className={`border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${className}`} data-testid={sourceType === "live" && sourceMode === "live" && !unavailable ? "live-badge" : "data-source-badge"}>
      {label}
    </span>
  );
}

function terminalHref(current: TerminalFilters, updates: Partial<TerminalFilters>) {
  const next: TerminalFilters = {
    ...current,
    ...updates,
    refresh: updates.refresh ?? ""
  };
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
  if (next.profile !== "balanced") {
    params.set("profile", next.profile);
  }
  if (next.refresh) {
    params.set("refresh", next.refresh);
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function displayDirection(direction: SignalDirection) {
  return direction === "LONG" ? "LONG bias" : direction === "SHORT" ? "SHORT bias" : "NO_SIGNAL";
}

function directionClass(direction: SignalDirection) {
  return direction === "LONG" ? "text-emerald-200" : direction === "SHORT" ? "text-rose-200" : "text-slate-200";
}

function topItems(values: string[]): string[] {
  return [...new Set(values.filter((value) => value && !value.includes("No execution instruction")))].slice(0, 3);
}

function formatUsd(value: number | null | undefined, symbol: SignalSymbol) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Unavailable";
  }
  const digits = symbol === "BTC" ? 2 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSigned(value: number) {
  if (!Number.isFinite(value)) {
    return "0.000";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

function formatDistance(value: number | null) {
  return value === null ? "Unavailable" : `${value >= 0 ? "+" : ""}${value.toFixed(3)}%`;
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

function msToSeconds(value: number | undefined) {
  return value === undefined || !Number.isFinite(value) ? null : Math.max(0, Math.round(value / 1000));
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
