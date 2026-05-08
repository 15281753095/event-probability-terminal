import Link from "next/link";
import type { ReactNode } from "react";
import type {
  DataSourceType,
  ShortWindowCurrentResponse,
  ShortWindowInterval,
  ShortWindowMarker,
  ShortWindowMetrics,
  ShortWindowMetricsWindow,
  ShortWindowReplayResponse,
  ShortWindowSignalSide,
  ShortWindowVenue,
  SignalMarker,
  SignalSymbol
} from "@ept/shared-types";
import { apiErrorMessage } from "../api-client";
import { ConsoleCandlestickChart } from "../ConsoleCandlestickChart";
import { RealTimePriceCard } from "../RealTimePriceCard";
import { ShortWindowRuntimePanel } from "./ShortWindowRuntimePanel";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  symbol?: string;
  interval?: string;
  venue?: string;
  mock?: string;
  refresh?: string;
}>;

type Filters = {
  symbol: SignalSymbol;
  interval: ShortWindowInterval;
  venue: ShortWindowVenue;
  mock: boolean | null;
  refresh: string;
};

type CurrentLoadState = {
  data?: ShortWindowCurrentResponse;
  error?: string;
};

type ReplayLoadState = {
  data?: ShortWindowReplayResponse;
  error?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const intervals: ShortWindowInterval[] = ["5m", "10m", "15m"];
const windows: ShortWindowMetricsWindow[] = ["1d", "3d", "1w", "1m"];

export default async function ShortWindowTerminalPage({ searchParams }: { searchParams?: SearchParams }) {
  const filters = parseFilters((await searchParams) ?? {});
  const [currentState, replayStates] = await Promise.all([
    loadCurrent(filters),
    Promise.all(windows.map(async (window) => [window, await loadReplay(filters, window)] as const))
  ]);
  const current = currentState.data;
  const replayByWindow = Object.fromEntries(replayStates) as Record<ShortWindowMetricsWindow, ReplayLoadState>;
  const primaryReplay = replayByWindow["1d"].data;
  const metrics = windows.map((window) => replayByWindow[window].data?.metrics).filter(Boolean) as ShortWindowMetrics[];
  const sourceType: DataSourceType = current?.sourceType === "mock" ? "mock" : "live";
  const chartMarkers = [
    ...(primaryReplay?.markers ?? []),
    ...(current?.signal ? [currentSignalMarker(current.signal.side, current.signal.signalTime, current.signal.currentPrice, current.signal.reasons[0] ?? "")] : [])
  ].map(toChartMarker);
  const ruleWarning = current?.rule.isVerifiedRule === false || current?.rule.ruleConfidence === "unknown";

  return (
    <main className="min-h-screen bg-[#060910] px-4 py-4 text-slate-100">
      <section className="mx-auto grid max-w-[1540px] gap-3" data-testid="short-window-terminal">
        <header className="border border-slate-800 bg-[#0a101b] p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-slate-50">Short-Window Event Contract Terminal</h1>
                <Badge tone="amber">Research Only</Badge>
                <Badge tone="cyan">Manual Decision Support</Badge>
                <Badge tone="amber">No Auto Execution</Badge>
                <Badge tone="amber">No Trading API</Badge>
              </div>
              <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-500">
                BTC/ETH 5m, 10m, and 15m proxy signals for short-window event contracts. Production data uses public market data or local store only.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedLinks current={filters} label="Symbol" options={["BTC", "ETH"]} paramName="symbol" />
              <SegmentedLinks current={filters} label="Interval" options={intervals} paramName="interval" />
              <VenueLinks current={filters} />
              <HeaderMetric label="Venue" value={venueLabel(filters.venue)} />
              <HeaderMetric label="Rule" value={current?.rule.ruleConfidence ?? "unknown"} />
              <Link className="inline-flex min-h-10 items-center border border-cyan-400/60 bg-cyan-400/10 px-3 text-xs font-semibold text-cyan-100" href={shortWindowHref(filters, { refresh: String(Date.now()) })}>
                Refresh
              </Link>
              <Link className="inline-flex min-h-10 items-center border border-slate-700 bg-slate-950 px-3 text-xs font-semibold text-slate-300" href="/">
                Terminal Home
              </Link>
            </div>
          </div>
        </header>

        {currentState.error ? <ErrorBanner message={currentState.error} /> : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_420px]">
          <RealTimePriceCard symbol="BTC" />
          <RealTimePriceCard symbol="ETH" />
          <ShortWindowRuntimePanel
            symbol={filters.symbol}
            initialPrice={current?.event.currentPrice ?? null}
            endTime={current?.event.endTime ?? new Date().toISOString()}
            initialSecondsRemaining={current?.event.secondsRemaining ?? 0}
            initialSourceType={current?.sourceType ?? "live"}
          />
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_430px]">
          <section className="grid gap-3">
            <section className="grid gap-3 lg:grid-cols-[1fr_1fr_1.1fr]">
              <EventWindowCard current={current} />
              <SignalCard current={current} error={currentState.error} />
              <RuleCard current={current} ruleWarning={ruleWarning} />
            </section>

            <section className="border border-slate-800 bg-[#0a101b] p-3" data-testid="short-window-chart">
              <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">Realtime K-line Signal Surface</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {filters.symbol}USDT public 1m candles with short-window markers. Start reference is shown in the window summary.
                  </p>
                </div>
                <div className="text-xs text-slate-500">
                  Candles {current?.realtimePrice.candles.length ?? 0} · Markers {chartMarkers.length}
                </div>
              </div>
              <ConsoleCandlestickChart
                candles={current?.realtimePrice.candles ?? []}
                markers={chartMarkers}
                sourceMode="live"
                sourceType={sourceType}
                emptyReason={currentState.error}
              />
            </section>

            <section className="border border-slate-800 bg-[#0a101b] p-4" data-testid="short-window-metrics">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">Historical Proxy Win Rate</h2>
                  <p className="mt-1 text-xs text-slate-500">WAIT and REJECTED are excluded from win-rate denominator.</p>
                </div>
                <Badge tone={primaryReplay?.proxyBacktest ? "amber" : "cyan"}>{primaryReplay?.proxyBacktest ? "Proxy Backtest" : "Verified Mock"}</Badge>
              </div>
              <MetricsGrid metrics={metrics} errors={windows.map((window) => replayByWindow[window].error).filter(Boolean) as string[]} />
            </section>
          </section>

          <aside className="grid content-start gap-3">
            <section className="border border-slate-800 bg-[#0a101b] p-4">
              <h2 className="text-sm font-semibold text-slate-100">Recent Signals</h2>
              <RecentSignals replay={primaryReplay} current={current} />
            </section>
            <section className="border border-slate-800 bg-[#0a101b] p-4">
              <h2 className="text-sm font-semibold text-slate-100">Manual Venue Readiness</h2>
              <div className="mt-3 grid gap-2 text-xs text-slate-300">
                <Metric label="Binance Wallet" value={readinessLabel(current, filters.venue === "binance-wallet-prediction")} />
                <Metric label="HiBit" value={readinessLabel(current, filters.venue === "hibit")} />
                <Metric label="Mobile review" value={current?.signal.side === "WAIT" || current?.signal.side === "REJECTED" ? "Wait for better research setup" : "Manual review only"} />
              </div>
              <ReasonBlock
                title="Risk warnings"
                items={[
                  ...(current?.warnings ?? []),
                  ...(primaryReplay?.warnings ?? []),
                  ...(current?.signal.rejectReasons ?? [])
                ]}
                empty="No current warning."
              />
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}

async function loadCurrent(filters: Filters): Promise<CurrentLoadState> {
  const params = new URLSearchParams({
    symbol: filters.symbol,
    interval: filters.interval,
    venue: filters.venue
  });
  if (filters.mock !== null) {
    params.set("mock", String(filters.mock));
  }
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

async function loadReplay(filters: Filters, window: ShortWindowMetricsWindow): Promise<ReplayLoadState> {
  const params = new URLSearchParams({
    symbol: filters.symbol,
    interval: filters.interval,
    venue: filters.venue,
    window
  });
  if (filters.mock !== null) {
    params.set("mock", String(filters.mock));
  }
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

function parseFilters(params: Awaited<SearchParams>): Filters {
  return {
    symbol: params.symbol === "ETH" ? "ETH" : "BTC",
    interval: params.interval === "10m" || params.interval === "15m" ? params.interval : "5m",
    venue: params.venue === "binance-wallet-prediction" || params.venue === "hibit" || params.venue === "mock" ? params.venue : "proxy-generic",
    mock: params.mock === "true" ? true : params.mock === "false" ? false : null,
    refresh: typeof params.refresh === "string" ? params.refresh.slice(0, 32) : ""
  };
}

function EventWindowCard({ current }: { current: ShortWindowCurrentResponse | undefined }) {
  return (
    <section className="border border-slate-800 bg-[#0a101b] p-4">
      <h2 className="text-sm font-semibold text-slate-100">Current Event Window</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Metric label="window start" value={formatTime(current?.event.startTime ?? null)} />
        <Metric label="window end" value={formatTime(current?.event.endTime ?? null)} />
        <Metric label="start reference" value={formatUsd(current?.event.startReferencePrice ?? null)} />
        <Metric label="current price" value={formatUsd(current?.event.currentPrice ?? null)} />
        <Metric label="distance" value={formatSigned(current?.event.distanceFromStart ?? null)} />
        <Metric label="distance bps" value={formatBps(current?.event.distanceBps ?? null)} />
        <Metric label="phase" value={current?.event.status ?? "unavailable"} />
        <Metric label="source" value={current?.sourceType ?? "unavailable"} />
      </div>
      {current?.event.status === "no_entry_zone" ? (
        <div className="mt-3 border border-amber-400/40 bg-amber-400/10 p-2 text-xs font-semibold text-amber-100">
          No-entry zone warning
        </div>
      ) : null}
    </section>
  );
}

function SignalCard({ current, error }: { current: ShortWindowCurrentResponse | undefined; error: string | undefined }) {
  const side = current?.signal.side ?? "WAIT";
  return (
    <section className="border border-slate-800 bg-[#0a101b] p-4" data-testid="short-window-signal-card">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-100">Signal</h2>
        <Badge tone="amber">Not Trading Advice</Badge>
      </div>
      <div className={`mt-4 text-4xl font-semibold ${sideTone(side)}`}>{side}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Metric label="confidence" value={formatPercent(current?.signal.confidence ?? null)} />
        <Metric label="score" value={formatScore(current?.signal.score ?? null)} />
        <Metric label="seconds left" value={`${current?.signal.secondsRemaining ?? 0}s`} />
        <Metric label="phase" value={current?.signal.phase ?? "unavailable"} />
      </div>
      <ReasonBlock title="Signal reasons" items={current?.signal.reasons ?? (error ? [error] : [])} empty="No current signal reason." />
      <ReasonBlock title="Reject / wait reasons" items={current?.signal.rejectReasons ?? []} empty="No active reject reason." />
      <div className="mt-3 border border-cyan-400/40 bg-cyan-400/10 p-2 text-xs font-semibold text-cyan-100">
        Manual action only
      </div>
    </section>
  );
}

function RuleCard({ current, ruleWarning }: { current: ShortWindowCurrentResponse | undefined; ruleWarning: boolean }) {
  return (
    <section className="border border-slate-800 bg-[#0a101b] p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-100">Rule Template</h2>
        {ruleWarning ? <Badge tone="amber" testId="short-window-rule-warning">Unverified Rule / Proxy Model</Badge> : <Badge tone="cyan" testId="short-window-rule-warning">Verified Mock Rule</Badge>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Metric label="venue" value={venueLabel(current?.rule.venue ?? "proxy-generic")} />
        <Metric label="rule type" value={current?.rule.ruleType ?? "UNKNOWN"} />
        <Metric label="reference" value={current?.rule.referenceSource ?? "UNKNOWN"} />
        <Metric label="tie rule" value={current?.rule.tieRule ?? "UNKNOWN"} />
        <Metric label="verified" value={String(current?.rule.isVerifiedRule ?? false)} />
        <Metric label="confidence" value={current?.rule.ruleConfidence ?? "unknown"} />
      </div>
      <ReasonBlock title="Rule notes" items={current?.rule.notes ?? []} empty="No rule notes." />
    </section>
  );
}

function MetricsGrid({ metrics, errors }: { metrics: ShortWindowMetrics[]; errors: string[] }) {
  if (!metrics.length) {
    return <div className="mt-3 border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">{errors[0] ?? "No replay metrics available."}</div>;
  }
  return (
    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <section className="border border-slate-800 bg-slate-950 p-3 text-xs" key={metric.window}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100">{metric.window}</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Metric label="winRate" value={formatPercent(metric.winRate)} />
            <Metric label="actionable" value={String(metric.actionableCount)} />
            <Metric label="longUp" value={formatPercent(metric.longUpWinRate)} />
            <Metric label="longDown" value={formatPercent(metric.longDownWinRate)} />
            <Metric label="wait" value={String(metric.waitCount)} />
            <Metric label="rejected" value={String(metric.rejectedCount)} />
            <Metric label="drawdown" value={metric.maxDrawdown === null ? "n/a" : String(metric.maxDrawdown)} />
            <Metric label="events" value={String(metric.totalEvents)} />
          </div>
        </section>
      ))}
    </div>
  );
}

function RecentSignals({ replay, current }: { replay: ShortWindowReplayResponse | undefined; current: ShortWindowCurrentResponse | undefined }) {
  const rows = [
    ...(current ? [{
      time: current.signal.signalTime,
      side: current.signal.side,
      confidence: current.signal.confidence,
      price: current.signal.currentPrice,
      result: "CURRENT",
      reason: current.signal.reasons[0] ?? ""
    }] : []),
    ...(replay?.results.slice(-8).reverse().map((result) => ({
      time: result.signal.signalTime,
      side: result.signal.side,
      confidence: result.signal.confidence,
      price: result.signal.currentPrice,
      result: result.outcome.status,
      reason: result.signal.reasons[0] ?? ""
    })) ?? [])
  ];
  if (!rows.length) {
    return <div className="mt-3 border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">No recent signal rows.</div>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead className="text-slate-500">
          <tr className="border-b border-slate-800">
            <Th>Time</Th>
            <Th>Side</Th>
            <Th>Conf</Th>
            <Th>Price</Th>
            <Th>Result</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b border-slate-900 text-slate-300" key={`${row.time}-${row.side}-${row.result}`}>
              <Td>{formatTime(row.time)}</Td>
              <Td><span className={sideTone(row.side)}>{row.side}</span></Td>
              <Td>{formatPercent(row.confidence)}</Td>
              <Td>{formatUsd(row.price)}</Td>
              <Td>{row.result}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
  paramName: "symbol" | "interval";
}) {
  return (
    <div className="flex min-h-10 items-center border border-slate-800 bg-slate-950 p-1">
      <span className="px-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {options.map((option) => {
        const active = current[paramName] === option;
        return (
          <Link className={`px-3 py-1.5 text-xs font-semibold ${active ? "bg-slate-100 text-slate-950" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"}`} href={shortWindowHref(current, { [paramName]: option } as Partial<Filters>)} key={option}>
            {option}
          </Link>
        );
      })}
    </div>
  );
}

