import type { CaptureRunRecord, InsertSummary, ResearchDataStore } from "../store/index.js";
import { createResearchDataStore } from "../store/index.js";
import { runBinanceCandlesCaptureJob } from "./binance-candles-job.js";
import { runFairValueSignalsCaptureJob } from "./fair-value-signals-job.js";
import { runPolymarketMarketsCaptureJob } from "./polymarket-markets-job.js";
import { runReplayMetricsCaptureJob } from "./replay-metrics-job.js";
import { runStrategyLabCaptureJob } from "./strategy-lab-job.js";
import type { CaptureJobContext, CaptureJobName, CaptureJobResult } from "./types.js";
import { mergeSummaries, recordCaptureJobRun, shouldUseMockCapture } from "./types.js";

export type CaptureRunMode = "once" | "snapshot" | CaptureJobName;

export type CaptureScheduleConfig = {
  "binance-candles": number;
  "polymarket-markets": number;
  "fair-value-signals": number;
  "replay-metrics": number;
  "strategy-lab": number;
};

export const DEFAULT_CAPTURE_SCHEDULE_MS: CaptureScheduleConfig = {
  "binance-candles": 60_000,
  "polymarket-markets": 5 * 60_000,
  "fair-value-signals": 60_000,
  "replay-metrics": 15 * 60_000,
  "strategy-lab": 60 * 60_000
};

export async function runCaptureOnce(context: CaptureJobContext): Promise<CaptureJobResult[]> {
  const startedAt = context.now?.() ?? new Date().toISOString();
  const results = [
    await runBinanceCandlesCaptureJob(context),
    await runPolymarketMarketsCaptureJob(context),
    await runFairValueSignalsCaptureJob(context),
    await runReplayMetricsCaptureJob(context),
    await runStrategyLabCaptureJob(context)
  ];
  const summary = mergeSummaries(results.map(resultToSummary));
  const aggregate = await recordCaptureJobRun({
    store: context.store,
    jobName: "capture-once",
    startedAt,
    sourceType: shouldUseMockCapture(context) ? "mock" : "live",
    summary,
    warnings: results.flatMap((result) => result.warnings),
    errorMessage: results.every((result) => result.status === "failed") ? "Every capture job failed." : null,
    status: results.some((result) => result.status === "failed" || result.status === "partial")
      ? results.some((result) => result.recordsInserted > 0 || result.recordsUpdated > 0)
        ? "partial"
        : "failed"
      : "success",
    now: context.now
  });
  return [...results, aggregate];
}

export async function runSnapshotCaptureOnce(context: CaptureJobContext): Promise<CaptureJobResult[]> {
  const startedAt = context.now?.() ?? new Date().toISOString();
  const results = [
    await runBinanceCandlesCaptureJob(context),
    await runPolymarketMarketsCaptureJob(context),
    await runFairValueSignalsCaptureJob(context)
  ];
  const summary = mergeSummaries(results.map(resultToSummary));
  const aggregate = await recordCaptureJobRun({
    store: context.store,
    jobName: "snapshot-once",
    startedAt,
    sourceType: shouldUseMockCapture(context) ? "mock" : "live",
    summary,
    warnings: results.flatMap((result) => result.warnings),
    errorMessage: results.every((result) => result.status === "failed") ? "Every snapshot capture job failed." : null,
    status: results.some((result) => result.status === "failed" || result.status === "partial")
      ? results.some((result) => result.recordsInserted > 0 || result.recordsUpdated > 0)
        ? "partial"
        : "failed"
      : "success",
    now: context.now
  });
  return [...results, aggregate];
}

export async function runCaptureJobByName(context: CaptureJobContext, jobName: CaptureRunMode): Promise<CaptureJobResult[]> {
  if (jobName === "once" || jobName === "capture-once") {
    return runCaptureOnce(context);
  }
  if (jobName === "snapshot" || jobName === "snapshot-once") {
    return runSnapshotCaptureOnce(context);
  }
  const result = await jobRunner(jobName)(context);
  return [result];
}

export function createCaptureScheduler(input: {
  store?: ResearchDataStore | undefined;
  scheduleMs?: Partial<CaptureScheduleConfig> | undefined;
  now?: (() => string) | undefined;
  enabled?: boolean | undefined;
} = {}) {
  const store = input.store ?? createResearchDataStore();
  const schedule = { ...DEFAULT_CAPTURE_SCHEDULE_MS, ...input.scheduleMs };
  const now = input.now ?? (() => new Date().toISOString());
  const lastRun = new Map<CaptureJobName, number>();
  let timer: NodeJS.Timeout | null = null;

  async function runDueJobs(): Promise<CaptureJobResult[]> {
    const current = Date.parse(now());
    const results: CaptureJobResult[] = [];
    for (const jobName of Object.keys(schedule) as Array<Exclude<CaptureJobName, "capture-once" | "snapshot-once">>) {
      const previous = lastRun.get(jobName) ?? 0;
      if (current - previous >= schedule[jobName]) {
        lastRun.set(jobName, current);
        results.push(...await runCaptureJobByName({ store, now }, jobName));
      }
    }
    return results;
  }

  return {
    store,
    schedule,
    runDueJobs,
    start(intervalMs = 1_000): void {
      if (timer || input.enabled !== true) {
        return;
      }
      timer = setInterval(() => {
        void runDueJobs();
      }, intervalMs);
    },
    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
  };
}

export function captureRunRecordFromResult(result: CaptureJobResult): CaptureRunRecord {
  return {
    jobName: result.jobName,
    status: result.status,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.durationMs,
    sourceType: result.sourceType,
    recordsInserted: result.recordsInserted,
    recordsUpdated: result.recordsUpdated,
    recordsSkipped: result.recordsSkipped,
    errorMessage: result.errorMessage,
    warningsJson: JSON.stringify(result.warnings)
  };
}

function jobRunner(jobName: Exclude<CaptureJobName, "capture-once" | "snapshot-once">) {
  switch (jobName) {
    case "binance-candles":
      return runBinanceCandlesCaptureJob;
    case "polymarket-markets":
      return runPolymarketMarketsCaptureJob;
    case "fair-value-signals":
      return runFairValueSignalsCaptureJob;
    case "replay-metrics":
      return runReplayMetricsCaptureJob;
    case "strategy-lab":
      return runStrategyLabCaptureJob;
  }
}

function resultToSummary(result: CaptureJobResult): InsertSummary {
  return {
    recordsInserted: result.recordsInserted,
    recordsUpdated: result.recordsUpdated,
    recordsSkipped: result.recordsSkipped
  };
}
