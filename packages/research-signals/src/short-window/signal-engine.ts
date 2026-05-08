import type { Candle, ShortWindowEvent, ShortWindowSignal, ShortWindowSignalSide } from "@ept/shared-types";
import type { ShortWindowMarketState } from "./types.js";

const DEFAULT_MIN_CONFIDENCE = 0.38;
const DEFAULT_STALE_AFTER_MS = 120_000;
const MAX_SPREAD_BPS = 8;
const MAX_VOLATILITY_BPS = 90;

export function generateShortWindowSignal(
  event: ShortWindowEvent,
  marketState: ShortWindowMarketState
): ShortWindowSignal {
  const now = marketState.now;
  const features = buildFeatures(event, marketState);
  const rejectReasons: string[] = [];
  const reasons: string[] = ["Research only. Not trading advice.", "Manual action only; no automated execution."];

  if (event.rule.ruleConfidence === "unknown" || event.rule.ruleType === "UNKNOWN_MANUAL_REFERENCE") {
    rejectReasons.push("UNVERIFIED_UNKNOWN_RULE");
    reasons.push("Settlement rule is unknown, so the signal fails closed.");
  }
  if (event.startReferencePrice === null) {
    rejectReasons.push("MISSING_START_REFERENCE_PRICE");
  }
  if (event.currentPrice === null) {
    rejectReasons.push("MISSING_CURRENT_PRICE");
  }
  if (features.isStale) {
    rejectReasons.push("STALE_PRICE");
  }
  if (features.spreadBps !== null && features.spreadBps > MAX_SPREAD_BPS) {
    rejectReasons.push("SPREAD_TOO_WIDE");
  }

  if (rejectReasons.length) {
    return buildSignal(event, now, "REJECTED", 0, 0, reasons, rejectReasons, marketState, features);
  }

  if (event.status === "forming") {
    return buildSignal(event, now, "WAIT", 0.12, 0, [...reasons, "Window is still forming or has insufficient opening data."], ["WINDOW_FORMING"], marketState, features);
  }
  if (event.status === "closed") {
    return buildSignal(event, now, "WAIT", 0.1, 0, [...reasons, "Window is already closed."], ["WINDOW_CLOSED"], marketState, features);
  }
  if (event.status === "no_entry_zone") {
    return buildSignal(event, now, "WAIT", 0.16, 0, [...reasons, "No-entry zone: the remaining window is too short for a new research signal."], ["NO_ENTRY_ZONE"], marketState, features);
  }

  if (features.volatilityBps !== null && features.volatilityBps > MAX_VOLATILITY_BPS) {
    return buildSignal(event, now, "WAIT", 0.2, 0, [...reasons, "Short-term realized volatility is above the risk threshold."], ["VOLATILITY_TOO_HIGH"], marketState, features);
  }

  const score = directionalScore(event, features);
  const absScore = Math.abs(score);
  const confidenceCap = confidenceCapForRule(event.rule.ruleConfidence);
  const confidence = roundConfidence(Math.min(confidenceCap, Math.max(0, absScore / Math.max(1, features.noiseThresholdBps * 3))));
  const minConfidence = marketState.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const side = score > 0 ? "LONG_UP" : score < 0 ? "LONG_DOWN" : "WAIT";

  if (absScore < features.noiseThresholdBps) {
    return buildSignal(
      event,
      now,
      "WAIT",
      Math.min(confidence, 0.28),
      score,
      [...reasons, "Price and momentum have not cleared the dynamic noise threshold."],
      ["BELOW_NOISE_THRESHOLD"],
      marketState,
      features
    );
  }

  if (confidence < minConfidence) {
    return buildSignal(
      event,
      now,
      "WAIT",
      confidence,
      score,
      [...reasons, "Directional setup exists but confidence is below the configured threshold."],
      ["LOW_CONFIDENCE"],
      marketState,
      features
    );
  }

  const directionalReasons = side === "LONG_UP"
    ? ["Current price is above the window start reference.", "Short-term momentum is positive after spread and volatility checks."]
    : ["Current price is below the window start reference.", "Short-term momentum is negative after spread and volatility checks."];
  const proxyReason = event.rule.isVerifiedRule
    ? "Rule template is verified for deterministic mock use."
    : "Proxy / unverified settlement rule: output is manual decision support only.";
  return buildSignal(event, now, side, confidence, score, [...reasons, ...directionalReasons, proxyReason], [], marketState, features);
}

type FeaturePack = {
  latestCandleTime: string | null;
  latestTickTime: string | null;
  latencyMs: number | null;
  spreadBps: number | null;
  momentumBps: number | null;
  volatilityBps: number | null;
  candleBodyBps: number | null;
  noiseThresholdBps: number;
  isStale: boolean;
};

