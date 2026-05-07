import type {
  ParameterSweepResult,
  ReplayMetrics,
  ReplayWindow,
  ReplayWindowId,
  SignalSymbol,
  StrategyLabStrategyId,
  StrategyParameterSet
} from "@ept/shared-types";
import { runSignalReplay } from "../replay/runner.js";
import type { RunSignalReplayInput } from "../replay/types.js";
import { normalizeMaxCombinations } from "./parameter-grid.js";
import {
  buildScoreBreakdown,
  estimateSweepOverfitRisk,
  rankStrategyParameterResults,
  warningsForMetrics
} from "./ranking.js";
import type { RunParameterSweepInput, RunParameterSweepOutput } from "./types.js";

export async function runParameterSweep(input: RunParameterSweepInput): Promise<RunParameterSweepOutput> {
  const checkedAt = input.now?.() ?? new Date().toISOString();
  const warnings: string[] = [
    "Research only. Not trading advice. No auto execution.",
    "Parameter sweep ranks research candidates only; it is not production approval."
  ];
  const maxCombinations = normalizeMaxCombinations(input.maxCombinations, warnings);
  const parameterGrid = input.parameterGrid.slice(0, maxCombinations);
  if (input.parameterGrid.length > parameterGrid.length) {
    warnings.push(`PARAMETER_GRID_TRUNCATED requested ${input.parameterGrid.length}; evaluated ${parameterGrid.length}.`);
  }

  const results = await mapWithConcurrency(parameterGrid, 5, (parameterSet) =>
    runReplayForParameter({
      symbol: input.symbol,
      window: input.window,
      strategyId: input.strategyId,
      parameterSet,
      useMock: input.useMock,
      now: input.now,
      replayRunner: input.replayRunner
    })
  );
  warnings.push(...results.flatMap((result) => result.warnings));

  const ranked = rankStrategyParameterResults({ results });
  return {
    request: {
      symbol: input.symbol,
      window: typeof input.window === "string" ? input.window : replayWindowIdForRequest(input.window),
      strategyId: input.strategyId,
      parameterGrid,
      mode: input.useMock ? "mock" : "live",
      maxCombinations,
      checkedAt
    },
    parameterResults: ranked.parameterResults,
    topCandidates: ranked.topCandidates,
    rejectedParameterSets: ranked.rejectedParameterSets,
    warnings: unique(warnings),
    isResearchOnly: true
  };
}

export async function runReplayForParameter(input: {
  symbol: SignalSymbol | "ALL";
  window: Exclude<ReplayWindowId, "custom"> | ReplayWindow;
  strategyId: StrategyLabStrategyId;
  parameterSet: StrategyParameterSet;
  useMock?: boolean | undefined;
  now?: (() => string) | undefined;
  replayRunner?: RunParameterSweepInput["replayRunner"] | undefined;
}): Promise<ParameterSweepResult> {
  const replayRunner = input.replayRunner ?? runSignalReplay;
  const replayInput: RunSignalReplayInput = {
    symbol: input.symbol,
    window: input.window,
    interval: input.parameterSet.interval,
    strategyId: input.strategyId,
    fairValueParameters: {
      minEdgeBps: input.parameterSet.minEdgeBps,
      maxSpread: input.parameterSet.maxSpread,
      volatilityLookbackCandles: input.parameterSet.volatilityLookbackCandles,
      minConfidence: input.parameterSet.minConfidence,
      feesBps: input.parameterSet.feesBps,
      slippageBps: input.parameterSet.slippageBps
    },
    ...(!input.useMock ? { timeoutMs: 2_500 } : {}),
    ...(input.useMock !== undefined ? { useMock: input.useMock } : {}),
    ...(input.now ? { now: input.now } : {})
  };
  const replay = await replayRunner(replayInput);
  const overfitRisk = estimateSweepOverfitRisk(replay.metrics, input.parameterSet.minSampleCount);
  const scoreBreakdown = buildScoreBreakdown(replay.metrics, overfitRisk, input.parameterSet.minSampleCount);
  const result: ParameterSweepResult = {
    parameterSet: input.parameterSet,
    metrics: replay.metrics,
    rank: 0,
    score: scoreBreakdown.total,
    scoreBreakdown,
    warnings: warningsForMetrics(replay.metrics, input.parameterSet.minSampleCount, overfitRisk),
    rejectionReasons: [],
    overfitRisk,
    sourceType: replay.sourceType,
    isResearchOnly: true
  };
  return {
    ...result,
    rejectionReasons: initialRejectionReasons(result)
  };
}

