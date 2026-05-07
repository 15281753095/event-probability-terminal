import type { SignalReplayResponse, SignalSymbol, StrategyLabReport } from "@ept/shared-types";
import { runSignalReplay } from "../replay/runner.js";
import { buildFairValueV1ParameterGrid } from "../strategy-lab/parameter-grid.js";
import { rankStrategyParameterResults } from "../strategy-lab/ranking.js";
import { runParameterSweep } from "../strategy-lab/sweep-runner.js";
import { runWalkForwardValidation } from "../strategy-lab/walk-forward.js";
import { strategyLabResultRecordFromReport, type CoverageWindowId } from "../store/index.js";
import type { CaptureJobContext, CaptureJobResult } from "./types.js";
import { mergeSummaries, recordCaptureJobRun, shouldRunFullLiveStrategyLabCapture, shouldUseMockCapture } from "./types.js";

const symbols: SignalSymbol[] = ["BTC", "ETH"];
const windows: CoverageWindowId[] = ["1w", "1m"];

export async function runStrategyLabCaptureJob(context: CaptureJobContext): Promise<CaptureJobResult> {
  await context.store.init();
  const startedAt = context.now?.() ?? new Date().toISOString();
  const useMock = shouldUseMockCapture(context);
  const runFullLiveStrategyLab = shouldRunFullLiveStrategyLabCapture();
  const sourceType = useMock ? "mock" : "live";
  const warnings: string[] = [];
  const summaries = [];
  let failureCount = 0;
  for (const symbol of symbols) {
    for (const window of windows) {
      try {
        if (!useMock && !runFullLiveStrategyLab) {
          const record = emptyLiveStrategyLabRecord({
            symbol,
            window,
            checkedAt: startedAt,
            warnings: [
              "LIVE_STRATEGY_LAB_CAPTURE_DEFERRED",
              "Default live capture fail-closed skips expensive Strategy Lab sweep; set EPT_CAPTURE_FULL_LIVE_STRATEGY_LAB=true for full live Strategy Lab capture.",
              "No top candidates were fabricated."
            ]
          });
          warnings.push(...parseWarnings(record.warningsJson));
          summaries.push(await context.store.insertStrategyLabResult(record));
          continue;
        }
        if (!useMock) {
          const replay = await context.store.getLatestReplayResult({ symbol, window, strategyId: "fair-value-v1" });
          if (!replay || replay.record.sampleCount < 3) {
            const record = emptyLiveStrategyLabRecord({
              symbol,
              window,
              checkedAt: startedAt,
              warnings: [
                "STORED_REPLAY_COVERAGE_INSUFFICIENT",
                "Strategy Lab live capture skipped expensive sweep because stored completed replay samples are below minSampleCount.",
                "No top candidates were fabricated."
              ]
            });
            warnings.push(...parseWarnings(record.warningsJson));
            summaries.push(await context.store.insertStrategyLabResult(record));
            continue;
          }
        }
        const report = await buildStrategyLabReport({ context, symbol, window, checkedAt: startedAt, useMock });
        warnings.push(...report.warnings);
        summaries.push(await context.store.insertStrategyLabResult(strategyLabResultRecordFromReport(report)));
      } catch (error) {
        failureCount += 1;
        warnings.push(error instanceof Error ? `Strategy Lab capture failed for ${symbol}/${window}: ${error.message}` : `Strategy Lab capture failed for ${symbol}/${window}.`);
      }
    }
  }
  const summary = mergeSummaries(summaries);
  return recordCaptureJobRun({
    store: context.store,
    jobName: "strategy-lab",
    startedAt,
    sourceType,
    summary,
    warnings,
    errorMessage: failureCount === symbols.length * windows.length ? "Strategy Lab capture failed for every symbol/window." : null,
    status: failureCount > 0 ? (summary.recordsInserted > 0 ? "partial" : "failed") : undefined,
    now: context.now
  });
}

function emptyLiveStrategyLabRecord(input: {
  symbol: SignalSymbol;
  window: CoverageWindowId;
  checkedAt: string;
  warnings: string[];
}) {
  return {
    sourceType: "live" as const,
    symbol: input.symbol,
    window: input.window,
    strategyId: "fair-value-v1" as const,
    parameterSetJson: JSON.stringify({ summary: "NO_LIVE_STRATEGY_LAB_CANDIDATE" }),
    score: null,
    winRate: null,
    actionableCount: 0,
    theoreticalPnl: null,
    maxDrawdown: null,
    overfitRisk: "unknown" as const,
    consistencyScore: null,
    warningsJson: JSON.stringify(input.warnings),
    checkedAt: input.checkedAt,
    payloadJson: null
  };
}

async function buildStrategyLabReport(input: {
  context: CaptureJobContext;
  symbol: SignalSymbol;
  window: CoverageWindowId;
  checkedAt: string;
  useMock: boolean;
}): Promise<StrategyLabReport> {
  const grid = buildFairValueV1ParameterGrid({ maxCombinations: 20 });
  const replayRunner = (replayInput: Parameters<typeof runSignalReplay>[0]): Promise<SignalReplayResponse> =>
    runSignalReplay({
      ...replayInput,
      useMock: input.useMock,
      now: () => input.checkedAt,
      ...(input.context.fetcher ? { fetcher: input.context.fetcher } : {}),
      ...(input.context.timeoutMs !== undefined ? { timeoutMs: input.context.timeoutMs } : {})
    });
  const sweep = await runParameterSweep({
    symbol: input.symbol,
    window: input.window,
    strategyId: "fair-value-v1",
    parameterGrid: grid.parameterGrid,
    maxCombinations: 20,
    useMock: input.useMock,
    now: () => input.checkedAt,
    replayRunner
  });
  const walkForward = await runWalkForwardValidation({
    symbol: input.symbol,
    totalWindow: input.window,
    strategyId: "fair-value-v1",
    candidateParameterSets: sweep.topCandidates.length
      ? sweep.topCandidates.slice(0, 6).map((result) => result.parameterSet)
      : input.useMock
        ? sweep.parameterResults.slice(0, 6).map((result) => result.parameterSet)
        : [],
    useMock: input.useMock,
    now: () => input.checkedAt,
    replayRunner
  });
  const finalRanking = rankStrategyParameterResults({
    results: sweep.parameterResults,
    walkForwardResults: walkForward.walkForwardResults
  });
  return {
    symbol: input.symbol,
    window: input.window,
    strategyId: "fair-value-v1",
    parameterResults: finalRanking.parameterResults,
    topCandidates: finalRanking.topCandidates,
    walkForwardResults: walkForward.walkForwardResults,
    rejectedParameterSets: finalRanking.rejectedParameterSets,
    warnings: unique([
      "Research only. Not trading advice. No automated trading action.",
      "Top candidates are research candidates, not production trading strategies.",
      ...grid.warnings,
      ...grid.rejectedValues.map((value) => `Rejected invalid parameter value: ${value}`),
      ...sweep.warnings,
      ...walkForward.warnings
    ]),
    sourceType: input.useMock ? "mock" : "live",
    isResearchOnly: true,
    checkedAt: input.checkedAt
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function parseWarnings(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}
