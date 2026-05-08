import Link from "next/link";
import type { ReactNode } from "react";
import { apiErrorMessage } from "../api-client";

export const dynamic = "force-dynamic";

type StoreStatusPayload = {
  storeKind: "sqlite" | "jsonl";
  dbPath: string;
  checkedAt: string;
  counts: Record<string, number>;
  latest: {
    latestMarketSnapshotAt: string | null;
    latestCandleCloseAt: string | null;
    latestFairValueSignalAt: string | null;
    latestReplayMetricsAt: string | null;
    latestShortWindowSignalAt: string | null;
    latestShortWindowReplayAt: string | null;
    latestStrategyLabResultAt: string | null;
    latestCaptureRunAt: string | null;
  };
  coverage: Array<{
    window: string;
    since: string;
    candleCount: number;
    marketSnapshotCount: number;
    fairValueSignalCount: number;
    replayResultCount: number;
    strategyLabResultCount: number;
  }>;
  latestCaptureRun: CaptureRun | null;
};

type CaptureRun = {
  id?: number;
  jobName: string;
  status: "success" | "partial" | "failed";
  startedAt: string;
  finishedAt: string;
  sourceType: "live" | "mock" | "fixture";
  recordsInserted: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errorMessage?: string | null;
  warningsJson: string;
};

