import type {
  Candle,
  RealtimePriceSymbol,
  ShortWindowContractRule,
  ShortWindowInterval,
  ShortWindowTieRule,
  SignalSymbol
} from "@ept/shared-types";
import type { RuleOutcome, RuleOutcomeInput, RuleTemplateInput } from "./types.js";

export function buildShortWindowRuleTemplate(input: RuleTemplateInput): ShortWindowContractRule {
  const underlyingSymbol = toUnderlyingSymbol(input.symbol);
  if (input.venue === "mock") {
    return {
      id: `mock:${input.symbol}:${input.interval}:end-price`,
      venue: input.venue,
      interval: input.interval,
      symbol: input.symbol,
      underlyingSymbol,
      ruleType: "END_PRICE_GTE_START_PRICE",
      referenceSource: "BINANCE_SPOT_PROXY",
      tieRule: "UP",
      isVerifiedRule: true,
      ruleConfidence: "high",
      notes: [
        "Deterministic mock rule for local tests only.",
        "Research only. Not trading advice. No automated execution."
      ]
    };
  }

  if (input.venue === "proxy-generic") {
    return {
      id: `proxy-generic:${input.symbol}:${input.interval}:binance-spot-end-price`,
      venue: input.venue,
      interval: input.interval,
      symbol: input.symbol,
      underlyingSymbol,
      ruleType: "END_PRICE_GTE_START_PRICE",
      referenceSource: "BINANCE_SPOT_PROXY",
      tieRule: "UNKNOWN",
      isVerifiedRule: false,
      ruleConfidence: "low",
      notes: [
        "Proxy rule only: compares Binance Spot public proxy end price against the window start reference.",
        "This is not confirmed as any Binance Wallet, HiBit, Coinbase, or Kalshi settlement rule.",
        "Manual decision support only. Not trading advice."
      ]
    };
  }

  return {
    id: `${input.venue}:${input.symbol}:${input.interval}:unknown-manual-reference`,
    venue: input.venue,
    interval: input.interval,
    symbol: input.symbol,
    underlyingSymbol,
    ruleType: "UNKNOWN_MANUAL_REFERENCE",
    referenceSource: "UNKNOWN",
    tieRule: "UNKNOWN",
    isVerifiedRule: false,
    ruleConfidence: "unknown",
    notes: [
      `${venueLabel(input.venue)} short-window settlement rule was not verified from reliable public programmable documentation.`,
      "The product must show this as an unverified manual reference and fail closed for actionable signals.",
      "Research only. Not trading advice. No automated execution."
    ]
  };
}

export function buildCfRtiAverageRuleTemplate(input: {
  symbol: SignalSymbol;
  interval: ShortWindowInterval;
  startAverageSeconds?: number | undefined;
  endAverageSeconds?: number | undefined;
  tieRule?: ShortWindowTieRule | undefined;
}): ShortWindowContractRule {
  return {
    id: `proxy-generic:${input.symbol}:${input.interval}:cf-rti-average`,
    venue: "proxy-generic",
    interval: input.interval,
    symbol: input.symbol,
    underlyingSymbol: toUnderlyingSymbol(input.symbol),
    ruleType: "END_AVG_GTE_START_AVG",
    referenceSource: "CF_RTI_PUBLIC_REFERENCE",
    startAverageSeconds: input.startAverageSeconds ?? 60,
    endAverageSeconds: input.endAverageSeconds ?? 60,
    tieRule: input.tieRule ?? "UNKNOWN",
    isVerifiedRule: false,
    ruleConfidence: "medium",
    notes: [
      "Template based on public crypto prediction market examples that use a time-averaged reference.",
      "It is configurable and remains a proxy unless the exact venue rule is independently verified.",
      "Research only. Not trading advice."
    ]
  };
}

