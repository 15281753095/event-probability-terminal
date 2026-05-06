import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estimateTerminalAboveProbability,
  evaluateFairValueMarket,
  evaluateMarketEligibility
} from "../src/index.js";
import type { BoundEventMarket, Candle, EventMarketCandidate, EventMarketOdds } from "@ept/shared-types";

const now = "2026-05-06T00:00:00.000Z";

describe("fair value market eligibility", () => {
  it("marks a BTC terminal threshold market eligible", () => {
    const market = boundMarket({ symbol: "BTC", question: "Will Bitcoin be above $100,000 on December 31, 2026?" });
    const result = evaluateMarketEligibility(market, { now });

    assert.equal(result.eligible, true);
    assert.equal(result.extracted.underlyingSymbol, "BTCUSDT");
    assert.equal(result.extracted.thresholdPrice, 100000);
    assert.equal(result.extracted.comparator, "ABOVE");
  });

  it("marks an ETH terminal threshold market eligible", () => {
    const market = boundMarket({ symbol: "ETH", question: "Will Ethereum be below $3,000 on December 31, 2026?" });
    const result = evaluateMarketEligibility(market, { now });

    assert.equal(result.eligible, true);
    assert.equal(result.extracted.underlyingSymbol, "ETHUSDT");
    assert.equal(result.extracted.thresholdPrice, 3000);
    assert.equal(result.extracted.comparator, "BELOW");
  });

  it("rejects BTC plus ETH ambiguous markets", () => {
    const market = boundMarket({ symbol: "BTC", question: "Will Bitcoin outperform Ethereum above $100,000?" });
    const result = evaluateMarketEligibility(market, { now });

    assert.equal(result.eligible, false);
    assert.ok(result.rejectReasons.some((reason) => reason.includes("both BTC and ETH")));
  });

  it("rejects missing token IDs", () => {
    const market = boundMarket({ symbol: "BTC", clobTokenIds: [] });
    const result = evaluateMarketEligibility(market, { now });

    assert.equal(result.eligible, false);
    assert.ok(result.rejectReasons.some((reason) => reason.includes("token IDs")));
  });

  it("rejects missing threshold", () => {
    const market = boundMarket({ symbol: "BTC", question: "Will Bitcoin have a major breakout soon?" });
    const result = evaluateMarketEligibility(market, { now });

    assert.equal(result.eligible, false);
    assert.ok(result.rejectReasons.some((reason) => reason.includes("threshold")));
  });

  it("rejects long vague hit markets", () => {
    const market = boundMarket({ symbol: "BTC", question: "Will bitcoin hit $1m before GTA VI?" });
    const result = evaluateMarketEligibility(market, { now });

    assert.equal(result.eligible, false);
    assert.ok(result.rejectReasons.some((reason) => reason.includes("vague")));
  });

  it("rejects high spread markets", () => {
    const market = boundMarket({ symbol: "BTC", spread: 0.12 });
    const result = evaluateMarketEligibility(market, { now, maxSpread: 0.08 });

    assert.equal(result.eligible, false);
    assert.ok(result.rejectReasons.some((reason) => reason.includes("exceeds maxSpread")));
  });

  it("rejects unknown liquidity markets", () => {
    const market = boundMarket({ symbol: "BTC", liquidityStatus: "unknown" });
    const result = evaluateMarketEligibility(market, { now });

    assert.equal(result.eligible, false);
    assert.ok(result.rejectReasons.some((reason) => reason.includes("liquidityStatus is unknown")));
  });
});

