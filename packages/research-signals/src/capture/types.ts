import type { DataSourceType } from "@ept/shared-types";
import type { FetchLike } from "../ohlcv/types.js";
import type { CaptureRunRecord, CaptureRunStatus, InsertSummary, ResearchDataStore } from "../store/index.js";

export type CaptureJobName =
  | "binance-candles"
  | "polymarket-markets"
  | "fair-value-signals"
  | "replay-metrics"
  | "strategy-lab"
  | "snapshot-once"
  | "capture-once";

export type CaptureJobContext = {
  store: ResearchDataStore;
  now?: (() => string) | undefined;
  fetcher?: FetchLike | undefined;
  timeoutMs?: number | undefined;
  useMock?: boolean | undefined;
  binanceLookbackMs?: number | undefined;
  binanceMaxPages?: number | undefined;
};

export type CaptureJobResult = {
  jobName: CaptureJobName;
  status: CaptureRunStatus;
  sourceType: DataSourceType;
  recordsInserted: number;
  recordsUpdated: number;
  recordsSkipped: number;
  warnings: string[];
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
};

export function shouldUseMockCapture(input: { useMock?: boolean | undefined } = {}): boolean {
  return input.useMock === true || process.env.EPT_LIVE_MARKET_DATA_MOCK === "true";
}

export function shouldRunFullLiveReplayCapture(): boolean {
  return process.env.EPT_CAPTURE_FULL_LIVE_REPLAY === "true";
}

export function shouldRunFullLiveStrategyLabCapture(): boolean {
  return process.env.EPT_CAPTURE_FULL_LIVE_STRATEGY_LAB === "true";
}

export function emptySummary(): InsertSummary {
  return { recordsInserted: 0, recordsUpdated: 0, recordsSkipped: 0 };
}

export function mergeSummaries(summaries: InsertSummary[]): InsertSummary {
  return summaries.reduce(
    (total, item) => ({
      recordsInserted: total.recordsInserted + item.recordsInserted,
      recordsUpdated: total.recordsUpdated + item.recordsUpdated,
      recordsSkipped: total.recordsSkipped + item.recordsSkipped
    }),
    emptySummary()
  );
}

export async function recordCaptureJobRun(input: {
  store: ResearchDataStore;
  jobName: CaptureJobName;
  startedAt: string;
  sourceType: DataSourceType;
  summary: InsertSummary;
  warnings?: string[] | undefined;
  errorMessage?: string | null | undefined;
  status?: CaptureRunStatus | undefined;
  now?: (() => string) | undefined;
}): Promise<CaptureJobResult> {
  const finishedAt = input.now?.() ?? new Date().toISOString();
  const status = input.status ?? statusFrom(input.summary, input.warnings ?? [], input.errorMessage ?? null);
  const run: CaptureRunRecord = {
    jobName: input.jobName,
    status,
    startedAt: input.startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(input.startedAt)),
    sourceType: input.sourceType,
    recordsInserted: input.summary.recordsInserted,
    recordsUpdated: input.summary.recordsUpdated,
    recordsSkipped: input.summary.recordsSkipped,
    errorMessage: input.errorMessage ?? null,
    warningsJson: JSON.stringify(input.warnings ?? [])
  };
  await input.store.recordCaptureRun(run);
  return {
    jobName: input.jobName,
    status,
    sourceType: input.sourceType,
    recordsInserted: input.summary.recordsInserted,
    recordsUpdated: input.summary.recordsUpdated,
    recordsSkipped: input.summary.recordsSkipped,
    warnings: input.warnings ?? [],
    errorMessage: input.errorMessage ?? null,
    startedAt: input.startedAt,
    finishedAt,
    durationMs: run.durationMs
  };
}

function statusFrom(summary: InsertSummary, warnings: string[], errorMessage: string | null): CaptureRunStatus {
  if (errorMessage) {
    return summary.recordsInserted > 0 || summary.recordsUpdated > 0 ? "partial" : "failed";
  }
  if (warnings.some((warning) => /failed|fail|unavailable|timed out|insufficient/i.test(warning))) {
    return "partial";
  }
  return "success";
}