type LoadState = {
  status?: StoreStatusPayload;
  runs: CaptureRun[];
  error?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default async function ResearchDataStorePage() {
  const state = await loadDataStore();
  const status = state.status;
  const latest = status?.latest;

  return (
    <main className="min-h-screen bg-[#070b12] px-4 py-4 text-slate-100">
      <section className="mx-auto grid max-w-[1500px] gap-3" data-testid="research-data-store-page">
        <header className="border border-slate-800 bg-[#0b111d] p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-slate-50">Research Data Store</h1>
                <Badge>Research Only</Badge>
                <Badge>Public Data Capture</Badge>
                <Badge>No Trading</Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Local public/read-only research data for candles, market odds, fair-value signals, replay metrics, and Strategy Lab results.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <HeaderMetric label="Store" value={status?.storeKind ?? "Unavailable"} />
              <HeaderMetric label="Checked" value={formatTime(status?.checkedAt ?? null)} />
              <Link className="border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300" href="/">
                Terminal
              </Link>
            </div>
          </div>
        </header>

        {state.error ? <ErrorBanner message={state.error} /> : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="store-status">
          <Panel title="Store Status">
            <Metric label="db path" value={status?.dbPath ?? "Unavailable"} />
            <Metric label="candles" value={formatNumber(status?.counts.underlying_candles)} />
            <Metric label="market snapshots" value={formatNumber(status?.counts.market_snapshots)} />
            <Metric label="fair value signals" value={formatNumber(status?.counts.fair_value_signals)} />
            <Metric label="replay results" value={formatNumber(status?.counts.replay_results)} />
            <Metric label="short-window signals" value={formatNumber(status?.counts.short_window_signals)} />
            <Metric label="short-window replay" value={formatNumber(status?.counts.short_window_replay_results)} />
            <Metric label="strategy lab results" value={formatNumber(status?.counts.strategy_lab_results)} />
          </Panel>
          <Panel title="Latest timestamps">
            <Metric label="latest candle close" value={formatTime(latest?.latestCandleCloseAt ?? null)} />
            <Metric label="latest capture run" value={formatTime(latest?.latestCaptureRunAt ?? null)} />
          </Panel>
          <Panel title="Latest Binance Candle">
            <Metric label="latest candle close" value={formatTime(latest?.latestCandleCloseAt ?? null)} />
            <Metric label="coverage source" value="underlying_candles" />
          </Panel>
          <Panel title="Latest Polymarket Snapshot">
            <Metric label="latest snapshot" value={formatTime(latest?.latestMarketSnapshotAt ?? null)} />
            <Metric label="source" value="public odds snapshots" />
          </Panel>
          <Panel title="Latest Fair Value Signal">
            <Metric label="latest signal" value={formatTime(latest?.latestFairValueSignalAt ?? null)} />
            <Metric label="mode" value="research snapshots" />
          </Panel>
          <Panel title="Latest Replay Metrics">
            <Metric label="latest replay" value={formatTime(latest?.latestReplayMetricsAt ?? null)} />
            <Metric label="stored samples" value={formatNumber(status?.counts.replay_results)} />
          </Panel>
          <Panel title="Latest Short-Window Signal">
            <Metric label="latest signal" value={formatTime(latest?.latestShortWindowSignalAt ?? null)} />
            <Metric label="stored samples" value={formatNumber(status?.counts.short_window_signals)} />
          </Panel>
          <Panel title="Latest Short-Window Replay">
            <Metric label="latest replay" value={formatTime(latest?.latestShortWindowReplayAt ?? null)} />
            <Metric label="stored samples" value={formatNumber(status?.counts.short_window_replay_results)} />
          </Panel>
          <Panel title="Latest Strategy Lab Result">
            <Metric label="latest lab" value={formatTime(latest?.latestStrategyLabResultAt ?? null)} />
            <Metric label="stored reports" value={formatNumber(status?.counts.strategy_lab_results)} />
          </Panel>
        </section>

        <section className="border border-slate-800 bg-[#0b111d] p-4" data-testid="data-coverage">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Data Coverage</h2>
              <p className="mt-1 text-xs text-slate-500">Recent local sample counts by research window.</p>
            </div>
            <code className="border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-cyan-100">pnpm capture:once</code>
          </div>
          <CoverageTable rows={status?.coverage ?? []} />
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="border border-slate-800 bg-[#0b111d] p-4" data-testid="capture-runs">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-100">Capture Runs</h2>
              <span className="text-xs text-slate-500">Rows {state.runs.length}</span>
            </div>
            <CaptureRunsTable runs={state.runs} />
          </section>
          <aside className="grid content-start gap-3">
            <Panel title="Manual Capture">
              <Metric label="browser POST" value="Use API or CLI" />
              <code className="block break-all border border-slate-800 bg-slate-950 p-2 text-xs text-cyan-100">
                curl -X POST {apiBaseUrl}/capture/run
              </code>
            </Panel>
            <Panel title="Errors / warnings">
              <ReasonBlock run={status?.latestCaptureRun ?? null} />
            </Panel>
          </aside>
        </section>
      </section>
    </main>
  );
}

async function loadDataStore(): Promise<LoadState> {
  try {
    const [statusResponse, runsResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/store/status`, { cache: "no-store" }),
      fetch(`${apiBaseUrl}/capture/runs?limit=20`, { cache: "no-store" })
    ]);
    if (!statusResponse.ok) {
      return { runs: [], error: await apiErrorMessage(statusResponse) };
    }
    const status = (await statusResponse.json()) as StoreStatusPayload;
    const runs = runsResponse.ok ? ((await runsResponse.json()) as { runs: CaptureRun[] }).runs : [];
    return { status, runs };
  } catch (error) {
    return { runs: [], error: error instanceof Error ? error.message : "Research Data Store API request failed." };
  }
}

function CoverageTable({ rows }: { rows: StoreStatusPayload["coverage"] }) {
  if (!rows.length) {
    return <div className="mt-3 border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">No local coverage rows available.</div>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead className="text-slate-500">
          <tr className="border-b border-slate-800">
            <Th>Window</Th>
            <Th>Candles</Th>
            <Th>Market snapshots</Th>
            <Th>Fair value</Th>
            <Th>Replay</Th>
            <Th>Strategy Lab</Th>
            <Th>Since</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b border-slate-900 text-slate-300" key={row.window}>
              <Td>{row.window}</Td>
              <Td>{formatNumber(row.candleCount)}</Td>
              <Td>{formatNumber(row.marketSnapshotCount)}</Td>
              <Td>{formatNumber(row.fairValueSignalCount)}</Td>
              <Td>{formatNumber(row.replayResultCount)}</Td>
              <Td>{formatNumber(row.strategyLabResultCount)}</Td>
              <Td>{formatTime(row.since)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CaptureRunsTable({ runs }: { runs: CaptureRun[] }) {
  if (!runs.length) {
    return <div className="mt-3 border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">No capture runs recorded.</div>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead className="text-slate-500">
          <tr className="border-b border-slate-800">
            <Th>Job</Th>
            <Th>Status</Th>
            <Th>Source</Th>
            <Th>Inserted</Th>
            <Th>Skipped</Th>
            <Th>Finished</Th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run, index) => (
            <tr className="border-b border-slate-900 text-slate-300" key={`${run.jobName}-${run.startedAt}-${index}`}>
              <Td>{run.jobName}</Td>
              <Td>{run.status}</Td>
              <Td>{run.sourceType}</Td>
              <Td>{formatNumber(run.recordsInserted)}</Td>
              <Td>{formatNumber(run.recordsSkipped)}</Td>
              <Td>{formatTime(run.finishedAt)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReasonBlock({ run }: { run: CaptureRun | null }) {
  const warnings = parseWarnings(run?.warningsJson);
  if (!run) {
    return <div className="text-xs text-slate-500">No capture run recorded.</div>;
  }
  return (
    <div className="grid gap-2 text-xs text-slate-300">
      <Metric label="latest job" value={run.jobName} />
      <Metric label="status" value={run.status} />
      {run.errorMessage ? <div className="text-rose-200">{run.errorMessage}</div> : null}
      {warnings.length ? (
        <ul className="grid gap-1 text-amber-100">
          {warnings.slice(0, 6).map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : (
        <div className="text-slate-500">No warnings.</div>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-slate-800 bg-[#0b111d] p-4">
      <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      <div className="mt-3 grid gap-2 text-xs">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border border-slate-800 bg-slate-950 p-2">
      <span className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="break-words font-semibold text-slate-200">{value}</span>
    </div>
  );
}

function Badge({ children }: { children: string }) {
  return <span className="border border-cyan-400/50 bg-cyan-400/10 px-2 py-1 text-[11px] font-semibold tracking-[0.08em] text-cyan-100">{children}</span>;
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-10 border border-slate-800 bg-slate-950 px-3 py-1.5">
      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-0.5 whitespace-nowrap text-xs font-semibold text-slate-200">{value}</div>
    </div>
  );
}

function Th({ children }: { children: string }) {
  return <th className="px-2 py-2">{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td className="px-2 py-2">{children}</td>;
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-100">{message}</div>;
}

function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "0" : value.toLocaleString("en-US");
}

function formatTime(value: string | null) {
  if (!value) {
    return "Unavailable";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toISOString().slice(0, 16).replace("T", " ");
}

function parseWarnings(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
