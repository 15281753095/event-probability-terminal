import type {
  ParameterSweepResult,
  ReplayMetrics,
  ReplayWindow,
  SignalSymbol,
  StrategyParameterOverfitRisk,
  StrategyParameterSet,
  WalkForwardResult,
  WalkForwardWindow
} from "@ept/shared-types";
import { resolveReplayWindow } from "../replay/window.js";
import { rankStrategyParameterResults } from "./ranking.js";
import { aggregateReplayMetrics, runReplayForParameter } from "./sweep-runner.js";
import type { RunWalkForwardValidationInput, RunWalkForwardValidationOutput } from "./types.js";

type SelectedWindowResult = {
  parameterSet: StrategyParameterSet;
  window: WalkForwardWindow;
  trainMetrics: ReplayMetrics;
  testMetrics: ReplayMetrics;
  trainResult: ParameterSweepResult;
  testResult: ParameterSweepResult;
};

export async function runWalkForwardValidation(input: RunWalkForwardValidationInput): Promise<RunWalkForwardValidationOutput> {
  const checkedAt = input.now?.() ?? new Date().toISOString();
  const warnings: string[] = [
    "Walk-forward validation separates in-sample train windows from out-of-sample test windows.",
    "Research only. Not trading advice. No auto execution."
  ];
  if (input.candidateParameterSets.length === 0) {
    return { walkForwardResults: [], warnings: [...warnings, "NO_WALK_FORWARD_CANDIDATES"], windows: [], isResearchOnly: true };
  }

  const totalWindow = resolveReplayWindow(input.totalWindow, checkedAt);
  const windows = buildRollingWindows({
    totalWindow,
    trainWindowRatio: input.trainWindowRatio ?? 0.5,
    testWindowRatio: input.testWindowRatio ?? 0.25
  });
  if (windows.length < 2) {
    warnings.push("INSUFFICIENT_WALK_FORWARD_WINDOWS");
  }

  const selectedResults: SelectedWindowResult[] = [];
  for (const window of windows) {
    const trainReplayWindow = toReplayWindow(window.id, window.trainStart, window.trainEnd, "Train");
    const testReplayWindow = toReplayWindow(window.id, window.testStart, window.testEnd, "Test");
    const trainResults: ParameterSweepResult[] = [];
    for (const parameterSet of input.candidateParameterSets) {
      trainResults.push(await runReplayForParameter({
        symbol: input.symbol,
        window: trainReplayWindow,
        strategyId: input.strategyId,
        parameterSet,
        useMock: input.useMock,
        now: input.now,
        replayRunner: input.replayRunner
      }));
    }
    const rankedTrain = rankStrategyParameterResults({ results: trainResults });
    const selectedTrain = rankedTrain.topCandidates[0] ?? rankedTrain.parameterResults[0];
    if (!selectedTrain) {
      warnings.push(`NO_TRAIN_PARAMETER_SELECTED_${window.id}`);
      continue;
    }
    const testResult = await runReplayForParameter({
      symbol: input.symbol,
      window: testReplayWindow,
      strategyId: input.strategyId,
      parameterSet: selectedTrain.parameterSet,
      useMock: input.useMock,
      now: input.now,
      replayRunner: input.replayRunner
    });
    selectedResults.push({
      parameterSet: selectedTrain.parameterSet,
      window: {
        ...window,
        trainSampleCount: selectedTrain.metrics.sampleCount,
        testSampleCount: testResult.metrics.sampleCount
      },
      trainMetrics: selectedTrain.metrics,
      testMetrics: testResult.metrics,
      trainResult: selectedTrain,
      testResult
    });
  }

  return {
    walkForwardResults: buildWalkForwardResults(input.symbol, checkedAt, selectedResults),
    warnings: unique([
      ...warnings,
      ...selectedResults.flatMap((result) => [...result.trainResult.warnings, ...result.testResult.warnings])
    ]),
    windows: selectedResults.map((result) => result.window),
    isResearchOnly: true
  };
}

