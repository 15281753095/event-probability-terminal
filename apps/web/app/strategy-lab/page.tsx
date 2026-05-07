import Link from "next/link";
import type { ReactNode } from "react";
import type {
  OhlcvInterval,
  ParameterSweepResult,
  ReplayWindowId,
  StrategyLabReport,
  WalkForwardResult
} from "@ept/shared-types";
import { apiErrorMessage } from "../api-client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  symbol?: string;
  window?: string;
  maxCombinations?: string;
  mode?: string;
  mock?: string;
  refresh?: string;
}>;

type StrategyLabFilters = {
  symbol: "BTC" | "ETH" | "ALL";
  window: Exclude<ReplayWindowId, "custom">;
  maxCombinations: number;
  mode: "mock" | "live";
  refresh: string;
};

type StrategyLabLoadState = {
  report?: StrategyLabReport;
  error?: string;
};

type StoredStrategyLabPayload = {
  status: "ok" | "missing";
  source: "stored";
  sourceType: "live" | "mock" | "fixture";
  latestStoredAt: string | null;
  warnings: string[];
};

type StoredStrategyLabLoadState = {
  stored?: StoredStrategyLabPayload;
  error?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const symbols: StrategyLabFilters["symbol"][] = ["BTC", "ETH", "ALL"];
const windows: StrategyLabFilters["window"][] = ["1d", "3d", "1w", "1m"];
const modes: StrategyLabFilters["mode"][] = ["live", "mock"];
const intervals: OhlcvInterval[] = ["1m", "5m", "15m", "1h"];

export default async function StrategyLabPage({ searchParams }: { searchParams?: SearchParams }) {
  const filters = parseFilters((await searchParams) ?? {});
  const [{ report, error }, storedState] = await Promise.all([
    loadStrategyLab(filters),
    loadStoredStrategyLab(filters)
  ]);
  const top = report?.topCandidates ?? [];
  const firstWalkForward = report?.walkForwardResults[0];

  return (
    <main className="min-h-screen bg-[#070b12] px-4 py-4 text-slate-100">
      <section className="mx-auto grid max-w-[1500px] gap-3" data-testid="strategy-lab-page">
        <header className="border border-slate-800 bg-[#0b111d] p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-slate-50">Strategy Lab</h1>
                <Badge tone={filters.mode === "mock" ? "amber" : "emerald"}>{filters.mode === "mock" ? "DEV MOCK" : "LIVE"}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone="amber">Research Only</Badge>
                <Badge tone="amber">Not Trading Advice</Badge>
                <Badge tone="amber">No Auto Execution</Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                fair-value-v1 parameter sweep with walk-forward train/test separation. Top rows are research candidates only.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedLinks current={filters} label="Symbol" options={symbols} paramName="symbol" testId="strategy-lab-symbol-filter" />
              <SegmentedLinks current={filters} label="Window" options={windows} paramName="window" testId="strategy-lab-window-filter" />
              <SegmentedLinks current={filters} label="Mode" options={modes} paramName="mode" testId="strategy-lab-mode-filter" />
              <SegmentedLinks current={filters} label="Max" options={["10", "20", "50", "100"]} paramName="maxCombinations" testId="strategy-lab-max-filter" />
              <HeaderMetric label="Checked" value={formatTime(report?.checkedAt ?? null)} />
              <Link
                className="inline-flex min-h-10 items-center border border-cyan-400/60 bg-cyan-400/10 px-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/15"
                href={strategyLabHref(filters, { refresh: String(Date.now()) })}
              >
                Refresh
              </Link>
            </div>
          </div>
        </header>

        {error ? <ErrorBanner message={error} /> : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="strategy-lab-summary">
          <MetricCard title="Top Research Candidates" value={formatNumber(top.length)} strong />
          <MetricCard title="Parameter Sweep Results" value={formatNumber(report?.parameterResults.length)} />
          <MetricCard title="Walk-Forward Validation" value={formatNumber(report?.walkForwardResults.length)} />
          <MetricCard title="Overfit Risk" value={top[0]?.overfitRisk ?? firstWalkForward?.overfitRisk ?? "unknown"} />
          <MetricCard title="Best Win Rate" value={formatNullablePercent(top[0]?.metrics.winRate ?? null)} />
          <MetricCard title="Best Actionable Count" value={formatNumber(top[0]?.metrics.actionableCount)} />
          <MetricCard title="Best Theoretical PnL" value={formatSigned(top[0]?.metrics.cumulativeTheoreticalPnl ?? null)} />
          <MetricCard title="Consistency Score" value={formatNullablePercent(firstWalkForward?.stability.consistencyScore ?? null)} />
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="border border-slate-800 bg-[#0b111d] p-4" data-testid="top-research-candidates">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-100">Top Research Candidates</h2>
              <span className="text-xs text-slate-500">Not production strategy approval</span>
            </div>
            <ParameterTable results={top} compact />
          </section>

          <aside className="grid content-start gap-3">
            <section className="border border-slate-800 bg-[#0b111d] p-4" data-testid="strategy-lab-warnings">
              <h2 className="text-sm font-semibold text-slate-100">Low Sample Warnings</h2>
              <ReasonBlock items={[...(report?.warnings ?? []), ...(storedState.error ? [storedState.error] : [])]} empty="No Strategy Lab warning." />
            </section>
            <section className="border border-slate-800 bg-[#0b111d] p-4">
              <h2 className="text-sm font-semibold text-slate-100">Parameter Coverage</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <Metric label="intervals" value={intervals.join(", ")} />
                <Metric label="symbol" value={filters.symbol} />
                <Metric label="window" value={filters.window} />
                <Metric label="mode" value={filters.mode} />
                <Metric label="stored" value={storedState.stored?.status === "ok" ? "Stored Results Available" : "No Stored Results"} />
                <Metric label="Last Capture Time" value={formatTime(storedState.stored?.latestStoredAt ?? null)} />
              </div>
            </section>
          </aside>
        </section>

        <section className="border border-slate-800 bg-[#0b111d] p-4" data-testid="parameter-sweep-results">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-100">Parameter Sweep Results</h2>
            <span className="text-xs text-slate-500">Rows {report?.parameterResults.length ?? 0}</span>
          </div>
          <ParameterTable results={report?.parameterResults ?? []} />
        </section>

        <section className="border border-slate-800 bg-[#0b111d] p-4" data-testid="walk-forward-validation">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-100">Walk-Forward Validation</h2>
            <span className="text-xs text-slate-500">Train / test separated</span>
          </div>
          <WalkForwardTable results={report?.walkForwardResults ?? []} />
        </section>

        <section className="border border-slate-800 bg-[#0b111d] p-4" data-testid="rejected-parameter-sets">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-100">Rejected Parameter Sets</h2>
            <span className="text-xs text-slate-500">Rows {report?.rejectedParameterSets.length ?? 0}</span>
          </div>
          <ParameterTable results={report?.rejectedParameterSets ?? []} compact />
        </section>

        <nav className="flex flex-wrap gap-2 text-xs">
          <Link className="border border-slate-700 bg-slate-950 px-3 py-2 text-slate-300" href="/signals/replay">
            Signal Replay
          </Link>
          <Link className="border border-slate-700 bg-slate-950 px-3 py-2 text-slate-300" href="/signals/console">
            Signals Console
          </Link>
          <Link className="border border-slate-700 bg-slate-950 px-3 py-2 text-slate-300" href="/">
            Terminal
          </Link>
        </nav>
      </section>
    </main>
  );
}

async function loadStrategyLab(filters: StrategyLabFilters): Promise<StrategyLabLoadState> {
  const params = new URLSearchParams({
    symbol: filters.symbol,
    window: filters.window,
    maxCombinations: String(filters.maxCombinations),
    mode: filters.mode
  });
  params.set("mock", String(filters.mode === "mock"));
  try {
    const response = await fetch(`${apiBaseUrl}/strategy-lab/sweep?${params.toString()}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return { error: await apiErrorMessage(response) };
    }
    const payload = (await response.json()) as { report: StrategyLabReport };
    return { report: payload.report };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Strategy Lab API request failed." };
  }
}

async function loadStoredStrategyLab(filters: StrategyLabFilters): Promise<StoredStrategyLabLoadState> {
  const params = new URLSearchParams({
    symbol: filters.symbol,
    window: filters.window,
    strategy: "fair-value-v1"
  });
  try {
    const response = await fetch(`${apiBaseUrl}/strategy-lab/stored?${params.toString()}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return { error: await apiErrorMessage(response) };
    }
    return { stored: (await response.json()) as StoredStrategyLabPayload };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Stored Strategy Lab API request failed." };
  }
}

function parseFilters(params: Awaited<SearchParams>): StrategyLabFilters {
  const max = Number(params.maxCombinations);
  const explicitMock = params.mock === "true" ? "mock" : params.mock === "false" ? "live" : null;
  return {
    symbol: params.symbol === "ETH" || params.symbol === "ALL" ? params.symbol : "BTC",
    window: params.window === "1d" || params.window === "3d" || params.window === "1m" ? params.window : "1w",
    maxCombinations: Number.isFinite(max) ? Math.max(1, Math.min(100, Math.floor(max))) : 5,
    mode: explicitMock ?? (params.mode === "mock" ? "mock" : "live"),
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
  current: StrategyLabFilters;
  options: string[];
  paramName: "symbol" | "window" | "mode" | "maxCombinations";
  label: string;
  testId: string;
}) {
  return (
    <div className="flex min-h-10 items-center border border-slate-800 bg-slate-950 p-1" data-testid={testId}>
      <span className="px-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {options.map((option) => {
        const active = String(current[paramName]) === option;
        return (
          <Link
            className={`px-3 py-1.5 text-xs font-semibold ${
              active ? "bg-slate-100 text-slate-950" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
            }`}
            href={strategyLabHref(current, { [paramName]: paramName === "maxCombinations" ? Number(option) : option } as Partial<StrategyLabFilters>)}
            key={option}
          >
            {option}
          </Link>
        );
      })}
    </div>
  );
}