function VenueLinks({ current }: { current: Filters }) {
  const options: ShortWindowVenue[] = ["binance-wallet-prediction", "hibit", "proxy-generic"];
  return (
    <div className="flex min-h-10 items-center border border-slate-800 bg-slate-950 p-1">
      <span className="px-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">Venue</span>
      {options.map((venue) => (
        <Link className={`px-3 py-1.5 text-xs font-semibold ${current.venue === venue ? "bg-slate-100 text-slate-950" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"}`} href={shortWindowHref(current, { venue })} key={venue}>
          {venueLabel(venue)}
        </Link>
      ))}
    </div>
  );
}

function ReasonBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="mt-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</h3>
      {items.length ? (
        <ul className="mt-2 grid gap-1 text-xs text-slate-300">
          {items.slice(0, 8).map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <div className="mt-2 text-xs text-slate-500">{empty}</div>
      )}
    </div>
  );
}

function shortWindowHref(current: Filters, updates: Partial<Filters>) {
  const next = { ...current, ...updates, refresh: updates.refresh ?? "" };
  const params = new URLSearchParams();
  if (next.symbol !== "BTC") {
    params.set("symbol", next.symbol);
  }
  if (next.interval !== "5m") {
    params.set("interval", next.interval);
  }
  if (next.venue !== "proxy-generic") {
    params.set("venue", next.venue);
  }
  if (next.mock !== null) {
    params.set("mock", String(next.mock));
  }
  if (next.refresh) {
    params.set("refresh", next.refresh);
  }
  const query = params.toString();
  return query ? `/short-window?${query}` : "/short-window";
}

