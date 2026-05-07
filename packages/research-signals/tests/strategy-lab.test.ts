import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ParameterSweepResult,
  ReplayMetrics,
  ReplayWindow,
  StrategyParameterSet,
  WalkForwardResult
} from "@ept/shared-types";
import {
  buildFairValueV1ParameterGrid,
  rankStrategyParameterResults,
  resolveReplayWindow,
  runParameterSweep,
  runWalkForwardValidation,
  type RunSignalReplayInput
} from "../src/index.js";

const checkedAt = "2026-05-06T00:00:00.000Z";

describe("strategy lab parameter grid", () => {
  it("builds the default fair-value-v1 grid and applies maxCombinations", () => {
    const grid = buildFairValueV1ParameterGrid();

    assert.equal(grid.parameterGrid.length, 50);
    assert.equal(grid.requestedCombinationCount, 432);
    assert.ok(grid.warnings.some((warning) => warning.includes("PARAMETER_GRID_TRUNCATED")));
    assert.equal(grid.parameterGrid.every((parameterSet) => parameterSet.strategyId === "fair-value-v1"), true);
    assert.equal(grid.parameterGrid.every((parameterSet) => parameterSet.isResearchOnly), true);
  });

  it("caps maxCombinations at the hard limit", () => {
    const grid = buildFairValueV1ParameterGrid({ maxCombinations: 500 });

    assert.equal(grid.maxCombinations, 100);
    assert.equal(grid.parameterGrid.length, 100);
    assert.ok(grid.warnings.some((warning) => warning.includes("capped at 100")));
  });

  it("rejects invalid values without expanding the grid", () => {
    const grid = buildFairValueV1ParameterGrid({
      intervals: ["5m", "bad" as "5m"],
      minEdgeBps: [200, -1],
      maxSpread: [0.1, 2],
      volatilityLookbackCandles: [20, 2],
      minConfidence: [0.2, 2],
      maxCombinations: 10
    });

    assert.ok(grid.rejectedValues.includes("interval=bad"));
    assert.ok(grid.rejectedValues.includes("minEdgeBps=-1"));
    assert.ok(grid.rejectedValues.includes("maxSpread=2"));
    assert.ok(grid.rejectedValues.includes("volatilityLookbackCandles=2"));
    assert.ok(grid.rejectedValues.includes("minConfidence=2"));
    assert.ok(grid.warnings.includes("INVALID_PARAMETER_VALUES_REJECTED"));
    assert.ok(grid.parameterGrid.length <= 10);
  });
});

describe("strategy lab parameter sweep", () => {
  it("calls replay metrics for each parameter set and ranks with non-winRate penalties", async () => {
    const calls: RunSignalReplayInput[] = [];
    const parameters = [
      parameterSet("high-win-low-sample", { minEdgeBps: 800, minSampleCount: 3 }),
      parameterSet("stable", { minEdgeBps: 200, minSampleCount: 3 })
    ];
    const sweep = await runParameterSweep({
      symbol: "BTC",
      window: "1w",
      strategyId: "fair-value-v1",
      parameterGrid: parameters,
      maxCombinations: 2,
      useMock: true,
      now: () => checkedAt,
      replayRunner: async (input) => {
        calls.push(input);
        const id = parameters.find((item) => item.interval === input.interval && item.minEdgeBps === input.fairValueParameters?.minEdgeBps)?.id;
        return {
          metrics: id === "high-win-low-sample"
            ? metrics({ sampleCount: 1, actionableCount: 1, winRate: 1, winCount: 1, lossCount: 0, pnl: 0.1, coverageRate: 0.2 })
            : metrics({ sampleCount: 8, actionableCount: 8, winRate: 0.625, winCount: 5, lossCount: 3, pnl: 1.2, coverageRate: 0.9 }),
          sourceType: "mock",
          warnings: [],
          isResearchOnly: true
        };
      }
    });

    assert.equal(calls.length, 2);
    assert.equal(sweep.parameterResults[0]?.parameterSet.id, "stable");
    assert.ok((sweep.parameterResults.find((result) => result.parameterSet.id === "high-win-low-sample")?.score ?? 0) < (sweep.parameterResults.find((result) => result.parameterSet.id === "stable")?.score ?? 0));
  });

  it("rejects null winRate, negative pnl, high overfit, and low sample top candidates", async () => {
    const parameters = [
      parameterSet("null-win", { minEdgeBps: 200 }),
      parameterSet("negative-pnl", { minEdgeBps: 500 }),
      parameterSet("high-overfit", { minEdgeBps: 800, minSampleCount: 10 }),
      parameterSet("candidate", { minEdgeBps: 250 })
    ];
    const sweep = await runParameterSweep({
      symbol: "BTC",
      window: "1w",
      strategyId: "fair-value-v1",
      parameterGrid: parameters,
      maxCombinations: 4,
      useMock: true,
      now: () => checkedAt,
      replayRunner: async (input) => {
        const id = parameters.find((item) => item.minEdgeBps === input.fairValueParameters?.minEdgeBps)?.id;
        if (id === "null-win") {
          return replay(metrics({ sampleCount: 0, actionableCount: 0, winRate: null, winCount: 0, lossCount: 0, pnl: null }));
        }
        if (id === "negative-pnl") {
          return replay(metrics({ sampleCount: 8, actionableCount: 8, winRate: 0.75, winCount: 6, lossCount: 2, pnl: -0.2 }));
        }
        if (id === "high-overfit") {
          return replay(metrics({ sampleCount: 3, actionableCount: 3, winRate: 1, winCount: 3, lossCount: 0, pnl: 0.4 }));
        }
        return replay(metrics({ sampleCount: 8, actionableCount: 8, winRate: 0.625, winCount: 5, lossCount: 3, pnl: 1 }));
      }
    });

    assert.ok(sweep.topCandidates.every((result) => result.metrics.winRate !== null));
    assert.ok(sweep.topCandidates.every((result) => (result.metrics.cumulativeTheoreticalPnl ?? 0) >= 0));
    assert.ok(sweep.topCandidates.every((result) => result.overfitRisk !== "high"));
    assert.equal(sweep.topCandidates.some((result) => result.parameterSet.id === "candidate"), true);
    assert.equal(sweep.rejectedParameterSets.some((result) => result.rejectionReasons.includes("NULL_WIN_RATE")), true);
    assert.equal(sweep.rejectedParameterSets.some((result) => result.rejectionReasons.includes("NEGATIVE_THEORETICAL_PNL")), true);
    assert.equal(sweep.rejectedParameterSets.some((result) => result.rejectionReasons.includes("HIGH_OVERFIT_RISK")), true);
  });
});

