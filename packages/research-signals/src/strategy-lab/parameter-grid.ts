import type { OhlcvInterval, StrategyParameterSet } from "@ept/shared-types";
import type { ParameterGridBuildResult, ParameterGridOptions } from "./types.js";

export const DEFAULT_STRATEGY_LAB_MAX_COMBINATIONS = 50;
export const STRATEGY_LAB_MAX_COMBINATIONS_LIMIT = 100;

const allowedIntervals: OhlcvInterval[] = ["1m", "5m", "15m", "1h"];
const defaultIntervals: OhlcvInterval[] = ["5m", "15m"];
const defaultMinEdgeBps = [200, 500, 800];
const defaultMaxSpread = [0.05, 0.10, 0.15];
const defaultVolatilityLookbackCandles = [20, 50, 100];
const defaultMinConfidence = [0.2, 0.4];
const defaultFeesBps = [0, 50];
const defaultSlippageBps = [0, 50];

export function buildFairValueV1ParameterGrid(options: ParameterGridOptions = {}): ParameterGridBuildResult {
  const warnings: string[] = [];
  const rejectedValues: string[] = [];
  const maxCombinations = normalizeMaxCombinations(options.maxCombinations, warnings);
  const intervals = sanitizeIntervals(options.intervals ?? defaultIntervals, rejectedValues);
  const minEdgeBps = sanitizeNumberList("minEdgeBps", options.minEdgeBps ?? defaultMinEdgeBps, rejectedValues, (value) => Number.isInteger(value) && value >= 0 && value <= 5_000);
  const maxSpread = sanitizeNumberList("maxSpread", options.maxSpread ?? defaultMaxSpread, rejectedValues, (value) => value > 0 && value <= 1);
  const volatilityLookbackCandles = sanitizeNumberList("volatilityLookbackCandles", options.volatilityLookbackCandles ?? defaultVolatilityLookbackCandles, rejectedValues, (value) => Number.isInteger(value) && value >= 10 && value <= 1_000);
  const minConfidence = sanitizeNumberList("minConfidence", options.minConfidence ?? defaultMinConfidence, rejectedValues, (value) => value >= 0 && value <= 1);
  const feesBps = sanitizeNumberList("feesBps", options.feesBps ?? defaultFeesBps, rejectedValues, (value) => Number.isInteger(value) && value >= 0 && value <= 1_000);
  const slippageBps = sanitizeNumberList("slippageBps", options.slippageBps ?? defaultSlippageBps, rejectedValues, (value) => Number.isInteger(value) && value >= 0 && value <= 1_000);
  const minSampleCount = normalizeMinSampleCount(options.minSampleCount, rejectedValues);

  const requestedCombinationCount =
    intervals.length *
    minEdgeBps.length *
    maxSpread.length *
    volatilityLookbackCandles.length *
    minConfidence.length *
    feesBps.length *
    slippageBps.length;

  if (requestedCombinationCount > maxCombinations) {
    warnings.push(`PARAMETER_GRID_TRUNCATED requested ${requestedCombinationCount} combinations; capped at ${maxCombinations}.`);
  }
  if (rejectedValues.length) {
    warnings.push("INVALID_PARAMETER_VALUES_REJECTED");
  }

  const parameterGrid: StrategyParameterSet[] = [];
  for (const interval of intervals) {
    for (const edge of minEdgeBps) {
      for (const spread of maxSpread) {
        for (const lookback of volatilityLookbackCandles) {
          for (const confidence of minConfidence) {
            for (const fee of feesBps) {
              for (const slippage of slippageBps) {
                parameterGrid.push({
                  id: parameterSetId({ interval, edge, spread, lookback, confidence, fee, slippage }),
                  strategyId: "fair-value-v1",
                  interval,
                  minEdgeBps: edge,
                  maxSpread: round(spread),
                  volatilityLookbackCandles: lookback,
                  minConfidence: round(confidence),
                  minSampleCount,
                  feesBps: fee,
                  slippageBps: slippage,
                  notes: [
                    "Research-only fair-value-v1 parameter candidate.",
                    "Candidate ranking is not production trading approval."
                  ],
                  isResearchOnly: true
                });
                if (parameterGrid.length >= maxCombinations) {
                  return {
                    parameterGrid,
                    warnings,
                    rejectedValues,
                    requestedCombinationCount,
                    maxCombinations,
                    isResearchOnly: true
                  };
                }
              }
            }
          }
        }
      }
    }
  }

  return {
    parameterGrid,
    warnings,
    rejectedValues,
    requestedCombinationCount,
    maxCombinations,
    isResearchOnly: true
  };
}

export function normalizeMaxCombinations(value: number | undefined, warnings: string[]): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_STRATEGY_LAB_MAX_COMBINATIONS;
  }
  const normalized = Math.floor(value);
  if (normalized < 1) {
    warnings.push("maxCombinations below 1; using 1.");
    return 1;
  }
  if (normalized > STRATEGY_LAB_MAX_COMBINATIONS_LIMIT) {
    warnings.push(`maxCombinations capped at ${STRATEGY_LAB_MAX_COMBINATIONS_LIMIT}.`);
    return STRATEGY_LAB_MAX_COMBINATIONS_LIMIT;
  }
  return normalized;
}

function normalizeMinSampleCount(value: number | undefined, rejectedValues: string[]): number {
  if (value === undefined) {
    return 3;
  }
  if (Number.isInteger(value) && value >= 1 && value <= 1_000) {
    return value;
  }
  rejectedValues.push(`minSampleCount=${String(value)}`);
  return 3;
}

function sanitizeIntervals(values: OhlcvInterval[], rejectedValues: string[]): OhlcvInterval[] {
  const accepted = unique(values.filter((value): value is OhlcvInterval => allowedIntervals.includes(value)));
  for (const value of values) {
    if (!allowedIntervals.includes(value)) {
      rejectedValues.push(`interval=${String(value)}`);
    }
  }
  return accepted.length ? accepted : defaultIntervals;
}

function sanitizeNumberList(
  label: string,
  values: number[],
  rejectedValues: string[],
  accepts: (value: number) => boolean
): number[] {
  const accepted: number[] = [];
  for (const value of values) {
    if (Number.isFinite(value) && accepts(value)) {
      accepted.push(round(value));
    } else {
      rejectedValues.push(`${label}=${String(value)}`);
    }
  }
  return unique(accepted).sort((a, b) => a - b);
}

function parameterSetId(input: {
  interval: OhlcvInterval;
  edge: number;
  spread: number;
  lookback: number;
  confidence: number;
  fee: number;
  slippage: number;
}): string {
  return [
    "fair-value-v1",
    `i${input.interval}`,
    `edge${input.edge}`,
    `spread${input.spread.toFixed(2)}`,
    `vol${input.lookback}`,
    `conf${input.confidence.toFixed(2)}`,
    `fee${input.fee}`,
    `slip${input.slippage}`
  ].join(":");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
