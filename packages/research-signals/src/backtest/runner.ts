import type { BacktestResult } from "@ept/shared-types";
import type { BacktestSample, RunBacktestInput } from "./types.js";

export function runResearchBacktest(input: RunBacktestInput): BacktestResult {
  const minSampleCount = input.minSampleCount ?? 30;
  const feesAssumption = input.feesAssumption ?? "Not modeled; caller must record venue fees before interpreting returns.";
  const slippageAssumption = input.slippageAssumption ?? "Not modeled; caller must record slippage assumptions before interpreting returns.";
  const spreadAssumption = input.spreadAssumption ?? "Not modeled; caller must record spread and liquidity assumptions before interpreting returns.";
  const rejectedReasons: string[] = [];
  const warnings: string[] = [];

  const accepted = input.samples.filter((sample, index) => {
    const reason = rejectSampleReason(sample);
    if (reason) {
      rejectedReasons.push(`sample ${index}: ${reason}`);
      return false;
    }
    return true;
  });

  if (accepted.length === 0) {
    return emptyBacktestResult(input.strategy.id, feesAssumption, slippageAssumption, spreadAssumption, rejectedReasons, warnings);
  }

  if (accepted.length < minSampleCount) {
    warnings.push(`sampleCount ${accepted.length} is below minimum ${minSampleCount}; result cannot be marked viable.`);
  }

  const outcomes = accepted.flatMap((sample) => {
    const preEntryCandles = sample.candles.filter((candle) => Date.parse(candle.timestamp) <= Date.parse(sample.entryTime));
    const signal = input.strategy.signalFn({
      candles: preEntryCandles,
      entryTime: sample.entryTime,
      outcomeTime: sample.outcomeTime
    });
    if (signal.isResearchOnly !== true) {
      rejectedReasons.push(`sample at ${sample.entryTime}: strategy returned non research-only output.`);
      return [];
    }
    if (signal.direction === "NO_SIGNAL") {
      return [];
    }
    const rawReturn = sample.entryPrice === 0 ? 0 : (sample.outcomePrice - sample.entryPrice) / sample.entryPrice;
    const signedReturn = signal.direction === "UP" ? rawReturn : -rawReturn;
    return [{ won: signedReturn > 0, signedReturn }];
  });

  if (outcomes.length === 0) {
    warnings.push("No directional research signals were emitted by the strategy.");
  }

  const sampleCount = outcomes.length;
  const returns = outcomes.map((outcome) => outcome.signedReturn);
  const avgReturn = sampleCount ? round(mean(returns)) : null;
  const winRate = sampleCount ? round(outcomes.filter((outcome) => outcome.won).length / sampleCount) : null;
  const maxDrawdown = sampleCount ? round(maxDrawdownFromReturns(returns)) : null;

  if (winRate !== null && winRate > 0.7 && sampleCount < minSampleCount) {
    warnings.push("High winRate with insufficient sampleCount is not evidence of viability.");
  }

  return {
    strategyId: input.strategy.id,
    sampleCount,
    winRate,
    avgReturn,
    maxDrawdown,
    feesAssumption,
    slippageAssumption,
    spreadAssumption,
    dataRange: {
      start: minIso(accepted.map((sample) => sample.entryTime)),
      end: maxIso(accepted.map((sample) => sample.outcomeTime))
    },
    warnings,
    rejectedReasons,
    isResearchOnly: true
  };
}

function rejectSampleReason(sample: BacktestSample): string | undefined {
  const entryMs = Date.parse(sample.entryTime);
  const outcomeMs = Date.parse(sample.outcomeTime);
  if (!Number.isFinite(entryMs) || !Number.isFinite(outcomeMs)) {
    return "entryTime and outcomeTime must be valid ISO timestamps.";
  }
  if (entryMs >= outcomeMs) {
    return "entryTime must be earlier than outcomeTime.";
  }
  if (sample.candles.length < 4) {
    return "data insufficient before entry signal.";
  }
  if (sample.candles.some((candle) => Date.parse(candle.timestamp) > entryMs)) {
    return "future candle found in signal input window.";
  }
  if (!Number.isFinite(sample.entryPrice) || !Number.isFinite(sample.outcomePrice)) {
    return "entryPrice and outcomePrice must be finite.";
  }
  return undefined;
}

function emptyBacktestResult(
  strategyId: string,
  feesAssumption: string,
  slippageAssumption: string,
  spreadAssumption: string,
  rejectedReasons: string[],
  warnings: string[]
): BacktestResult {
  return {
    strategyId,
    sampleCount: 0,
    winRate: null,
    avgReturn: null,
    maxDrawdown: null,
    feesAssumption,
    slippageAssumption,
    spreadAssumption,
    dataRange: { start: null, end: null },
    warnings: warnings.length ? warnings : ["No valid backtest samples after anti-cheat checks."],
    rejectedReasons,
    isResearchOnly: true
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maxDrawdownFromReturns(returns: number[]): number {
  let equity = 1;
  let peak = 1;
  let drawdown = 0;
  for (const value of returns) {
    equity *= 1 + value;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak === 0 ? 0 : (peak - equity) / peak);
  }
  return drawdown;
}

function minIso(values: string[]): string | null {
  return values.length ? new Date(Math.min(...values.map((value) => Date.parse(value)))).toISOString() : null;
}

function maxIso(values: string[]): string | null {
  return values.length ? new Date(Math.max(...values.map((value) => Date.parse(value)))).toISOString() : null;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