describe("strategy lab walk-forward validation", () => {
  it("uses non-overlapping train/test windows and does not use test data for selection", async () => {
    const selectedByTrain = parameterSet("selected-by-train", { minEdgeBps: 200, minSampleCount: 1 });
    const bestOnlyInTest = parameterSet("best-only-in-test", { minEdgeBps: 500, minSampleCount: 1 });
    const observedWindows: ReplayWindow[] = [];
    const result = await runWalkForwardValidation({
      symbol: "BTC",
      totalWindow: "1w",
      strategyId: "fair-value-v1",
      candidateParameterSets: [selectedByTrain, bestOnlyInTest],
      useMock: true,
      now: () => checkedAt,
      replayRunner: async (input) => {
        observedWindows.push(input.window as ReplayWindow);
        const isTrain = typeof input.window !== "string" && input.window.label.includes("Train");
        const trainWinner = input.fairValueParameters?.minEdgeBps === 200;
        const testWinner = input.fairValueParameters?.minEdgeBps === 500;
        return replay(isTrain
          ? metrics(trainWinner
            ? { sampleCount: 4, actionableCount: 4, winRate: 0.75, winCount: 3, lossCount: 1, pnl: 1 }
            : { sampleCount: 4, actionableCount: 4, winRate: 0.25, winCount: 1, lossCount: 3, pnl: -0.2 })
          : metrics(testWinner
            ? { sampleCount: 4, actionableCount: 4, winRate: 1, winCount: 4, lossCount: 0, pnl: 2 }
            : { sampleCount: 4, actionableCount: 4, winRate: 0.25, winCount: 1, lossCount: 3, pnl: -1 }));
      }
    });

    assert.ok(result.windows.length >= 2);
    assert.ok(result.windows.every((window) => Date.parse(window.trainEnd) <= Date.parse(window.testStart)));
    assert.ok(observedWindows.some((window) => window.label.includes("Train")));
    assert.ok(observedWindows.some((window) => window.label.includes("Test")));
    assert.equal(result.walkForwardResults[0]?.parameterSet.id, "selected-by-train");
    assert.equal(result.walkForwardResults[0]?.degradation.pnlDelta, -4);
    assert.equal(result.walkForwardResults[0]?.stability.failedWindows, result.walkForwardResults[0]?.windows.length);
    assert.ok(result.walkForwardResults[0]?.warnings.includes("WALK_FORWARD_HIGH_OVERFIT_RISK"));
  });

  it("warns when candidate samples are insufficient", async () => {
    const output = await runWalkForwardValidation({
      symbol: "BTC",
      totalWindow: "1w",
      strategyId: "fair-value-v1",
      candidateParameterSets: [parameterSet("thin", { minSampleCount: 5 })],
      useMock: true,
      now: () => checkedAt,
      replayRunner: async () => replay(metrics({ sampleCount: 1, actionableCount: 1, winRate: 1, winCount: 1, lossCount: 0, pnl: 0.1 }))
    });

    assert.ok(output.walkForwardResults[0]?.warnings.includes("LOW_WALK_FORWARD_SAMPLE"));
  });
});