describe("fair value probability model", () => {
  it("estimates terminal above threshold probability between zero and one", () => {
    const result = estimateTerminalAboveProbability({
      currentPrice: 101,
      thresholdPrice: 100,
      candles: candles(),
      horizonSeconds: 300,
      now
    });

    assert.equal(result.rejectReasons.length, 0);
    assert.ok(result.probabilityAbove !== null && result.probabilityAbove >= 0 && result.probabilityAbove <= 1);
  });

  it("rejects insufficient candles", () => {
    const result = estimateTerminalAboveProbability({
      currentPrice: 101,
      thresholdPrice: 100,
      candles: candles(5),
      horizonSeconds: 300,
      now
    });

    assert.equal(result.probabilityAbove, null);
    assert.ok(result.rejectReasons.some((reason) => reason.includes("Insufficient")));
  });

  it("handles zero volatility without throwing", () => {
    const flatCandles = candles(20, { flat: true });
    const result = estimateTerminalAboveProbability({
      currentPrice: 101,
      thresholdPrice: 100,
      candles: flatCandles,
      horizonSeconds: 300,
      now
    });

    assert.equal(result.probabilityAbove, 1);
    assert.ok(result.warnings.some((warning) => warning.includes("zero")));
  });

  it("does not use future candles", () => {
    const baseCandles = candles();
    const future: Candle = {
      ...baseCandles.at(-1)!,
      timestamp: "2026-05-06T00:01:00.000Z",
      startTime: "2026-05-06T00:01:00.000Z",
      openTime: "2026-05-06T00:01:00.000Z",
      close: 1000000
    };
    const withoutFuture = estimateTerminalAboveProbability({
      currentPrice: 101,
      thresholdPrice: 100,
      candles: baseCandles,
      horizonSeconds: 300,
      now
    });
    const withFuture = estimateTerminalAboveProbability({
      currentPrice: 101,
      thresholdPrice: 100,
      candles: [...baseCandles, future],
      horizonSeconds: 300,
      now
    });

    assert.equal(withFuture.probabilityAbove, withoutFuture.probabilityAbove);
  });

  it("includes model assumptions", () => {
    const result = estimateTerminalAboveProbability({
      currentPrice: 101,
      thresholdPrice: 100,
      candles: candles(),
      horizonSeconds: 300,
      now
    });

    assert.ok(result.assumptions.some((assumption) => assumption.includes("Research only")));
    assert.equal(result.method, "realized-vol-terminal-probability-v1");
  });
});

describe("fair value edge markers", () => {
  it("maps positive YES edge to LONG_YES", () => {
    const result = evaluateFairValueMarket(fairValueInput({
      currentPrice: 101,
      thresholdPrice: 100,
      yesPrice: 0.2,
      noPrice: 0.8
    }));

    assert.equal(result.marker.side, "LONG_YES");
    assert.equal(result.marker.isResearchOnly, true);
  });

  it("maps positive NO edge to LONG_NO", () => {
    const result = evaluateFairValueMarket(fairValueInput({
      currentPrice: 90,
      thresholdPrice: 100,
      yesPrice: 0.8,
      noPrice: 0.2
    }));

    assert.equal(result.marker.side, "LONG_NO");
    assert.equal(result.marker.isResearchOnly, true);
  });

  it("maps below-threshold edges to NO_SIGNAL", () => {
    const result = evaluateFairValueMarket(fairValueInput({
      currentPrice: 101,
      thresholdPrice: 100,
      yesPrice: 0.99,
      noPrice: 0.01,
      minEdgeBps: 250
    }));

    assert.equal(result.marker.side, "NO_SIGNAL");
  });

  it("maps rejected markets to REJECTED", () => {
    const input = fairValueInput({
      currentPrice: 101,
      thresholdPrice: 100,
      question: "Will Bitcoin have a major breakout soon?"
    });
    const result = evaluateFairValueMarket(input);

    assert.equal(result.marker.side, "REJECTED");
    assert.equal(result.marker.isResearchOnly, true);
    assert.ok(result.snapshot.rejectReasons.length > 0);
  });
});

function fairValueInput(input: {
  currentPrice: number;
  thresholdPrice: number;
  yesPrice?: number | undefined;
  noPrice?: number | undefined;
  question?: string | undefined;
  minEdgeBps?: number | undefined;
}) {
  const question = input.question ?? `Will Bitcoin be above $${input.thresholdPrice} on December 31, 2026?`;
  const market = boundMarket({
    symbol: "BTC",
    question,
    yesPrice: input.yesPrice ?? 0.4,
    noPrice: input.noPrice ?? 0.6
  });
  return {
    symbol: "BTC" as const,
    underlyingSymbol: "BTCUSDT" as const,
    currentPrice: input.currentPrice,
    candles: candles(20, { flat: true, base: input.currentPrice }),
    market,
    odds: market.odds,
    now,
    horizonSeconds: 300,
    feesBps: 0,
    slippageBps: 0,
    minEdgeBps: input.minEdgeBps ?? 250,
    maxSpread: 0.08,
    minLiquidityStatus: "ok" as const
  };
}

