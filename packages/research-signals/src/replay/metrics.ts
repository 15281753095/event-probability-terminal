import type { ReplayMetrics, ReplayTradeLikeResult, ReplayWindow, SignalSymbol } from "@ept/shared-types";

const LOW_SAMPLE_SIZE = "LOW_SAMPLE_SIZE";

export function computeReplayMetrics(input: {
  symbol: SignalSymbol | "ALL";
  window: ReplayWindow;
  results: ReplayTradeLikeResult[];
  checkedAt: string;
  warnings?: string[] | undefined;
}): ReplayMetrics {
  const results = input.results;
  const totalEvaluated = results.length;
  const actionable = results.filter((result) => isActionable(result));
  const completed = results.filter((result) => result.countedInWinRate);
  const wins = completed.filter((result) => result.outcome.status === "WIN");
  const losses = completed.filter((result) => result.outcome.status === "LOSS");
  const longYes = completed.filter((result) => result.signal.side === "LONG_YES");
  const longNo = completed.filter((result) => result.signal.side === "LONG_NO");
  const finitePnls = results
    .map((result) => result.theoreticalPnl)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const warnings = unique([
    ...(input.warnings ?? []),
    ...(completed.length < 20 ? [LOW_SAMPLE_SIZE] : []),
    ...(actionable.length === 0 ? ["NO_ACTIONABLE_REPLAY_SIGNALS"] : []),
    ...(completed.length === 0 ? ["NO_COMPLETED_REPLAY_SAMPLES"] : [])
  ]);

  return {
    symbol: input.symbol,
    window: input.window,
    sampleCount: completed.length,
    actionableCount: actionable.length,
    winCount: wins.length,
    lossCount: losses.length,
    pendingCount: countStatus(results, "PENDING"),
    unresolvedCount: countStatus(results, "UNRESOLVED"),
    rejectedCount: countStatus(results, "REJECTED"),
    noSignalCount: countStatus(results, "NO_SIGNAL"),
    winRate: ratio(wins.length, wins.length + losses.length),
    longYesCount: longYes.length,
    longYesWinRate: ratio(longYes.filter((result) => result.outcome.status === "WIN").length, longYes.length),
    longNoCount: longNo.length,
    longNoWinRate: ratio(longNo.filter((result) => result.outcome.status === "WIN").length, longNo.length),
    coverageRate: ratio(actionable.length, totalEvaluated),
    rejectionRate: ratio(countStatus(results, "REJECTED"), totalEvaluated),
    pendingRate: ratio(countStatus(results, "PENDING"), totalEvaluated),
    averageEdge: average(actionable.map((result) => result.signal.edge)),
    averageConfidence: average(actionable.map((result) => result.signal.confidence)),
    averageTheoreticalPnl: average(finitePnls),
    cumulativeTheoreticalPnl: finitePnls.length ? round(finitePnls.reduce((sum, value) => sum + value, 0)) : null,
    maxDrawdown: finitePnls.length ? round(maxDrawdownFromPnl(finitePnls)) : null,
    warnings,
    isResearchOnly: true,
    checkedAt: input.checkedAt
  };
}

function isActionable(result: ReplayTradeLikeResult): boolean {
  return result.signal.side === "LONG_YES" || result.signal.side === "LONG_NO";
}

function countStatus(results: ReplayTradeLikeResult[], status: ReplayTradeLikeResult["outcome"]["status"]): number {
  return results.filter((result) => result.outcome.status === status).length;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round(numerator / denominator) : null;
}

function average(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  return finite.length ? round(finite.reduce((sum, value) => sum + value, 0) / finite.length) : null;
}

function maxDrawdownFromPnl(values: number[]): number {
  let cumulative = 0;
  let peak = 0;
  let drawdown = 0;
  for (const value of values) {
    cumulative += value;
    peak = Math.max(peak, cumulative);
    drawdown = Math.max(drawdown, peak - cumulative);
  }
  return drawdown;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
