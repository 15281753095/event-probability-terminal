import type {
  ShortWindowMetrics,
  ShortWindowMetricsWindow,
  ShortWindowReplayResult,
  ShortWindowSignalSide,
  SignalSymbol
} from "@ept/shared-types";

export function computeShortWindowMetrics(input: {
  symbol: SignalSymbol;
  interval: ShortWindowMetrics["interval"];
  window: ShortWindowMetricsWindow;
  results: ShortWindowReplayResult[];
  warnings?: string[] | undefined;
}): ShortWindowMetrics {
  const wins = input.results.filter((result) => result.outcome.status === "WIN");
  const losses = input.results.filter((result) => result.outcome.status === "LOSS");
  const actionable = input.results.filter((result) => isActionable(result.signal.side));
  const counted = input.results.filter((result) => result.outcome.countedInWinRate);
  const longUp = counted.filter((result) => result.signal.side === "LONG_UP");
  const longDown = counted.filter((result) => result.signal.side === "LONG_DOWN");
  const waitCount = input.results.filter((result) => result.signal.side === "WAIT" || result.outcome.status === "WAIT").length;
  const rejectedCount = input.results.filter((result) => result.signal.side === "REJECTED" || result.outcome.status === "REJECTED").length;
  const pendingCount = input.results.filter((result) => result.outcome.status === "PENDING").length;
  const warnings = unique([
    ...(input.warnings ?? []),
    counted.length < 5 ? "LOW_SAMPLE_SIZE" : "",
    "Proxy replay is not live venue performance and is not trading advice."
  ]);

  return {
    symbol: input.symbol,
    interval: input.interval,
    window: input.window,
    totalEvents: input.results.length,
    actionableCount: actionable.length,
    winCount: wins.length,
    lossCount: losses.length,
    waitCount,
    rejectedCount,
    pendingCount,
    winRate: ratio(wins.length, wins.length + losses.length),
    longUpWinRate: sideWinRate(longUp),
    longDownWinRate: sideWinRate(longDown),
    avgConfidence: average(actionable.map((result) => result.signal.confidence)),
    avgDistanceBpsAtSignal: average(actionable.map((result) => result.signal.distanceBps).filter((value): value is number => value !== null)),
    maxDrawdown: maxDrawdown(counted),
    warnings,
    isResearchOnly: true
  };
}

function isActionable(side: ShortWindowSignalSide): boolean {
  return side === "LONG_UP" || side === "LONG_DOWN";
}

function sideWinRate(results: ShortWindowReplayResult[]): number | null {
  const wins = results.filter((result) => result.outcome.status === "WIN").length;
  const losses = results.filter((result) => result.outcome.status === "LOSS").length;
  return ratio(wins, wins + losses);
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Number((numerator / denominator).toFixed(6)) : null;
}

function average(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
}

function maxDrawdown(results: ShortWindowReplayResult[]): number | null {
  if (!results.length) {
    return null;
  }
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const result of results) {
    if (result.outcome.status === "WIN") {
      equity += 1;
    } else if (result.outcome.status === "LOSS") {
      equity -= 1;
    }
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  return Number(drawdown.toFixed(6));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