function boundMarket(input: {
  symbol: "BTC" | "ETH";
  question?: string | undefined;
  clobTokenIds?: string[] | undefined;
  yesPrice?: number | undefined;
  noPrice?: number | undefined;
  spread?: number | undefined;
  liquidityStatus?: EventMarketOdds["liquidityStatus"] | undefined;
}): BoundEventMarket {
  const question = input.question ?? `Will ${input.symbol === "BTC" ? "Bitcoin" : "Ethereum"} be above $${input.symbol === "BTC" ? "100,000" : "3,000"} on December 31, 2026?`;
  const clobTokenIds = input.clobTokenIds ?? ["yes-token", "no-token"];
  const yesPrice = input.yesPrice ?? 0.4;
  const noPrice = input.noPrice ?? 0.6;
  const market: EventMarketCandidate = {
    id: "mock-market",
    eventId: "mock-event",
    marketId: "mock-market",
    question,
    slug: question.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    description: "Mock explicit terminal rule for fair value tests.",
    active: true,
    closed: false,
    endDate: "2026-12-31T23:59:00.000Z",
    startDate: "2026-05-01T00:00:00.000Z",
    volume: 1000,
    liquidity: 1000,
    outcomes: ["Yes", "No"],
    outcomePrices: [yesPrice, noPrice],
    clobTokenIds,
    conditionId: "condition",
    questionId: "question",
    resolutionSource: "Mock explicit terminal rule.",
    rawSource: "mock"
  };
  const odds: EventMarketOdds = {
    marketId: market.marketId,
    question,
    tokenIdYes: clobTokenIds[0] ?? null,
    tokenIdNo: clobTokenIds[1] ?? null,
    yesPrice,
    noPrice,
    yesMidpoint: yesPrice,
    noMidpoint: noPrice,
    spread: input.spread ?? 0.02,
    impliedProbabilityYes: yesPrice,
    impliedProbabilityNo: noPrice,
    liquidityStatus: input.liquidityStatus ?? "ok",
    sourceType: "mock",
    provider: "mock",
    checkedAt: now,
    failClosedReasons: []
  };
  return {
    symbol: input.symbol,
    underlyingSymbol: input.symbol === "BTC" ? "BTCUSDT" : "ETHUSDT",
    market,
    odds,
    realtimeUnderlyingPrice: input.symbol === "BTC" ? 100 : 3000,
    bindingStatus: "bound",
    bindingReasons: ["Mock binding."],
    researchEligible: true,
    researchRejectReasons: []
  };
}

function candles(count = 40, options: { flat?: boolean; base?: number } = {}): Candle[] {
  const base = options.base ?? 100;
  const latestStartMs = Date.parse(now) - 60_000;
  return Array.from({ length: count }, (_, index) => {
    const timestamp = new Date(latestStartMs - (count - 1 - index) * 60_000).toISOString();
    const wave = options.flat ? 0 : Math.sin(index / 2) * 0.4;
    const close = options.flat ? base : base + index * 0.05 + wave;
    return {
      source: "binance_spot_public",
      sourceType: "mock",
      provider: "binance-spot-public",
      symbol: "BTC",
      interval: "1m",
      granularity: 60,
      productId: "BTCUSDT",
      displaySymbol: "BTCUSDT",
      openTime: timestamp,
      startTime: timestamp,
      timestamp,
      open: close - 0.03,
      high: close + 0.05,
      low: close - 0.05,
      close,
      volume: 1000 + index,
      isLive: false,
      isMock: true,
      isFixtureBacked: false,
      isClosed: true
    };
  });
}