export function evaluateShortWindowRuleOutcome(input: RuleOutcomeInput): RuleOutcome {
  if (input.rule.ruleType === "UNKNOWN_MANUAL_REFERENCE") {
    return {
      resolvedSide: "UNKNOWN",
      startReferencePrice: input.event.startReferencePrice,
      endReferencePrice: null,
      notes: ["Unknown manual reference rule cannot be replay-labeled without verified settlement inputs."]
    };
  }

  const startReferencePrice =
    input.rule.ruleType === "END_AVG_GTE_START_AVG"
      ? averageReferencePrice(input.candles, input.event.startTime, input.rule.startAverageSeconds ?? 60)
      : input.event.startReferencePrice;
  const endReferencePrice =
    input.rule.ruleType === "END_AVG_GTE_START_AVG"
      ? averageReferencePrice(
        input.candles,
        new Date(Date.parse(input.event.endTime) - (input.rule.endAverageSeconds ?? 60) * 1000).toISOString(),
        input.rule.endAverageSeconds ?? 60
      )
      : endPrice(input.candles, input.event.endTime);

  if (startReferencePrice === null || endReferencePrice === null) {
    return {
      resolvedSide: "UNKNOWN",
      startReferencePrice,
      endReferencePrice,
      notes: ["Insufficient candles to reconstruct the proxy settlement reference."]
    };
  }

  if (endReferencePrice > startReferencePrice) {
    return { resolvedSide: "UP", startReferencePrice, endReferencePrice, notes: [] };
  }
  if (endReferencePrice < startReferencePrice) {
    return { resolvedSide: "DOWN", startReferencePrice, endReferencePrice, notes: [] };
  }
  if (input.rule.tieRule === "UP") {
    return { resolvedSide: "UP", startReferencePrice, endReferencePrice, notes: ["Tie resolved by configured tieRule=UP."] };
  }
  if (input.rule.tieRule === "DOWN") {
    return { resolvedSide: "DOWN", startReferencePrice, endReferencePrice, notes: ["Tie resolved by configured tieRule=DOWN."] };
  }
  return { resolvedSide: "TIE", startReferencePrice, endReferencePrice, notes: ["Tie rule is unknown; not counted as a win or loss."] };
}

export function shortWindowIntervalMs(interval: ShortWindowInterval): number {
  switch (interval) {
    case "5m":
      return 5 * 60 * 1000;
    case "10m":
      return 10 * 60 * 1000;
    case "15m":
      return 15 * 60 * 1000;
  }
}

export function toUnderlyingSymbol(symbol: SignalSymbol): RealtimePriceSymbol {
  return symbol === "BTC" ? "BTCUSDT" : "ETHUSDT";
}

function endPrice(candles: Candle[], endTime: string): number | null {
  const endMs = Date.parse(endTime);
  const sorted = [...candles].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const candle = [...sorted].reverse().find((item) => {
    const openMs = Date.parse(item.timestamp);
    return openMs + item.granularity * 1000 <= endMs;
  });
  return finiteOrNull(candle?.close);
}

function averageReferencePrice(candles: Candle[], startTime: string, durationSeconds: number): number | null {
  const startMs = Date.parse(startTime);
  const endMs = startMs + durationSeconds * 1000;
  const values = candles
    .filter((candle) => {
      const candleStart = Date.parse(candle.timestamp);
      const candleEnd = candleStart + candle.granularity * 1000;
      return candleStart < endMs && candleEnd > startMs;
    })
    .map((candle) => candle.close)
    .filter((value) => Number.isFinite(value));
  if (!values.length) {
    return null;
  }
  return roundPrice(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundPrice(value: number): number {
  return Number(value.toFixed(8));
}

function venueLabel(venue: RuleTemplateInput["venue"]): string {
  switch (venue) {
    case "binance-wallet-prediction":
      return "Binance Wallet / Predict.fun-style";
    case "hibit":
      return "HiBit-style";
    case "proxy-generic":
      return "Proxy generic";
    case "mock":
      return "Mock";
  }
}
