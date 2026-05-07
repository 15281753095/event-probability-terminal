import Link from "next/link";
import type { ReactNode } from "react";
import type {
  OhlcvInterval,
  ReplayMetrics,
  ReplayOutcomeStatus,
  ReplayWindowId,
  SignalReplayResponse,
  SignalSymbol
} from "@ept/shared-types";
import { apiErrorMessage } from "../../api-client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  symbol?: string;
  window?: string;
  interval?: string;
  strategy?: string;
  mock?: string;
  refresh?: string;
}>;

type ReplayFilters = {
  symbol: SignalSymbol | "ALL";
  window: Exclude<ReplayWindowId, "custom">;
  interval: OhlcvInterval;
  strategy: "fair-value-v1";
  mock: boolean | null;
  refresh: string;
};

type ReplayLoadState = {
  data?: SignalReplayResponse;
  error?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const symbols: Array<SignalSymbol | "ALL"> = ["BTC", "ETH", "ALL"];
const windows: ReplayFilters["window"][] = ["1d", "3d", "1w", "1m"];
const intervals: OhlcvInterval[] = ["1m", "5m", "15m", "1h"];

export default async function SignalReplayPage({ searchParams }: { searchParams?: SearchParams }) {
  const filters = parseFilters((await searchParams) ?? {});
  const { data, error } = await loadReplay(filters);
  const metrics = data?.metrics;
  const sourceBadge = data?.sourceType === "mock" ? "DEV MOCK" : data?.sourceType === "live" ? "LIVE" : "UNAVAILABLE";

  return (
    <main className="min-h-screen bg-[#070b12] px-4 py-4 text-slate-100">
      <section className="mx-auto grid max-w-[1500px] gap-3" data-testid="signal-replay-page">
        <header className="border border-slate-800 bg-[#0b111d] p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-slate-50">Signal Replay &amp; Win Rate Dashboard</h1>
                <Badge tone={data?.sourceType === "mock" ? "amber" : "emerald"}>{sourceBadge}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone="amber">Research Only</Badge>
                <Badge tone="amber">Not Trading Advice</Badge>
                <Badge tone="amber">No Auto Execution</Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Fair-value v1 historical replay. Realized win rate is computed only from resolved WIN/LOSS samples.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedLinks current={filters} label="Symbol" options={symbols} paramName="symbol" testId="replay-symbol-filter" />
              <SegmentedLinks current={filters} label="Window" options={windows} paramName="window" testId="replay-window-filter" />
              <SegmentedLinks current={filters} label="Interval" options={intervals} paramName="interval" testId="replay-interval-filter" />
              <div className="flex min-h-10 items-center border border-slate-800 bg-slate-950 p-1">
                <span className="px-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">Strategy</span>
                <span className="bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-950">fair-value-v1</span>
              </div>
              <HeaderMetric label="Checked" value={formatTime(data?.checkedAt ?? null)} />
              <Link
                className="inline-flex min-h-10 items-center border border-cyan-400/60 bg-cyan-400/10 px-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/15"
                href={`/strategy-lab?symbol=${filters.symbol}&window=${filters.window}&mock=true&mode=mock`}
              >
                Open Strategy Lab
              </Link>
              <Link
                className="inline-flex min-h-10 items-center border border-cyan-400/60 bg-cyan-400/10 px-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/15"
                href={replayHref(filters, { refresh: String(Date.now()) })}
              >
                Refresh
              </Link>
            </div>
          </div>
        </header>

        {error ? <ErrorBanner message={error} /> : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="replay-metrics-cards">
          <MetricCard title="Win Rate" value={formatNullablePercent(metrics?.winRate ?? null)} strong />
          <MetricCard title="Sample Count" value={formatNumber(metrics?.sampleCount)} />
          <MetricCard title="Actionable Count" value={formatNumber(metrics?.actionableCount)} />
          <MetricCard title="Win / Loss" value={`${metrics?.winCount ?? 0} / ${metrics?.lossCount ?? 0}`} />
          <MetricCard title="Pending" value={formatNumber(metrics?.pendingCount)} />
          <MetricCard title="Unresolved" value={formatNumber(metrics?.unresolvedCount)} />
          <MetricCard title="Rejected" value={formatNumber(metrics?.rejectedCount)} />
          <MetricCard title="NO_SIGNAL" value={formatNumber(metrics?.noSignalCount)} />
          <MetricCard title="Coverage Rate" value={formatNullablePercent(metrics?.coverageRate ?? null)} />
          <MetricCard title="Rejection Rate" value={formatNullablePercent(metrics?.rejectionRate ?? null)} />
          <MetricCard title="Avg Edge" value={formatNullablePercent(metrics?.averageEdge ?? null)} />
          <MetricCard title="Avg Confidence" value={formatNullablePercent(metrics?.averageConfidence ?? null)} />
          <MetricCard title="Theoretical PnL" value={formatSigned(metrics?.cumulativeTheoreticalPnl ?? null)} />
          <MetricCard title="Max Drawdown" value={formatSigned(metrics?.maxDrawdown ?? null)} />
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="border border-slate-800 bg-[#0b111d] p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Marker Timeline</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Chart path preserved for historical K-line overlay; this view shows replay markers and outcome labels first.
                </p>
              </div>
              <div className="text-xs text-slate-500">
                Markers {data?.markers.length ?? 0}
              </div>
            </div>
            <MarkerTimeline data={data} />
          </section>

          <aside className="grid content-start gap-3">
            <section className="border border-slate-800 bg-[#0b111d] p-4">
              <h2 className="text-sm font-semibold text-slate-100">Replay Health</h2>
              <div className="mt-3 grid gap-2 text-xs text-slate-300">
                <ProvenanceRow label="sourceType" value={data?.sourceType ?? "unavailable"} />
                <ProvenanceRow label="provider" value={data?.providerHealth.resolvedProvider ?? "unavailable"} />
                <ProvenanceRow label="status" value={data?.providerHealth.status.toUpperCase() ?? "UNKNOWN"} />
                <ProvenanceRow label="window" value={data?.window.label ?? filters.window} />
                <ProvenanceRow label="strategy" value={filters.strategy} />
              </div>
              <ReasonBlock title="Warnings" items={data?.warnings ?? []} empty="No replay warning." />
              <EmptyState metrics={metrics} />
            </section>
            <nav className="grid gap-2 text-xs">
              <Link className="border border-slate-700 bg-slate-950 px-3 py-2 text-slate-300" href="/signals/console">
                Back to signals console
              </Link>
              <Link className="border border-slate-700 bg-slate-950 px-3 py-2 text-slate-300" href="/">
                Back to terminal
              </Link>
              <Link className="border border-slate-700 bg-slate-950 px-3 py-2 text-slate-300" href="/strategy-lab?mock=true&mode=mock">
                Open Strategy Lab
              </Link>
            </nav>
          </aside>
        </section>

        <section className="border border-slate-800 bg-[#0b111d] p-4" data-testid="replay-results-table">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-100">Replay Results</h2>
            <span className="text-xs text-slate-500">Rows {data?.results.length ?? 0}</span>
          </div>
          <ResultsTable data={data} />
        </section>
      </section>
    </main>
  );
}

async function loadReplay(filters: ReplayFilters): Promise<ReplayLoadState> {
  const params = new URLSearchParams({
    symbol: filters.symbol,
    window: filters.window,
    interval: filters.interval,
    strategy: filters.strategy
  });
  if (filters.mock !== null) {
    params.set("mock", String(filters.mock));
  }
  try {
    const response = await fetch(`${apiBaseUrl}/signals/replay?${params.toString()}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return { error: await apiErrorMessage(response) };
    }
    return { data: (await response.json()) as SignalReplayResponse };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Signal replay API request failed." };
  }
}

function parseFilters(params: Awaited<SearchParams>): ReplayFilters {
  return {
    symbol: params.symbol === "ETH" || params.symbol === "ALL" ? params.symbol : "BTC",
    window: params.window === "1d" || params.window === "3d" || params.window === "1m" ? params.window : "1w",
    interval: params.interval === "5m" || params.interval === "15m" || params.interval === "1h" ? params.interval : "1m",
    strategy: "fair-value-v1",
    mock: params.mock === "true" ? true : params.mock === "false" ? false : null,
    refresh: typeof params.refresh === "string" ? params.refresh.slice(0, 32) : ""
  };
}

function SegmentedLinks({
  current,
  options,
  paramName,
  label,
  testId
}: {
  current: ReplayFilters;
  options: string[];
  paramName: "symbol" | "window" | "interval";
  label: string;
  testId: string;
}) {
  return (
    <div className="flex min-h-10 items-center border border-slate-800 bg-slate-950 p-1" data-testid={testId}>
      <span className="px-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {options.map((option) => {
        const active = current[paramName] === option;
        return (
          <Link
            className={`px-3 py-1.5 text-xs font-semibold ${
              active ? "bg-slate-100 text-slate-950" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
            }`}
            href={replayHref(current, { [paramName]: option } as Partial<ReplayFilters>)}
            key={option}
          >
            {option}
          </Link>
        );
      })}
    </div>
  );
}

function replayHref(current: ReplayFilters, updates: Partial<ReplayFilters>) {
  const next = { ...current, ...updates, refresh: updates.refresh ?? "" };
  const params = new URLSearchParams();
  if (next.symbol !== "BTC") {
    params.set("symbol", next.symbol);
  }
  if (next.window !== "1w") {
    params.set("window", next.window);
  }
  if (next.interval !== "1m") {
    params.set("interval", next.interval);
  }
  if (next.mock !== null) {
    params.set("mock", String(next.mock));
  }
  if (next.refresh) {
    params.set("refresh", next.refresh);
  }
  const query = params.toString();
  return query ? `/signals/replay?${query}` : "/signals/replay";
}

function MarkerTimeline({ data }: { data: SignalReplayResponse | undefined }) {
  const results = data?.results ?? [];
  return (
    <div className="mt-3 grid gap-2" data-testid="replay-marker-summary">
      {results.length ? results.slice(0, 12).map((result) => (
        <div className="grid gap-2 border border-slate-800 bg-slate-950 p-3 text-xs md:grid-cols-[160px_100px_120px_minmax(0,1fr)]" key={result.signal.id}>
          <div className="text-slate-500">{formatDateTime(result.signal.signalTime)}</div>
          <div className={sideClass(result.signal.side)}>{result.signal.side}</div>
          <div className={statusClass(result.outcome.status)}>{result.outcome.status}</div>
          <div className="truncate text-slate-300">{result.signal.question}</div>
        </div>
      )) : (
        <div className="border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">
          No marker timeline available.
        </div>
      )}
    </div>
  );
}

function ResultsTable({ data }: { data: SignalReplayResponse | undefined }) {
  const rows = data?.results ?? [];
  return (
    <div className="mt-3 overflow-x-auto" data-testid="replay-marker-table">
      <table className="w-full min-w-[1120px] border-collapse text-left text-xs">
        <thead className="bg-slate-950 text-[11px] uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <Th>signalTime</Th>
            <Th>market question</Th>
            <Th>side</Th>
            <Th>modelProbabilityYes</Th>
            <Th>marketProbabilityYes</Th>
            <Th>edge</Th>
            <Th>outcome status</Th>
            <Th>theoreticalPnl</Th>
            <Th>reason</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr className="border-t border-slate-800 align-top text-slate-300" key={row.signal.id}>
              <Td>{formatDateTime(row.signal.signalTime)}</Td>
              <Td>
                <div className="max-w-[360px] font-semibold text-slate-100">{row.signal.question}</div>
                <div className="mt-1 text-slate-500">{row.signal.marketId}</div>
              </Td>
              <Td><span className={sideClass(row.signal.side)}>{row.signal.side}</span></Td>
              <Td>{formatNullablePercent(row.signal.modelProbabilityYes)}</Td>
              <Td>{formatNullablePercent(row.signal.marketProbabilityYes)}</Td>
              <Td>{formatNullablePercent(row.signal.edge)}</Td>
              <Td><span className={statusClass(row.outcome.status)}>{row.outcome.status}</span></Td>
              <Td>{formatSigned(row.theoreticalPnl)}</Td>
              <Td><div className="max-w-[320px] text-slate-400">{row.signal.reason}</div></Td>
            </tr>
          )) : (
            <tr>
              <Td>No completed samples</Td>
              <Td>No replay result rows were returned.</Td>
              <Td>Unavailable</Td>
              <Td>Unavailable</Td>
              <Td>Unavailable</Td>
              <Td>Unavailable</Td>
              <Td>Unavailable</Td>
              <Td>Unavailable</Td>
              <Td>Replay endpoint returned no result rows.</Td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ metrics }: { metrics: ReplayMetrics | undefined }) {
  const items: string[] = [];
  if (!metrics) {
    items.push("No eligible markets");
  } else {
    if (metrics.sampleCount === 0) {
      items.push(metrics.pendingCount > 0 ? "All signals pending" : "No completed samples");
    }
    if (metrics.actionableCount === 0 && metrics.rejectedCount === 0 && metrics.noSignalCount === 0) {
      items.push("No eligible markets");
    }
    if (metrics.warnings.includes("LOW_SAMPLE_SIZE")) {
      items.push("Low sample size warning");
    }
  }
  return <ReasonBlock title="Empty states" items={items} empty="Replay has completed samples." />;
}

function MetricCard({ title, value, strong = false }: { title: string; value: string; strong?: boolean }) {
  return (
    <section className="border border-slate-800 bg-[#0b111d] p-4" data-testid="replay-metrics-card">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h3>
      <div className={`mt-2 ${strong ? "text-3xl" : "text-2xl"} font-semibold text-slate-50`}>{value}</div>
    </section>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-10 border border-slate-800 bg-slate-950 px-3 py-1.5">
      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-0.5 whitespace-nowrap text-xs font-semibold text-slate-200">{value}</div>
    </div>
  );
}

function Badge({ children, tone }: { children: string; tone: "amber" | "emerald" }) {
  const className = tone === "amber"
    ? "border-amber-400/50 bg-amber-400/10 text-amber-100"
    : "border-emerald-400/50 bg-emerald-400/10 text-emerald-100";
  return <span className={`border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${className}`}>{children}</span>;
}

function ReasonBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h3>
      {items.length ? (
        <ul className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">
          {items.slice(0, 6).map((item) => <li key={item}>{item}</li>)}
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
  return <div className="border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-100">{message}</div>;
}

function Th({ children }: { children: string }) {
  return <th className="border border-slate-800 px-2 py-2">{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td className="border border-slate-800 px-2 py-2">{children}</td>;
}

function sideClass(side: SignalReplayResponse["signals"][number]["side"]) {
  if (side === "LONG_YES") {
    return "font-semibold text-emerald-200";
  }
  if (side === "LONG_NO") {
    return "font-semibold text-rose-200";
  }
  if (side === "REJECTED") {
    return "font-semibold text-amber-200";
  }
  return "font-semibold text-slate-200";
}

function statusClass(status: ReplayOutcomeStatus) {
  if (status === "WIN") {
    return "font-semibold text-emerald-200";
  }
  if (status === "LOSS") {
    return "font-semibold text-rose-200";
  }
  if (status === "PENDING" || status === "UNRESOLVED") {
    return "font-semibold text-cyan-200";
  }
  if (status === "REJECTED") {
    return "font-semibold text-amber-200";
  }
  return "font-semibold text-slate-200";
}

function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "0" : new Intl.NumberFormat("en-US").format(value);
}

function formatNullablePercent(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "Pending" : `${(value * 100).toFixed(1)}%`;
}

function formatSigned(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Pending";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

function formatTime(value: string | null) {
  if (!value) {
    return "Unavailable";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toISOString().slice(11, 19);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toISOString().replace("T", " ").slice(0, 16);
}