function buildSignal(
  event: ShortWindowEvent,
  signalTime: string,
  side: ShortWindowSignalSide,
  confidence: number,
  score: number,
  reasons: string[],
  rejectReasons: string[],
  marketState: ShortWindowMarketState,
  features: FeaturePack
): ShortWindowSignal {
  const scoreBreakdown = {
    distanceBps: event.distanceBps,
    momentumBps: features.momentumBps,
    volatilityBps: features.volatilityBps,
    candleBodyBps: features.candleBodyBps,
    spreadBps: features.spreadBps,
    noiseThresholdBps: features.noiseThresholdBps,
    directionalScore: roundBps(score),
    confidenceCap: confidenceCapForRule(event.rule.ruleConfidence),
    total: roundBps(score)
  };
  return {
    id: `${event.id}:${signalTime}`,
    eventId: event.id,
    symbol: event.symbol,
    interval: event.interval,
    signalTime,
    side,
    confidence: roundConfidence(confidence),
    score: roundBps(score),
    currentPrice: event.currentPrice,
    startReferencePrice: event.startReferencePrice,
    distanceBps: event.distanceBps,
    secondsRemaining: event.secondsRemaining,
    reasons: unique(reasons),
    rejectReasons: unique(rejectReasons),
    modelInputs: {
      candleCount: marketState.candles.length,
      latestCandleTime: features.latestCandleTime,
      latestTickTime: features.latestTickTime,
      latencyMs: features.latencyMs,
      bid: marketState.bid ?? marketState.priceTick?.bidPrice ?? null,
      ask: marketState.ask ?? marketState.priceTick?.askPrice ?? null,
      spreadBps: features.spreadBps,
      momentumLookbackCandles: 3,
      volatilityLookbackCandles: 8,
      ruleConfidence: event.rule.ruleConfidence,
      settlementRuleVerified: event.rule.isVerifiedRule,
      scoreBreakdown
    },
    phase: event.status,
    isResearchOnly: true
  };
}

function buildFeatures(event: ShortWindowEvent, marketState: ShortWindowMarketState): FeaturePack {
  const sortedCandles = [...marketState.candles].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const latestCandle = sortedCandles.at(-1);
  const previous = sortedCandles.at(-4) ?? sortedCandles.at(0);
  const latestTickTime = marketState.priceTick?.eventTime ?? marketState.priceTick?.receivedAt ?? null;
  const latestCandleTime = latestCandle?.timestamp ?? null;
  const latestMarketTime = latestTickTime ?? latestCandleTime;
  const ageMs = latestMarketTime ? Date.parse(marketState.now) - Date.parse(latestMarketTime) : Number.POSITIVE_INFINITY;
  const isStale = !Number.isFinite(ageMs) || ageMs > (marketState.staleAfterMs ?? DEFAULT_STALE_AFTER_MS);
  const bid = marketState.bid ?? marketState.priceTick?.bidPrice ?? null;
  const ask = marketState.ask ?? marketState.priceTick?.askPrice ?? null;
  const mid = bid !== null && ask !== null ? (bid + ask) / 2 : null;
  const spreadBps = bid !== null && ask !== null && mid !== null && mid > 0 ? roundBps(((ask - bid) / mid) * 10_000) : null;
  const momentumBps =
    latestCandle && previous && previous.close !== 0
      ? roundBps(((latestCandle.close - previous.close) / previous.close) * 10_000)
      : event.distanceBps;
  const volatilityBps = realizedVolatilityBps(sortedCandles.slice(-9));
  const candleBodyBps =
    latestCandle && latestCandle.open !== 0
      ? roundBps(((latestCandle.close - latestCandle.open) / latestCandle.open) * 10_000)
      : null;
  const noiseThresholdBps = Math.max(
    2,
    Math.min(35, (volatilityBps ?? 3) * 0.55 + (spreadBps ?? 1) * 2 + 1.5)
  );
  return {
    latestCandleTime,
    latestTickTime,
    latencyMs: marketState.latencyMs ?? marketState.priceTick?.latencyMs ?? null,
    spreadBps,
    momentumBps,
    volatilityBps,
    candleBodyBps,
    noiseThresholdBps: roundBps(noiseThresholdBps),
    isStale
  };
}

function directionalScore(event: ShortWindowEvent, features: FeaturePack): number {
  const distance = event.distanceBps ?? 0;
  const momentum = features.momentumBps ?? 0;
  const body = features.candleBodyBps ?? 0;
  const spreadPenalty = features.spreadBps ?? 0;
  const volatilityPenalty = Math.max(0, (features.volatilityBps ?? 0) - 35) * 0.08;
  return roundBps(distance * 0.52 + momentum * 0.36 + body * 0.12 - Math.sign(distance || momentum) * (spreadPenalty * 1.5 + volatilityPenalty));
}

function realizedVolatilityBps(candles: Candle[]): number | null {
  if (candles.length < 3) {
    return null;
  }
  const returns: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    if (!previous || !current || previous.close === 0) {
      continue;
    }
    returns.push(((current.close - previous.close) / previous.close) * 10_000);
  }
  if (returns.length < 2) {
    return null;
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
  return roundBps(Math.sqrt(variance));
}

function confidenceCapForRule(confidence: ShortWindowEvent["rule"]["ruleConfidence"]): number {
  switch (confidence) {
    case "high":
      return 0.88;
    case "medium":
      return 0.72;
    case "low":
      return 0.58;
    case "unknown":
      return 0;
  }
}

function roundBps(value: number): number {
  return Number(value.toFixed(4));
}

function roundConfidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
