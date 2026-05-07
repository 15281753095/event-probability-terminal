import type { TerminalProbabilityInput, TerminalProbabilityResult } from "./types.js";

export const FAIR_VALUE_METHOD = "realized-vol-terminal-probability-v1" as const;

export const FAIR_VALUE_ASSUMPTIONS = [
  "Uses recent closed-candle realized volatility as the only distribution input.",
  "Estimates terminal price probability at the stated horizon; it is not risk-neutral pricing.",
  "Ignores jump risk, funding, venue outages, and resolution disputes.",
  "Ignores market-book impact beyond the explicit fee/slippage/spread buffers.",
  "Research only; not trade advice and not a guarantee of profit."
];

const MIN_RETURN_COUNT = 10;

export function estimateTerminalAboveProbability(
  input: TerminalProbabilityInput
): TerminalProbabilityResult {
  const rejectReasons: string[] = [];
  const warnings: string[] = [];
  if (!Number.isFinite(input.currentPrice) || input.currentPrice <= 0) {
    rejectReasons.push("Current underlying price is missing or invalid.");
  }
  if (!Number.isFinite(input.thresholdPrice) || input.thresholdPrice <= 0) {
    rejectReasons.push("Threshold price is missing or invalid.");
  }
  if (!Number.isFinite(input.horizonSeconds) || input.horizonSeconds <= 0) {
    rejectReasons.push("Horizon seconds must be positive.");
  }

  const nowMs = input.now ? Date.parse(input.now) : null;
  const candles = nowMs !== null
    ? input.candles.filter((candle) => Date.parse(candle.timestamp) <= nowMs)
    : [...input.candles];
  const returns = logReturns(candles);
  if (returns.length < MIN_RETURN_COUNT) {
    rejectReasons.push(`Insufficient closed candles for realized volatility: ${returns.length} return(s), ${MIN_RETURN_COUNT} required.`);
  }
  if (rejectReasons.length) {
    return emptyResult(returns.length, warnings, rejectReasons);
  }

  const variance = sampleVariance(returns);
  if (!Number.isFinite(variance) || variance < 0) {
    rejectReasons.push("Realized volatility could not be estimated from candle returns.");
    return emptyResult(returns.length, warnings, rejectReasons);
  }
  const intervalSeconds = medianIntervalSeconds(candles);
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    rejectReasons.push("Candle interval could not be inferred for volatility scaling.");
    return emptyResult(returns.length, warnings, rejectReasons);
  }
  const volatilityPerSecond = Math.sqrt(variance / intervalSeconds);
  if (volatilityPerSecond === 0) {
    warnings.push("Realized volatility is zero; terminal probability collapses to deterministic threshold comparison.");
    return {
      probabilityAbove: input.currentPrice >= input.thresholdPrice ? 1 : 0,
      realizedVolatilityPerSecond: 0,
      usableReturnCount: returns.length,
      warnings,
      rejectReasons: [],
      assumptions: FAIR_VALUE_ASSUMPTIONS,
      method: FAIR_VALUE_METHOD
    };
  }

  const scaledVol = volatilityPerSecond * Math.sqrt(input.horizonSeconds);
  const z = Math.log(input.thresholdPrice / input.currentPrice) / scaledVol;
  return {
    probabilityAbove: round(clamp(1 - standardNormalCdf(z), 0, 1)),
    realizedVolatilityPerSecond: round(volatilityPerSecond),
    usableReturnCount: returns.length,
    warnings,
    rejectReasons: [],
    assumptions: FAIR_VALUE_ASSUMPTIONS,
    method: FAIR_VALUE_METHOD
  };
}

function logReturns(candles: TerminalProbabilityInput["candles"]): number[] {
  const sorted = [...candles].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const values: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (!previous || !current || previous.close <= 0 || current.close <= 0) {
      continue;
    }
    values.push(Math.log(current.close / previous.close));
  }
  return values;
}

function sampleVariance(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
}

function medianIntervalSeconds(candles: TerminalProbabilityInput["candles"]): number {
  const sorted = [...candles].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const intervals = sorted.flatMap((candle, index) => {
    const previous = sorted[index - 1];
    if (!previous) {
      return [];
    }
    const seconds = (Date.parse(candle.timestamp) - Date.parse(previous.timestamp)) / 1000;
    return Number.isFinite(seconds) && seconds > 0 ? [seconds] : [];
  }).sort((a, b) => a - b);
  const middle = Math.floor(intervals.length / 2);
  return intervals[middle] ?? sorted.at(-1)?.granularity ?? 60;
}

function standardNormalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}

function emptyResult(
  usableReturnCount: number,
  warnings: string[],
  rejectReasons: string[]
): TerminalProbabilityResult {
  return {
    probabilityAbove: null,
    realizedVolatilityPerSecond: null,
    usableReturnCount,
    warnings,
    rejectReasons,
    assumptions: FAIR_VALUE_ASSUMPTIONS,
    method: FAIR_VALUE_METHOD
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
