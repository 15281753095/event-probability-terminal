import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildResearchSignal,
  buildResearchSignalFromOHLCV,
  buildFixtureEventSignalConsole,
  emptyFailClosedOHLCVResult,
  getResearchSignalFixture,
  listResearchSignals
} from "../src/index.js";
import type { Candle, OHLCVFetchRequest, OHLCVFetchResult, OhlcvCandle } from "@ept/shared-types";

const generatedAt = "2026-04-23T00:00:00.000Z";

describe("research signal engine v0", () => {
  it("emits deterministic LONG, SHORT, and NO_SIGNAL examples", () => {
    const response = listResearchSignals({ generatedAt });
    const byKey = new Map(response.signals.map((signal) => [`${signal.symbol}-${signal.horizon}`, signal]));

    assert.equal(response.meta.contractVersion, "ept-api-v1");
    assert.equal(response.meta.responseKind, "research_signal");
    assert.equal(response.meta.isResearchOnly, true);
    assert.equal(response.meta.isTradeAdvice, false);
    assert.equal(byKey.get("BTC-5m")?.direction, "LONG");
    assert.equal(byKey.get("ETH-5m")?.direction, "SHORT");
    assert.equal(byKey.get("BTC-10m")?.direction, "NO_SIGNAL");
    assert.equal(byKey.get("ETH-10m")?.direction, "NO_SIGNAL");
    assert.equal(byKey.get("BTC-5m")?.confluence.direction, "LONG");
    assert.equal(byKey.get("ETH-5m")?.confluence.direction, "SHORT");
    assert.ok((byKey.get("BTC-10m")?.confluence.vetoReasons.length ?? 0) > 0);
  });

  it("fails closed when candles are stale", () => {
    const fixture = getResearchSignalFixture("BTC", "5m");
    assert.ok(fixture);
    const signal = buildResearchSignal({
      symbol: fixture.symbol,
      horizon: fixture.horizon,
      candles: fixture.candles,
      context: fixture.context,
      generatedAt: "2026-04-23T01:30:00.000Z"
    });

    assert.equal(signal.direction, "NO_SIGNAL");
    assert.equal(signal.confidence, 0);
    assert.equal(signal.dataQuality.status, "stale");
    assert.ok(signal.failClosedReasons.some((reason) => reason.includes("stale")));
  });

  it("filters by symbol and horizon", () => {
    const response = listResearchSignals({ generatedAt, symbol: "BTC", horizon: "5m" });

    assert.equal(response.signals.length, 1);
    assert.equal(response.signals[0]?.symbol, "BTC");
    assert.equal(response.signals[0]?.horizon, "5m");
  });

  it("builds a live signal from an OHLCV fetch result", () => {
    const fixture = getResearchSignalFixture("BTC", "5m");
    assert.ok(fixture);
    const result: OHLCVFetchResult = {
      candles: fixture.candles.map(toLiveCandle),
      source: "coinbase_exchange",
      fetchedAt: generatedAt,
      freshness: {
        status: "fresh",
        latestStartTime: "2026-04-22T23:59:00.000Z",
        latestClosedAt: generatedAt,
        ageMs: 0,
        maxAgeMs: 180_000
      },
      warnings: [],
      failClosedReasons: [],
      isLive: true,
      isFixtureBacked: false
    };

    const signal = buildResearchSignalFromOHLCV({
      symbol: "BTC",
      horizon: "5m",
      generatedAt,
      result
    });

    assert.equal(signal.sourceMode, "live");
    assert.equal(signal.source, "coinbase_exchange");
    assert.equal(signal.dataQuality.isLive, true);
    assert.equal(signal.dataQuality.source, "coinbase_exchange");
    assert.notEqual(signal.direction, "NO_SIGNAL");
  });

  it("fails closed to NO_SIGNAL when live OHLCV fetching fails", () => {
    const request: OHLCVFetchRequest = {
      symbol: "BTC",
      interval: "1m",
      lookback: 35,
      sourceMode: "live",
      requestedAt: generatedAt
    };
    const signal = buildResearchSignalFromOHLCV({
      symbol: "BTC",
      horizon: "5m",
      generatedAt,
      result: emptyFailClosedOHLCVResult(request, generatedAt, "mock live OHLCV failure")
    });

    assert.equal(signal.direction, "NO_SIGNAL");
    assert.equal(signal.confidence, 0);
    assert.ok(signal.failClosedReasons.some((reason) => reason.includes("mock live OHLCV failure")));
  });

  it("vetoes chop and low-volatility conditions instead of forcing direction", () => {
    const fixture = getResearchSignalFixture("BTC", "10m");
    assert.ok(fixture);
    const signal = buildResearchSignal({
      symbol: fixture.symbol,
      horizon: fixture.horizon,
      candles: fixture.candles,
      context: fixture.context,
      generatedAt
    });

    assert.equal(signal.direction, "NO_SIGNAL");
    assert.ok(signal.confluence.vetoReasons.some((reason) => reason.includes("Chop veto")));
    assert.equal(signal.riskFilters.chop, "veto");
  });

  it("builds a console response with recent-only markers and disabled backtest by default", () => {
    const consoleResponse = buildFixtureEventSignalConsole({
      symbol: "BTC",
      horizon: "5m",
      generatedAt
    });

    assert.equal(consoleResponse.currentSignal.direction, "LONG");
    assert.equal(consoleResponse.confluence.direction, "LONG");
    assert.ok(consoleResponse.recentCandles.length <= 60);
    assert.ok(consoleResponse.recentMarkers.length <= 20);
    assert.equal(consoleResponse.recentMarkers.every((marker) => marker.isRecentOnly), true);
    assert.equal(consoleResponse.backtestPreview.enabled, false);
    assert.equal(consoleResponse.backtestPreview.status, "not_loaded");
  });

  it("runs lightweight backtest preview only when requested", () => {
    const consoleResponse = buildFixtureEventSignalConsole({
      symbol: "BTC",
      horizon: "5m",
      generatedAt,
      includeBacktest: true
    });

    assert.equal(consoleResponse.backtestPreview.enabled, true);
    assert.ok(consoleResponse.backtestPreview.status === "ready" || consoleResponse.backtestPreview.status === "insufficient");
    assert.ok(consoleResponse.backtestPreview.caveats.some((item) => item.includes("Small local candle sample")));
  });
});

function toLiveCandle(candle: OhlcvCandle): Candle {
  return {
    ...candle,
    source: "coinbase_exchange",
    symbol: "BTC",
    interval: "1m",
    startTime: candle.timestamp,
    isClosed: true
  };
}
