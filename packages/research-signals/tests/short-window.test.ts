import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Candle, ShortWindowContractRule } from "@ept/shared-types";
import {
  buildCfRtiAverageRuleTemplate,
  buildCurrentShortWindowEvent,
  buildShortWindowRuleTemplate,
  evaluateShortWindowRuleOutcome,
  generateShortWindowSignal,
  replayCandles,
  runShortWindowReplay,
  type FetchLike
} from "../src/index.js";

const checkedAt = "2026-05-07T00:30:00.000Z";

describe("short-window event window engine", () => {
  it("computes 5m 10m and 15m windows with countdown and phases", () => {
    const rule = buildShortWindowRuleTemplate({ venue: "mock", symbol: "BTC", interval: "5m" });
    const five = buildCurrentShortWindowEvent({
      symbol: "BTC",
      interval: "5m",
      venue: "mock",
      now: "2026-05-07T00:08:30.000Z",
      candles: candles("BTC", "2026-05-07T00:05:00.000Z", [100, 101, 102, 103]),
      rule
    });
    assert.equal(five.startTime, "2026-05-07T00:05:00.000Z");
    assert.equal(five.endTime, "2026-05-07T00:10:00.000Z");
    assert.equal(five.secondsRemaining, 90);
    assert.equal(five.status, "decision_zone");

    const tenRule = buildShortWindowRuleTemplate({ venue: "mock", symbol: "BTC", interval: "10m" });
    assert.equal(buildCurrentShortWindowEvent({
      symbol: "BTC",
      interval: "10m",
      venue: "mock",
      now: "2026-05-07T00:12:00.000Z",
      candles: candles("BTC", "2026-05-07T00:10:00.000Z", [100, 101]),
      rule: tenRule
    }).startTime, "2026-05-07T00:10:00.000Z");

    const fifteenRule = buildShortWindowRuleTemplate({ venue: "mock", symbol: "ETH", interval: "15m" });
    assert.equal(buildCurrentShortWindowEvent({
      symbol: "ETH",
      interval: "15m",
      venue: "mock",
      now: "2026-05-07T00:16:00.000Z",
      candles: candles("ETH", "2026-05-07T00:15:00.000Z", [3000, 3001]),
      rule: fifteenRule
    }).endTime, "2026-05-07T00:30:00.000Z");
  });

  it("marks no-entry zone and rejects missing start reference through the signal engine", () => {
    const rule = buildShortWindowRuleTemplate({ venue: "mock", symbol: "BTC", interval: "5m" });
    const noEntry = buildCurrentShortWindowEvent({
      symbol: "BTC",
      interval: "5m",
      venue: "mock",
      now: "2026-05-07T00:09:45.000Z",
      candles: candles("BTC", "2026-05-07T00:05:00.000Z", [100, 101, 102, 103, 104]),
      rule
    });
    assert.equal(noEntry.status, "no_entry_zone");
    assert.equal(generateShortWindowSignal(noEntry, {
      candles: candles("BTC", "2026-05-07T00:05:00.000Z", [100, 101, 102, 103, 104]),
      now: "2026-05-07T00:09:45.000Z"
    }).side, "WAIT");

    const missing = buildCurrentShortWindowEvent({
      symbol: "BTC",
      interval: "5m",
      venue: "mock",
      now: "2026-05-07T00:08:45.000Z",
      candles: [],
      rule
    });
    const rejected = generateShortWindowSignal(missing, { candles: [], now: "2026-05-07T00:08:45.000Z" });
    assert.equal(rejected.side, "REJECTED");
    assert.ok(rejected.rejectReasons.includes("MISSING_START_REFERENCE_PRICE"));
  });
});