function buildRollingWindows(input: {
  totalWindow: ReplayWindow;
  trainWindowRatio: number;
  testWindowRatio: number;
}): WalkForwardWindow[] {
  const startMs = Date.parse(input.totalWindow.startTime);
  const endMs = Date.parse(input.totalWindow.endTime);
  const totalMs = endMs - startMs;
  if (!Number.isFinite(totalMs) || totalMs <= 0) {
    return [];
  }
  const trainRatio = clamp(input.trainWindowRatio, 0.2, 0.8);
  const testRatio = clamp(input.testWindowRatio, 0.1, 0.5);
  const trainMs = Math.floor(totalMs * trainRatio);
  const testMs = Math.floor(totalMs * testRatio);
  const windows: WalkForwardWindow[] = [];
  let cursor = startMs;
  for (let index = 0; index < 12; index += 1) {
    const trainStart = cursor;
    const trainEnd = trainStart + trainMs;
    const testStart = trainEnd;
    const testEnd = testStart + testMs;
    if (testEnd > endMs || trainStart >= trainEnd || testStart >= testEnd) {
      break;
    }
    windows.push({
      id: `wf-${index + 1}`,
      trainStart: new Date(trainStart).toISOString(),
      trainEnd: new Date(trainEnd).toISOString(),
      testStart: new Date(testStart).toISOString(),
      testEnd: new Date(testEnd).toISOString(),
      trainSampleCount: 0,
      testSampleCount: 0
    });
    cursor += testMs;
  }
  return windows;
}

function buildWalkForwardResults(
  symbol: SignalSymbol | "ALL",
  checkedAt: string,
  selectedResults: SelectedWindowResult[]
): WalkForwardResult[] {
  const byParameter = new Map<string, SelectedWindowResult[]>();
  for (const result of selectedResults) {
    const group = byParameter.get(result.parameterSet.id) ?? [];
    group.push(result);
    byParameter.set(result.parameterSet.id, group);
  }

  return [...byParameter.values()].map((group) => {
    const parameterSet = group[0]?.parameterSet;
    if (!parameterSet) {
      throw new Error("Walk-forward group unexpectedly empty.");
    }
    const window = aggregateWindow(group.map((item) => item.window));
    const aggregateTrainMetrics = aggregateReplayMetrics({
      symbol,
      window,
      metrics: group.map((item) => item.trainMetrics),
      checkedAt
    });
    const aggregateTestMetrics = aggregateReplayMetrics({
      symbol,
      window,
      metrics: group.map((item) => item.testMetrics),
      checkedAt
    });
    const passedWindows = group.filter((item) => passedOutOfSampleWindow(item.testMetrics, parameterSet.minSampleCount)).length;
    const failedWindows = group.length - passedWindows;
    const degradation = {
      winRateDelta: delta(aggregateTrainMetrics.winRate, aggregateTestMetrics.winRate),
      pnlDelta: delta(aggregateTrainMetrics.cumulativeTheoreticalPnl, aggregateTestMetrics.cumulativeTheoreticalPnl),
      maxDrawdownDelta: delta(aggregateTrainMetrics.maxDrawdown, aggregateTestMetrics.maxDrawdown),
      coverageDelta: delta(aggregateTrainMetrics.coverageRate, aggregateTestMetrics.coverageRate)
    };
    const consistencyScore = consistency(passedWindows, group.length, degradation);
    const overfitRisk = walkForwardOverfitRisk({
      train: aggregateTrainMetrics,
      test: aggregateTestMetrics,
      passedWindows,
      totalWindows: group.length,
      minSampleCount: parameterSet.minSampleCount
    });
    const warnings = walkForwardWarnings({
      train: aggregateTrainMetrics,
      test: aggregateTestMetrics,
      overfitRisk,
      consistencyScore,
      minSampleCount: parameterSet.minSampleCount
    });

    return {
      parameterSet,
      windows: group.map((item) => item.window),
      aggregateTrainMetrics,
      aggregateTestMetrics,
      degradation,
      stability: {
        passedWindows,
        failedWindows,
        consistencyScore
      },
      overfitRisk,
      warnings,
      isResearchOnly: true
    };
  });
}