describe("strategy lab ranking", () => {
  it("rejects high overfit, low consistency, and preserves research-only candidates", () => {
    const accepted = sweepResult(parameterSet("accepted"), metrics({ sampleCount: 5, actionableCount: 5, winRate: 0.6, winCount: 3, lossCount: 2, pnl: 1 }), "low");
    const highOverfit = sweepResult(parameterSet("high-overfit"), metrics({ sampleCount: 5, actionableCount: 5, winRate: 0.8, winCount: 4, lossCount: 1, pnl: 1 }), "high");
    const lowConsistency = sweepResult(parameterSet("low-consistency"), metrics({ sampleCount: 5, actionableCount: 5, winRate: 0.6, winCount: 3, lossCount: 2, pnl: 1 }), "low");
    const ranked = rankStrategyParameterResults({
      results: [accepted, highOverfit, lowConsistency],
      walkForwardResults: [walkForward(lowConsistency.parameterSet, 0.2)]
    });

    assert.ok(ranked.topCandidates.every((result) => result.isResearchOnly));
    assert.equal(ranked.topCandidates.some((result) => result.parameterSet.id === "high-overfit"), false);
    assert.equal(ranked.topCandidates.some((result) => result.parameterSet.id === "low-consistency"), false);
    assert.ok(ranked.rejectedParameterSets.every((result) => result.rejectionReasons.length > 0));
  });
});

function parameterSet(id: string, overrides: Partial<StrategyParameterSet> = {}): StrategyParameterSet {
  return {
    id,
    strategyId: "fair-value-v1",
    interval: "5m",
    minEdgeBps: 200,
    maxSpread: 0.15,
    volatilityLookbackCandles: 50,
    minConfidence: 0.2,
    minSampleCount: 3,
    feesBps: 0,
    slippageBps: 0,
    notes: ["test"],
    isResearchOnly: true,
    ...overrides
  };
}

function replay(metric: ReplayMetrics) {
  return {
    metrics: metric,
    sourceType: "mock" as const,
    warnings: metric.warnings,
    isResearchOnly: true as const
  };
}

type MetricsOverrides = Partial<ReplayMetrics> & { pnl?: number | null };

function metrics(overrides: MetricsOverrides = {}): ReplayMetrics {
  const window = resolveReplayWindow("1w", checkedAt);
  const sampleCount = overrides.sampleCount ?? 5;
  const winCount = overrides.winCount ?? 3;
  const lossCount = overrides.lossCount ?? Math.max(0, sampleCount - winCount);
  const actionableCount = overrides.actionableCount ?? sampleCount;
  return {
    symbol: "BTC",
    window,
    sampleCount,
    actionableCount,
    winCount,
    lossCount,
    pendingCount: overrides.pendingCount ?? 0,
    unresolvedCount: overrides.unresolvedCount ?? 0,
    rejectedCount: overrides.rejectedCount ?? 0,
    noSignalCount: overrides.noSignalCount ?? 0,
    winRate: overrides.winRate === undefined ? (sampleCount ? Number((winCount / sampleCount).toFixed(6)) : null) : overrides.winRate,
    longYesCount: overrides.longYesCount ?? actionableCount,
    longYesWinRate: overrides.longYesWinRate ?? (actionableCount ? 0.6 : null),
    longNoCount: overrides.longNoCount ?? 0,
    longNoWinRate: overrides.longNoWinRate ?? null,
    coverageRate: overrides.coverageRate ?? (actionableCount ? 0.8 : null),
    rejectionRate: overrides.rejectionRate ?? 0,
    pendingRate: overrides.pendingRate ?? 0,
    averageEdge: overrides.averageEdge ?? 0.08,
    averageConfidence: overrides.averageConfidence ?? 0.5,
    averageTheoreticalPnl: overrides.averageTheoreticalPnl ?? overrides.pnl ?? 0.1,
    cumulativeTheoreticalPnl: overrides.cumulativeTheoreticalPnl ?? overrides.pnl ?? 0.5,
    maxDrawdown: overrides.maxDrawdown ?? 0.2,
    warnings: overrides.warnings ?? [],
    isResearchOnly: true,
    checkedAt,
    ...overrides
  };
}

function sweepResult(parameter: StrategyParameterSet, metric: ReplayMetrics, overfitRisk: ParameterSweepResult["overfitRisk"]): ParameterSweepResult {
  return {
    parameterSet: parameter,
    metrics: metric,
    rank: 0,
    score: 10,
    scoreBreakdown: {
      winRateComponent: 1,
      pnlComponent: 1,
      coverageComponent: 1,
      drawdownPenalty: 0,
      lowSamplePenalty: 0,
      pendingPenalty: 0,
      overfitPenalty: 0,
      total: 10
    },
    warnings: [],
    rejectionReasons: overfitRisk === "high" ? ["HIGH_OVERFIT_RISK"] : [],
    overfitRisk,
    sourceType: "mock",
    isResearchOnly: true
  };
}

function walkForward(parameter: StrategyParameterSet, consistencyScore: number): WalkForwardResult {
  return {
    parameterSet: parameter,
    windows: [],
    aggregateTrainMetrics: metrics({ pnl: 1 }),
    aggregateTestMetrics: metrics({ pnl: -1 }),
    degradation: {
      winRateDelta: -0.2,
      pnlDelta: -2,
      maxDrawdownDelta: 0.1,
      coverageDelta: -0.1
    },
    stability: {
      passedWindows: 0,
      failedWindows: 2,
      consistencyScore
    },
    overfitRisk: "medium",
    warnings: [],
    isResearchOnly: true
  };
}