describe("short-window rule templates", () => {
  it("labels proxy and unknown venue rules conservatively", () => {
    const proxy = buildShortWindowRuleTemplate({ venue: "proxy-generic", symbol: "BTC", interval: "5m" });
    assert.equal(proxy.ruleType, "END_PRICE_GTE_START_PRICE");
    assert.equal(proxy.isVerifiedRule, false);
    assert.equal(proxy.ruleConfidence, "low");

    const hibit = buildShortWindowRuleTemplate({ venue: "hibit", symbol: "ETH", interval: "10m" });
    assert.equal(hibit.ruleType, "UNKNOWN_MANUAL_REFERENCE");
    assert.equal(hibit.ruleConfidence, "unknown");
  });

  it("evaluates END_PRICE and tie rules", () => {
    const upRule = { ...buildShortWindowRuleTemplate({ venue: "mock", symbol: "BTC", interval: "5m" }), tieRule: "UP" } satisfies ShortWindowContractRule;
    const downRule = { ...upRule, tieRule: "DOWN" } satisfies ShortWindowContractRule;
    const event = { startTime: "2026-05-07T00:00:00.000Z", endTime: "2026-05-07T00:05:00.000Z", startReferencePrice: 100 };
    const flat = candles("BTC", "2026-05-07T00:00:00.000Z", [100, 100, 100, 100, 100]);
    assert.equal(evaluateShortWindowRuleOutcome({ rule: upRule, event, candles: flat }).resolvedSide, "UP");
    assert.equal(evaluateShortWindowRuleOutcome({ rule: downRule, event, candles: flat }).resolvedSide, "DOWN");
    assert.equal(evaluateShortWindowRuleOutcome({ rule: { ...upRule, tieRule: "UNKNOWN" }, event, candles: flat }).resolvedSide, "TIE");
  });

  it("evaluates END_AVG_GTE_START_AVG without hard-coding venue settlement", () => {
    const rule = buildCfRtiAverageRuleTemplate({ symbol: "BTC", interval: "5m", startAverageSeconds: 120, endAverageSeconds: 120 });
    const event = { startTime: "2026-05-07T00:00:00.000Z", endTime: "2026-05-07T00:05:00.000Z", startReferencePrice: 100 };
    const outcome = evaluateShortWindowRuleOutcome({
      rule,
      event,
      candles: candles("BTC", "2026-05-07T00:00:00.000Z", [100, 100, 101, 103, 104])
    });
    assert.equal(outcome.resolvedSide, "UP");
    assert.equal(rule.isVerifiedRule, false);
  });
});

describe("short-window signal engine", () => {
  it("maps positive and negative momentum to LONG_UP and LONG_DOWN", () => {
    const upEvent = eventWithPrices("BTC", "2026-05-07T00:08:30.000Z", [100, 101, 102, 103]);
    const up = generateShortWindowSignal(upEvent, {
      candles: candles("BTC", "2026-05-07T00:05:00.000Z", [100, 101, 102, 103]),
      bid: 102.99,
      ask: 103.01,
      now: "2026-05-07T00:08:30.000Z",
      minConfidence: 0.2
    });
    assert.equal(up.side, "LONG_UP");

    const downEvent = eventWithPrices("BTC", "2026-05-07T00:08:30.000Z", [103, 102, 101, 100]);
    const down = generateShortWindowSignal(downEvent, {
      candles: candles("BTC", "2026-05-07T00:05:00.000Z", [103, 102, 101, 100]),
      bid: 99.99,
      ask: 100.01,
      now: "2026-05-07T00:08:30.000Z",
      minConfidence: 0.2
    });
    assert.equal(down.side, "LONG_DOWN");
  });

  it("fails closed for stale data and waits for low confidence", () => {
    const event = eventWithPrices("BTC", "2026-05-07T00:08:30.000Z", [100, 100.1, 100.2, 100.3]);
    const stale = generateShortWindowSignal(event, {
      candles: candles("BTC", "2026-05-07T00:00:00.000Z", [100, 100.1]),
      now: "2026-05-07T00:08:30.000Z",
      staleAfterMs: 1_000
    });
    assert.equal(stale.side, "REJECTED");
    assert.ok(stale.rejectReasons.includes("STALE_PRICE"));

    const lowConfidence = generateShortWindowSignal(event, {
      candles: candles("BTC", "2026-05-07T00:05:00.000Z", [100, 100.1, 100.2, 100.3]),
      bid: 100.29,
      ask: 100.31,
      now: "2026-05-07T00:08:30.000Z",
      minConfidence: 0.95
    });
    assert.equal(lowConfidence.side, "WAIT");
    assert.ok(lowConfidence.isResearchOnly);
  });

  it("rejects unknown settlement rules", () => {
    const rule = buildShortWindowRuleTemplate({ venue: "binance-wallet-prediction", symbol: "BTC", interval: "5m" });
    const event = buildCurrentShortWindowEvent({
      symbol: "BTC",
      interval: "5m",
      venue: "binance-wallet-prediction",
      now: "2026-05-07T00:08:30.000Z",
      candles: candles("BTC", "2026-05-07T00:05:00.000Z", [100, 101, 102, 103]),
      rule
    });
    const signal = generateShortWindowSignal(event, { candles: [], now: "2026-05-07T00:08:30.000Z" });
    assert.equal(signal.side, "REJECTED");
    assert.ok(signal.rejectReasons.includes("UNVERIFIED_UNKNOWN_RULE"));
  });
});