export function aggregateReplayMetrics(input: {
  symbol: SignalSymbol | "ALL";
  window: ReplayWindow;
  metrics: ReplayMetrics[];
  checkedAt: string;
  warnings?: string[] | undefined;
}): ReplayMetrics {
  const sampleCount = sum(input.metrics.map((metrics) => metrics.sampleCount));
  const winCount = sum(input.metrics.map((metrics) => metrics.winCount));
  const lossCount = sum(input.metrics.map((metrics) => metrics.lossCount));
  const actionableCount = sum(input.metrics.map((metrics) => metrics.actionableCount));
  const totalEvaluated = input.metrics.reduce((total, metrics) => total + approximateEvaluatedCount(metrics), 0);
  const finitePnl = input.metrics
    .map((metrics) => metrics.cumulativeTheoreticalPnl)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const finiteDrawdown = input.metrics
    .map((metrics) => metrics.maxDrawdown)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const warnings = unique([...(input.warnings ?? []), ...input.metrics.flatMap((metrics) => metrics.warnings)]);

  return {
    symbol: input.symbol,
    window: input.window,
    sampleCount,
    actionableCount,
    winCount,
    lossCount,
    pendingCount: sum(input.metrics.map((metrics) => metrics.pendingCount)),
    unresolvedCount: sum(input.metrics.map((metrics) => metrics.unresolvedCount)),
    rejectedCount: sum(input.metrics.map((metrics) => metrics.rejectedCount)),
    noSignalCount: sum(input.metrics.map((metrics) => metrics.noSignalCount)),
    winRate: ratio(winCount, winCount + lossCount),
    longYesCount: sum(input.metrics.map((metrics) => metrics.longYesCount)),
    longYesWinRate: weightedWinRate(input.metrics, "longYes"),
    longNoCount: sum(input.metrics.map((metrics) => metrics.longNoCount)),
    longNoWinRate: weightedWinRate(input.metrics, "longNo"),
    coverageRate: ratio(actionableCount, totalEvaluated),
    rejectionRate: ratio(sum(input.metrics.map((metrics) => metrics.rejectedCount)), totalEvaluated),
    pendingRate: ratio(sum(input.metrics.map((metrics) => metrics.pendingCount)), totalEvaluated),
    averageEdge: weightedAverage(input.metrics.map((metrics) => [metrics.averageEdge, metrics.actionableCount])),
    averageConfidence: weightedAverage(input.metrics.map((metrics) => [metrics.averageConfidence, metrics.actionableCount])),
    averageTheoreticalPnl: finitePnl.length ? round(sum(finitePnl) / finitePnl.length) : null,
    cumulativeTheoreticalPnl: finitePnl.length ? round(sum(finitePnl)) : null,
    maxDrawdown: finiteDrawdown.length ? round(Math.max(...finiteDrawdown)) : null,
    warnings,
    isResearchOnly: true,
    checkedAt: input.checkedAt
  };
}

function initialRejectionReasons(result: ParameterSweepResult): string[] {
  const reasons: string[] = [];
  if (result.metrics.winRate === null) {
    reasons.push("NULL_WIN_RATE");
  }
  if (result.metrics.actionableCount < result.parameterSet.minSampleCount) {
    reasons.push("ACTIONABLE_COUNT_BELOW_MIN_SAMPLE");
  }
  if ((result.metrics.cumulativeTheoreticalPnl ?? 0) < 0) {
    reasons.push("NEGATIVE_THEORETICAL_PNL");
  }
  if (result.overfitRisk === "high") {
    reasons.push("HIGH_OVERFIT_RISK");
  }
  return unique(reasons);
}

async function mapWithConcurrency<T, U>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<U>
): Promise<U[]> {
  const results: U[] = [];
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const value = values[index];
      if (value === undefined) {
        return;
      }
      results[index] = await mapper(value);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

function replayWindowIdForRequest(window: ReplayWindow): Exclude<ReplayWindowId, "custom"> {
  return window.id === "1d" || window.id === "3d" || window.id === "1w" || window.id === "1m" ? window.id : "1w";
}

function approximateEvaluatedCount(metrics: ReplayMetrics): number {
  return metrics.sampleCount + metrics.pendingCount + metrics.unresolvedCount + metrics.rejectedCount + metrics.noSignalCount;
}

function weightedWinRate(metrics: ReplayMetrics[], side: "longYes" | "longNo"): number | null {
  const wins = side === "longYes"
    ? sum(metrics.map((item) => Math.round((item.longYesWinRate ?? 0) * item.longYesCount)))
    : sum(metrics.map((item) => Math.round((item.longNoWinRate ?? 0) * item.longNoCount)));
  const count = side === "longYes"
    ? sum(metrics.map((item) => item.longYesCount))
    : sum(metrics.map((item) => item.longNoCount));
  return ratio(wins, count);
}

function weightedAverage(values: Array<[number | null, number]>): number | null {
  const finite = values.filter((value): value is [number, number] => value[0] !== null && Number.isFinite(value[0]) && value[1] > 0);
  const weight = sum(finite.map(([, count]) => count));
  return weight > 0 ? round(finite.reduce((total, [value, count]) => total + value * count, 0) / weight) : null;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round(numerator / denominator) : null;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
