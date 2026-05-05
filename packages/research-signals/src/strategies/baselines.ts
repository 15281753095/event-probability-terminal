import type { BaselineSignalResult } from "@ept/shared-types";
import type { ResearchStrategyCandidate, ResearchStrategyInput } from "./types.js";

export const RESEARCH_ONLY_STRATEGY_REGISTRY: ResearchStrategyCandidate[] = [
  {
    id: "baseline-underlying-momentum",
    name: "Baseline underlying price momentum",
    hypothesis: "Recent underlying BTC/ETH closes may contain directional information worth testing for event-contract research.",
    requiredInputs: ["closed OHLCV candles before entryTime", "entryTime", "outcomeTime"],
    forbiddenInputs: ["future candles after entryTime", "resolution data before entry signal", "private account/order data"],
    signalFn: baselineUnderlyingMomentumSignal,
    riskNotes: [
      "Momentum can reverse abruptly near event windows.",
      "Fees, spread, slippage, and market liquidity can dominate small directional moves.",
      "This baseline is not calibrated to Polymarket settlement rules."
    ],
    status: "research_only"
  }
];

export function baselineUnderlyingMomentumSignal(input: ResearchStrategyInput): BaselineSignalResult {
  const usableCandles = input.candles.filter((candle) => Date.parse(candle.timestamp) <= Date.parse(input.entryTime));
  const latest = usableCandles.at(-1);
  const prior = usableCandles.at(-4);
  if (!latest || !prior) {
    return {
      direction: "NO_SIGNAL",
      confidence: 0,
      reasons: [],
      vetoReasons: ["Insufficient pre-entry candles for baseline momentum."],
      isResearchOnly: true
    };
  }
  const move = prior.close === 0 ? 0 : (latest.close - prior.close) / prior.close;
  if (Math.abs(move) < 0.0005) {
    return {
      direction: "NO_SIGNAL",
      confidence: 0.1,
      reasons: [`Pre-entry momentum ${move.toFixed(6)} below research threshold.`],
      vetoReasons: ["Momentum too small for baseline research signal."],
      isResearchOnly: true
    };
  }
  return {
    direction: move > 0 ? "UP" : "DOWN",
    confidence: Math.min(0.6, Math.max(0.15, Math.abs(move) * 100)),
    reasons: [`Pre-entry close momentum over three candles was ${move.toFixed(6)}.`],
    vetoReasons: [],
    isResearchOnly: true
  };
}

export function researchStrategyRegistryCount(): number {
  return RESEARCH_ONLY_STRATEGY_REGISTRY.length;
}