function passedOutOfSampleWindow(metrics: ReplayMetrics, minSampleCount: number): boolean {
  return (
    metrics.winRate !== null &&
    metrics.actionableCount >= minSampleCount &&
    metrics.winRate >= 0.5 &&
    (metrics.cumulativeTheoreticalPnl ?? -1) >= 0
  );
}

function walkForwardOverfitRisk(input: {
  train: ReplayMetrics;
  test: ReplayMetrics;
  passedWindows: number;
  totalWindows: number;
  minSampleCount: number;
}): StrategyParameterOverfitRisk {
  const trainLow = input.train.sampleCount < input.minSampleCount;
  const testLow = input.test.sampleCount < input.minSampleCount;
  if (trainLow && testLow) {
    return "unknown";
  }
  if (testLow) {
    return "medium";
  }
  if (input.train.winRate !== null && input.test.winRate !== null && input.train.winRate >= 0.7 && input.test.winRate < 0.5) {
    return "high";
  }
  if ((input.train.cumulativeTheoreticalPnl ?? 0) > 0 && (input.test.cumulativeTheoreticalPnl ?? 0) < 0) {
    return "high";
  }
  if (input.passedWindows < input.totalWindows / 2) {
    return "high";
  }
  if (input.passedWindows < input.totalWindows) {
    return "medium";
  }
  return "low";
}

function walkForwardWarnings(input: {
  train: ReplayMetrics;
  test: ReplayMetrics;
  overfitRisk: StrategyParameterOverfitRisk;
  consistencyScore: number;
  minSampleCount: number;
}): string[] {
  const warnings = [...input.train.warnings, ...input.test.warnings];
  if (input.train.sampleCount < input.minSampleCount || input.test.sampleCount < input.minSampleCount) {
    warnings.push("LOW_WALK_FORWARD_SAMPLE");
  }
  if (input.overfitRisk === "high") {
    warnings.push("WALK_FORWARD_HIGH_OVERFIT_RISK");
  }
  if (input.consistencyScore < 0.5) {
    warnings.push("LOW_WALK_FORWARD_CONSISTENCY");
  }
  return unique(warnings);
}

function aggregateWindow(windows: WalkForwardWindow[]): ReplayWindow {
  const start = windows.map((window) => Date.parse(window.trainStart)).sort((a, b) => a - b)[0] ?? 0;
  const end = windows.map((window) => Date.parse(window.testEnd)).sort((a, b) => b - a)[0] ?? start;
  return {
    id: "custom",
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    label: "Walk-forward aggregate"
  };
}

function toReplayWindow(id: string, startTime: string, endTime: string, label: string): ReplayWindow {
  return {
    id: "custom",
    startTime,
    endTime,
    label: `${id} ${label}`
  };
}

function consistency(passedWindows: number, totalWindows: number, degradation: { winRateDelta: number | null; pnlDelta: number | null }): number {
  if (totalWindows === 0) {
    return 0;
  }
  const base = passedWindows / totalWindows;
  const winRatePenalty = degradation.winRateDelta !== null && degradation.winRateDelta < 0 ? Math.min(0.3, Math.abs(degradation.winRateDelta)) : 0;
  const pnlPenalty = degradation.pnlDelta !== null && degradation.pnlDelta < 0 ? Math.min(0.2, Math.abs(degradation.pnlDelta) / 3) : 0;
  return round(clamp(base - winRatePenalty - pnlPenalty, 0, 1));
}

function delta(train: number | null, test: number | null): number | null {
  return train === null || test === null ? null : round(test - train);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
