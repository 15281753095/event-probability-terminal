import type { SignalSymbol } from "@ept/shared-types";
import { runSignalReplay } from "../replay/runner.js";
import { replayResultRecordFromResponse, type CoverageWindowId } from "../store/index.js";
import type { CaptureJobContext, CaptureJobResult } from "./types.js";
import { mergeSummaries, recordCaptureJobRun, shouldRunFullLiveReplayCapture, shouldUseMockCapture } from "./types.js";

const symbols: Array<SignalSymbol | "ALL"> = ["BTC", "ETH", "ALL"];
const windows: CoverageWindowId[] = ["1d", "3d", "1w", "1m"];

export async function runReplayMetricsCaptureJob(context: CaptureJobContext): Promise<CaptureJobResult> {
  await context.store.init();
  const startedAt = context.now?.() ?? new Date().toISOString();
  const useMock = shouldUseMockCapture(context);
  const runFullLiveReplay = shouldRunFullLiveReplayCapture();
  const sourceType = useMock ? "mock" : "live";
  const warnings: string[] = [];
  const summaries = [];
  let failureCount = 0;
  for (const symbol of symbols) {
    for (const window of windows) {
      try {
        if (!useMock && !runFullLiveReplay) {
          const record = emptyLiveReplayRecord({
            symbol,
            window,
            checkedAt: startedAt,
            warnings: [
              "LIVE_REPLAY_CAPTURE_DEFERRED",
              "Default live capture stores a fail-closed replay summary without running expensive historical replay; set EPT_CAPTURE_FULL_LIVE_REPLAY=true for full live replay.",
              "No completed samples were fabricated."
            ]
          });
          warnings.push(...parseWarnings(record.warningsJson));
          summaries.push(await context.store.insertReplayResult(record));
          continue;
        }
        const response = await runSignalReplay({
          symbol,
          window,
          interval: "1m",
          strategyId: "fair-value-v1",
          useMock,
          now: () => startedAt,
          ...(context.fetcher ? { fetcher: context.fetcher } : {}),
          ...(!useMock ? { timeoutMs: context.timeoutMs ?? 2_500 } : context.timeoutMs !== undefined ? { timeoutMs: context.timeoutMs } : {})
        });
        warnings.push(...response.warnings);
        summaries.push(await context.store.insertReplayResult(replayResultRecordFromResponse(response)));
      } catch (error) {
        failureCount += 1;
        warnings.push(error instanceof Error ? `Replay metrics capture failed for ${symbol}/${window}: ${error.message}` : `Replay metrics capture failed for ${symbol}/${window}.`);
      }
    }
  }
  const summary = mergeSummaries(summaries);
  return recordCaptureJobRun({
    store: context.store,
    jobName: "replay-metrics",
    startedAt,
    sourceType,
    summary,
    warnings,
    errorMessage: failureCount === symbols.length * windows.length ? "Replay metrics capture failed for every symbol/window." : null,
    status: failureCount > 0 ? (summary.recordsInserted > 0 ? "partial" : "failed") : undefined,
    now: context.now
  });
}

function emptyLiveReplayRecord(input: {
  symbol: SignalSymbol | "ALL";
  window: CoverageWindowId;
  checkedAt: string;
  warnings: string[];
}) {
  return {
    sourceType: "live" as const,
    symbol: input.symbol,
    window: input.window,
    strategyId: "fair-value-v1" as const,
    sampleCount: 0,
    actionableCount: 0,
    winCount: 0,
    lossCount: 0,
    pendingCount: 0,
    unresolvedCount: 0,
    rejectedCount: 0,
    noSignalCount: 0,
    winRate: null,
    coverageRate: null,
    rejectionRate: null,
    averageEdge: null,
    averageConfidence: null,
    theoreticalPnl: null,
    maxDrawdown: null,
    warningsJson: JSON.stringify(input.warnings),
    checkedAt: input.checkedAt,
    payloadJson: null
  };
}

function parseWarnings(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}