function strategyLabHref(current: StrategyLabFilters, updates: Partial<StrategyLabFilters>) {
  const next = { ...current, ...updates, refresh: updates.refresh ?? "" };
  const params = new URLSearchParams({
    symbol: next.symbol,
    window: next.window,
    maxCombinations: String(next.maxCombinations),
    mode: next.mode
  });
  params.set("mock", String(next.mode === "mock"));
  if (next.refresh) {
    params.set("refresh", next.refresh);
  }
  return `/strategy-lab?${params.toString()}`;
}

function ParameterTable({ results, compact = false }: { results: ParameterSweepResult[]; compact?: boolean }) {
  if (results.length === 0) {
    return <div className="mt-3 border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">No research candidate rows available.</div>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-xs" data-testid="parameter-table">
        <thead className="text-slate-500">
          <tr className="border-b border-slate-800">
            <th className="py-2 pr-3">Rank</th>
            <th className="py-2 pr-3">Parameters</th>
            <th className="py-2 pr-3">Score breakdown</th>
            <th className="py-2 pr-3">Win Rate</th>
            <th className="py-2 pr-3">Actionable</th>
            <th className="py-2 pr-3">Coverage</th>
            <th className="py-2 pr-3">Rejected</th>
            <th className="py-2 pr-3">Avg Edge</th>
            <th className="py-2 pr-3">PnL</th>
            <th className="py-2 pr-3">Drawdown</th>
            <th className="py-2 pr-3">Overfit Risk</th>
            {!compact ? <th className="py-2 pr-3">Reasons</th> : null}
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr className="border-b border-slate-900 text-slate-300" key={result.parameterSet.id}>
              <td className="py-2 pr-3 font-semibold text-slate-100">{result.rank || "-"}</td>
              <td className="py-2 pr-3">
                <div className="font-mono text-[11px] text-cyan-100">{result.parameterSet.interval}</div>
                <div>edge {result.parameterSet.minEdgeBps} bps · spread {result.parameterSet.maxSpread}</div>
                <div>vol {result.parameterSet.volatilityLookbackCandles} · conf {formatNullablePercent(result.parameterSet.minConfidence)}</div>
              </td>
              <td className="py-2 pr-3">
                <div className="font-semibold text-slate-100">{formatNumber(result.score)}</div>
                <div className="text-slate-500">
                  W {formatNumber(result.scoreBreakdown.winRateComponent)} · P {formatNumber(result.scoreBreakdown.pnlComponent)} · C {formatNumber(result.scoreBreakdown.coverageComponent)}
                </div>
                <div className="text-slate-500">
                  D -{formatNumber(result.scoreBreakdown.drawdownPenalty)} · S -{formatNumber(result.scoreBreakdown.lowSamplePenalty)}
                </div>
              </td>
              <td className="py-2 pr-3">{formatNullablePercent(result.metrics.winRate)}</td>
              <td className="py-2 pr-3">{formatNumber(result.metrics.actionableCount)}</td>
              <td className="py-2 pr-3">{formatNullablePercent(result.metrics.coverageRate)}</td>
              <td className="py-2 pr-3">{formatNullablePercent(result.metrics.rejectionRate)}</td>
              <td className="py-2 pr-3">{formatNullablePercent(result.metrics.averageEdge)}</td>
              <td className="py-2 pr-3">{formatSigned(result.metrics.cumulativeTheoreticalPnl)}</td>
              <td className="py-2 pr-3">{formatSigned(result.metrics.maxDrawdown)}</td>
              <td className={`py-2 pr-3 ${riskClass(result.overfitRisk)}`}>{result.overfitRisk}</td>
              {!compact ? <td className="max-w-[260px] py-2 pr-3 text-slate-500">{firstItems([...result.rejectionReasons, ...result.warnings]).join(" · ") || "candidate"}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WalkForwardTable({ results }: { results: WalkForwardResult[] }) {
  if (results.length === 0) {
    return <div className="mt-3 border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">No walk-forward result available.</div>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-xs" data-testid="walk-forward-table">
        <thead className="text-slate-500">
          <tr className="border-b border-slate-800">
            <th className="py-2 pr-3">Parameter</th>
            <th className="py-2 pr-3">Train Win Rate</th>
            <th className="py-2 pr-3">Test Win Rate</th>
            <th className="py-2 pr-3">Train PnL</th>
            <th className="py-2 pr-3">Test PnL</th>
            <th className="py-2 pr-3">Degradation</th>
            <th className="py-2 pr-3">Consistency Score</th>
            <th className="py-2 pr-3">Windows</th>
            <th className="py-2 pr-3">Overfit Risk</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr className="border-b border-slate-900 text-slate-300" key={result.parameterSet.id}>
              <td className="py-2 pr-3">
                <div className="font-mono text-[11px] text-cyan-100">{result.parameterSet.interval}</div>
                <div>edge {result.parameterSet.minEdgeBps} · spread {result.parameterSet.maxSpread}</div>
              </td>
              <td className="py-2 pr-3">{formatNullablePercent(result.aggregateTrainMetrics.winRate)}</td>
              <td className="py-2 pr-3">{formatNullablePercent(result.aggregateTestMetrics.winRate)}</td>
              <td className="py-2 pr-3">{formatSigned(result.aggregateTrainMetrics.cumulativeTheoreticalPnl)}</td>
              <td className="py-2 pr-3">{formatSigned(result.aggregateTestMetrics.cumulativeTheoreticalPnl)}</td>
              <td className="py-2 pr-3">
                <div>win {formatSigned(result.degradation.winRateDelta)}</div>
                <div>pnl {formatSigned(result.degradation.pnlDelta)}</div>
              </td>
              <td className="py-2 pr-3">{formatNullablePercent(result.stability.consistencyScore)}</td>
              <td className="py-2 pr-3">{result.stability.passedWindows} / {result.windows.length}</td>
              <td className={`py-2 pr-3 ${riskClass(result.overfitRisk)}`}>{result.overfitRisk}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: "amber" | "emerald" }) {
  const className = tone === "amber"
    ? "border-amber-400/50 bg-amber-400/10 text-amber-100"
    : "border-emerald-400/50 bg-emerald-400/10 text-emerald-100";
  return <span className={`border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${className}`}>{children}</span>;
}

function MetricCard({ title, value, strong = false }: { title: string; value: string; strong?: boolean }) {
  return (
    <section className="border border-slate-800 bg-[#0b111d] p-4">
      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{title}</div>
      <div className={`mt-2 truncate ${strong ? "text-2xl" : "text-xl"} font-semibold text-slate-50`}>{value}</div>
    </section>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-10 border border-slate-800 bg-slate-950 px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="text-xs font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-800 bg-slate-950 p-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 truncate font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function ReasonBlock({ items, empty }: { items: string[]; empty: string }) {
  const values = firstItems(items, 8);
  return (
    <div className="mt-3 grid gap-2 text-xs">
      {values.length ? values.map((item) => (
        <div className="border border-slate-800 bg-slate-950 p-2 text-slate-400" key={item}>{item}</div>
      )) : (
        <div className="border border-slate-800 bg-slate-950 p-2 text-slate-500">{empty}</div>
      )}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-100">{message}</div>;
}

function firstItems(values: string[], limit = 4): string[] {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
}

function riskClass(value: string): string {
  if (value === "high") {
    return "text-red-300";
  }
  if (value === "medium" || value === "unknown") {
    return "text-amber-200";
  }
  return "text-emerald-200";
}

function formatNullablePercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function formatSigned(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "n/a";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

function formatNumber(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "0" : value.toFixed(Math.abs(value) < 10 && value % 1 !== 0 ? 3 : 0);
}

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString("en-US", { hour12: false }) : "n/a";
}
