import type {
  ParameterSweepResult,
  ReplayMetrics,
  StrategyParameterOverfitRisk,
  StrategyScoreBreakdown,
  WalkForwardResult
} from "@ept/shared-types";

export function buildScoreBreakdown(metrics: ReplayMetrics, overfitRisk: StrategyParameterOverfitRisk, minSampleCount: number): StrategyScoreBreakdown {
  const winRateComponent = metrics.winRate === null ? -35 : metrics.winRate * 45;
  const pnl = metrics.cumulativeTheoreticalPnl ?? -1;
  const pnlComponent = clamp(pnl, -2, 2) * 12;
  const coverageComponent = (metrics.coverageRate ?? 0) * 18;
  const drawdownPenalty = Math.max(0, metrics.maxDrawdown ?? 0) * 16;
  const lowSamplePenalty =
    metrics.actionableCount < minSampleCount
      ? 20 + (minSampleCount - metrics.actionableCount) * 2
      : metrics.sampleCount < 20
        ? 8
        : 0;
  const pendingPenalty = (metrics.pendingRate ?? 0) * 12;
  const overfitPenalty = overfitRisk === "high" ? 25 : overfitRisk === "medium" ? 10 : overfitRisk === "unknown" ? 6 : 0;
  const total = round(
    winRateComponent +
    pnlComponent +
    coverageComponent -
    drawdownPenalty -
    lowSamplePenalty -
    pendingPenalty -
    overfitPenalty
  );

  return {
    winRateComponent: round(winRateComponent),
    pnlComponent: round(pnlComponent),
    coverageComponent: round(coverageComponent),
    drawdownPenalty: round(drawdownPenalty),
    lowSamplePenalty: round(lowSamplePenalty),
    pendingPenalty: round(pendingPenalty),
    overfitPenalty: round(overfitPenalty),
    total
  };
}

export function estimateSweepOverfitRisk(metrics: ReplayMetrics, minSampleCount: number): StrategyParameterOverfitRisk {
  if (metrics.sampleCount === 0 && metrics.actionableCount === 0) {
    return "unknown";
  }
  if (metrics.winRate === null) {
    return "unknown";
  }
  if (metrics.sampleCount < Math.min(3, minSampleCount)) {
    return "unknown";
  }
  if (metrics.sampleCount < minSampleCount) {
    return metrics.winRate >= 0.75 ? "high" : "medium";
  }
  if (metrics.sampleCount < 20 && metrics.winRate >= 0.8) {
    return "medium";
  }
  if ((metrics.cumulativeTheoreticalPnl ?? 0) < 0) {
    return "medium";
  }
  if ((metrics.maxDrawdown ?? 0) > 1) {
    return "medium";
  }
  return "low";
}

export function warningsForMetrics(metrics: ReplayMetrics, minSampleCount: number, overfitRisk: StrategyParameterOverfitRisk): string[] {
  const warnings = [...metrics.warnings];
  if (metrics.sampleCount < 20) {
    warnings.push("LOW_SAMPLE_SIZE");
  }
  if (metrics.actionableCount < minSampleCount) {
    warnings.push("LOW_ACTIONABLE_COUNT");
  }
  if (metrics.winRate === null) {
    warnings.push("NULL_WIN_RATE");
  }
  if ((metrics.cumulativeTheoreticalPnl ?? 0) < 0) {
    warnings.push("NEGATIVE_THEORETICAL_PNL");
  }
  if ((metrics.maxDrawdown ?? 0) > 1) {
    warnings.push("HIGH_MAX_DRAWDOWN");
  }
  if ((metrics.pendingRate ?? 0) > 0.25) {
    warnings.push("HIGH_PENDING_RATE");
  }
  if (overfitRisk === "high") {
    warnings.push("HIGH_OVERFIT_RISK");
  }
  if (overfitRisk === "unknown") {
    warnings.push("UNKNOWN_OVERFIT_RISK");
  }
  return unique(warnings);
}

export function rejectionReasonsForResult(result: ParameterSweepResult, walkForward?: WalkForwardResult | undefined): string[] {
  const reasons = [...result.rejectionReasons];
  if (result.isResearchOnly !== true) {
    reasons.push("NOT_RESEARCH_ONLY");
  }
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
  if (walkForward) {
    if (walkForward.overfitRisk === "high") {
      reasons.push("WALK_FORWARD_HIGH_OVERFIT_RISK");
    }
    if (walkForward.stability.consistencyScore < 0.5) {
      reasons.push("LOW_WALK_FORWARD_CONSISTENCY");
    }
    if ((walkForward.aggregateTestMetrics.cumulativeTheoreticalPnl ?? 0) < 0) {
      reasons.push("NEGATIVE_OUT_OF_SAMPLE_THEORETICAL_PNL");
    }
  }
  return unique(reasons);
}

export function rankStrategyParameterResults(
  input: {
    results: ParameterSweepResult[];
    walkForwardResults?: WalkForwardResult[] | undefined;
    topCandidateLimit?: number | undefined;
  }
): {
  parameterResults: ParameterSweepResult[];
  topCandidates: ParameterSweepResult[];
  rejectedParameterSets: ParameterSweepResult[];
} {
  const walkForwardById = new Map((input.walkForwardResults ?? []).map((result) => [result.parameterSet.id, result]));
  const parameterResults = [...input.results]
    .map((result) => {
      const walkForward = walkForwardById.get(result.parameterSet.id);
      const rejectionReasons = rejectionReasonsForResult(result, walkForward);
      return {
        ...result,
        rejectionReasons,
        warnings: unique([
          ...result.warnings,
          ...(walkForward?.warnings ?? []),
          ...(walkForward?.overfitRisk === "high" ? ["WALK_FORWARD_HIGH_OVERFIT_RISK"] : [])
        ])
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((result, index) => ({ ...result, rank: index + 1 }));
  const topCandidates = parameterResults
    .filter((result) => result.rejectionReasons.length === 0)
    .slice(0, input.topCandidateLimit ?? 5);
  const rejectedParameterSets = parameterResults.filter((result) => result.rejectionReasons.length > 0);

  return {
    parameterResults,
    topCandidates,
    rejectedParameterSets
  };
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