describe("short-window replay", () => {
  it("returns deterministic mock metrics with wins losses waits and rejects", async () => {
    const replay = await runShortWindowReplay({ symbol: "BTC", interval: "5m", venue: "mock", window: "1d", useMock: true });
    assert.equal(replay.sourceType, "mock");
    assert.equal(replay.metrics.totalEvents, 6);
    assert.equal(replay.metrics.winCount, 2);
    assert.equal(replay.metrics.lossCount, 1);
    assert.equal(replay.metrics.waitCount, 2);
    assert.equal(replay.metrics.rejectedCount, 1);
    assert.equal(replay.metrics.actionableCount, 3);
    assert.equal(replay.metrics.winRate, 0.666667);
    assert.equal(replay.proxyBacktest, false);
  });

  it("splits historical windows and avoids future candles at signal generation time", () => {
    const rule = buildShortWindowRuleTemplate({ venue: "mock", symbol: "BTC", interval: "5m" });
    const source = candles("BTC", "2026-05-07T00:00:00.000Z", [100, 101, 102, 103, 150, 151, 152, 153, 154, 155]);
    const results = replayCandles({
      candles: source,
      windowStart: "2026-05-07T00:00:00.000Z",
      windowEnd: "2026-05-07T00:10:00.000Z",
      checkedAt,
      rule
    });
    assert.equal(results.length, 2);
    assert.equal(results[0]?.signal.currentPrice, 103);
    assert.notEqual(results[0]?.signal.currentPrice, 150);
  });

  it("live proxy replay marks proxyBacktest when rule is unverified", async () => {
    const replay = await runShortWindowReplay({
      symbol: "BTC",
      interval: "5m",
      venue: "proxy-generic",
      window: "1d",
      now: () => "2026-05-07T00:30:00.000Z",
      fetcher: shortHistoryFetcher
    });
    assert.equal(replay.sourceType, "live");
    assert.equal(replay.proxyBacktest, true);
    assert.ok(replay.metrics.warnings.some((warning) => warning.includes("Proxy")));
  });
});

function eventWithPrices(symbol: "BTC" | "ETH", now: string, closes: number[]) {
  const rule = buildShortWindowRuleTemplate({ venue: "mock", symbol, interval: "5m" });
  const source = candles(symbol, "2026-05-07T00:05:00.000Z", closes);
  return buildCurrentShortWindowEvent({ symbol, interval: "5m", venue: "mock", now, candles: source, rule });
}

function candles(symbol: "BTC" | "ETH", startTime: string, closes: number[]): Candle[] {
  const startMs = Date.parse(startTime);
  return closes.map((close, index) => {
    const timestamp = new Date(startMs + index * 60_000).toISOString();
    const open = index === 0 ? closes[0] ?? close : closes[index - 1] ?? close;
    return {
      source: "binance_spot_public",
      sourceType: "mock",
      provider: "binance-spot-public",
      symbol,
      interval: "1m",
      granularity: 60,
      productId: symbol === "BTC" ? "BTCUSDT" : "ETHUSDT",
      displaySymbol: symbol === "BTC" ? "BTCUSDT" : "ETHUSDT",
      openTime: timestamp,
      startTime: timestamp,
      timestamp,
      open,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      close,
      volume: 100 + index,
      isLive: false,
      isMock: true,
      isFixtureBacked: false,
      isClosed: true
    };
  });
}

const shortHistoryFetcher: FetchLike = async (url, init) => {
  assert.deepEqual(init.headers, { Accept: "application/json" });
  assert.equal("Authorization" in init.headers, false);
  const parsed = new URL(url);
  const startTime = Number(parsed.searchParams.get("startTime"));
  return jsonResponse(binanceRows(new Date(startTime).toISOString(), 20));
};

function binanceRows(startTime: string, count: number): unknown[] {
  const startMs = Date.parse(startTime);
  return Array.from({ length: count }, (_, index) => {
    const openTime = startMs + index * 60_000;
    const open = 100 + index;
    const close = open + (index % 5) - 2;
    return [
      openTime,
      String(open),
      String(Math.max(open, close) + 1),
      String(Math.min(open, close) - 1),
      String(close),
      "10",
      openTime + 59_000
    ];
  });
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body
  } as Response;
}