function toChartMarker(marker: ShortWindowMarker): SignalMarker {
  return {
    time: marker.time,
    price: marker.price ?? 0,
    direction: marker.side === "LONG_UP" ? "LONG" : marker.side === "LONG_DOWN" ? "SHORT" : "NO_SIGNAL",
    score: marker.side === "WAIT" || marker.side === "REJECTED" ? 0 : 1,
    confidence: marker.side === "WAIT" || marker.side === "REJECTED" ? 0 : 0.5,
    reasonSummary: marker.reason,
    isRecentOnly: true,
    markerType: "signal"
  };
}

function currentSignalMarker(side: ShortWindowSignalSide, time: string, price: number | null, reason: string): ShortWindowMarker {
  return {
    id: `current-${time}`,
    time,
    price,
    side,
    label: side,
    reason,
    isResearchOnly: true
  };
}

function readinessLabel(current: ShortWindowCurrentResponse | undefined, selected: boolean) {
  if (!current) {
    return "Unavailable";
  }
  if (current.rule.ruleConfidence === "unknown") {
    return "Rule unverified";
  }
  if (current.signal.side === "REJECTED") {
    return "Rejected by research filters";
  }
  if (current.signal.side === "WAIT") {
    return selected ? "Selected; wait state" : "Reference only";
  }
  return selected ? "Selected; manual review only" : "Reference only";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-800 bg-slate-950 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 break-words font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-10 border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs">
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function Badge({ children, tone = "cyan", testId }: { children: string; tone?: "cyan" | "amber"; testId?: string }) {
  return (
    <span className={`border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${tone === "amber" ? "border-amber-400/50 bg-amber-400/10 text-amber-100" : "border-cyan-400/50 bg-cyan-400/10 text-cyan-100"}`} data-testid={testId}>
      {children}
    </span>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">{message}</div>;
}

function Th({ children }: { children: string }) {
  return <th className="px-2 py-2 font-medium">{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td className="px-2 py-2 align-top">{children}</td>;
}

function venueLabel(venue: ShortWindowVenue) {
  switch (venue) {
    case "binance-wallet-prediction":
      return "Binance Wallet";
    case "hibit":
      return "HiBit";
    case "mock":
      return "Mock";
    case "proxy-generic":
      return "Proxy Generic";
  }
}

function sideTone(side: ShortWindowSignalSide | string): string {
  if (side === "LONG_UP") {
    return "text-emerald-200";
  }
  if (side === "LONG_DOWN") {
    return "text-rose-200";
  }
  if (side === "REJECTED") {
    return "text-amber-200";
  }
  return "text-slate-200";
}

function formatUsd(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Pending";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatTime(value: string | null) {
  if (!value) {
    return "Pending";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Pending" : date.toISOString().slice(11, 19);
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatScore(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(2);
}

function formatBps(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(2)} bps`;
}

function formatSigned(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}
