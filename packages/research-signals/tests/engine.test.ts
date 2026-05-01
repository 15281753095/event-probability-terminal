import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildResearchSignal,
  buildResearchSignalFromOHLCV,
  buildFixtureEventSignalConsole,
  emptyFailClosedOHLCVResult,
  evaluateConfluence,
  getSignalProfile,
  getResearchSignalFixture,
  listResearchSignals
} from "../src/index.js";
import type { Candle, OHLCVFetchRequest, OHLCVFetchResult, OhlcvCandle, ResearchSignal } from "@ept/shared-types";

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
    assert.equal(byKey.get("BTC-5m")?.profileName, "balanced");
    assert.equal(byKey.get("BTC-5m")?.confluence.profileName, "balanced");
    assert.ok((byKey.get("BTC-10m")?.confluence.vetoReasons.length ?? 0) > 0);
  });

  it("exposes balanced profile thresholds on console responses", () => {
    const consoleResponse = buildFixtureEventSignalConsole({
      symbol: "BTC",
      horizon: "5m",
      generatedAt
    });

    assert.equal(consoleResponse.profileName, "balanced");
    assert.equal(consoleResponse.currentSignal.profileName, "balanced");
    assert.equal(consoleResponse.confluence.profileName, "balanced");
    assert.ok(consoleResponse.confluence.reasons[0]?.includes("balanced profile threshold"));
  });

  it("configures balanced, conservative, and aggressive profiles per horizon", () => {
    const balanced = getSignalProfile("balanced");
    const conservative = getSignalProfile("conservative");
    const aggressive = getSignalProfile("aggressive");

    assert.ok(conservative.horizons["5m"].longThreshold > balanced.horizons["5m"].longThreshold);
    assert.ok(conservative.horizons["5m"].minConfidence > balanced.horizons["5m"].minConfidence);
    assert.ok(conservative.horizons["5m"].maxChopRisk < balanced.horizons["5m"].maxChopRisk);
    assert.ok(aggressive.horizons["5m"].longThreshold < balanced.horizons["5m"].longThreshold);
    assert.ok(aggressive.horizons["5m"].minDirectionalVolumeScore < balanced.horizons["5m"].minDirectionalVolumeScore);
    assert.notEqual(balanced.horizons["5m"].longThreshold, balanced.horizons["10m"].longThreshold);
    assert.ok(balanced.horizons["10m"].minTrendAbs > balanced.horizons["5m"].minTrendAbs);
  });

  it("applies selected profile to console scoring", () => {
    const conservative = buildFixtureEventSignalConsole({
      symbol: "BTC",
      horizon: "5m",
      generatedAt,
      profileName: "conservative"
    });
    const aggressive = buildFixtureEventSignalConsole({
      symbol: "BTC",
      horizon: "5m",
      generatedAt,
      profileName: "aggressive"
    });

    assert.equal(conservative.profileName, "conservative");
    assert.equal(conservative.currentSignal.profileName, "conservative");
    assert.equal(aggressive.profileName, "aggressive");
    assert.equal(aggressive.currentSignal.profileName, "aggressive");
    assert.ok(conservative.confluence.reasons[0]?.includes("conservative profile threshold"));
    assert.ok(aggressive.confluence.reasons[0]?.includes("aggressive profile threshold"));
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

  it("vetoes flat EMA, flat MACD, and narrow volatility no-trade conditions", () => {
    const fixture = getResearchSignalFixture("BTC", "5m");
    assert.ok(fixture);
    const flatCandles = fixture.candles.map((candle, index) => ({
      ...candle,
      open: 100_000 + index * 0.2,
      high: 100_001 + index * 0.2,
      low: 99_999 + index * 0.2,
      close: 100_000 + index * 0.2,
      volume: 1_000
    }));
    const signal = buildResearchSignal({
      symbol: "BTC",
      horizon: "5m",
      candles: flatCandles,
      generatedAt
    });

    assert.equal(signal.direction, "NO_SIGNAL");
    assert.equal(signal.confidence, 0);
    assert.ok(signal.confluence.vetoReasons.some((reason) => reason.includes("EMA slope is too flat")));
    assert.ok(signal.confluence.vetoReasons.some((reason) => reason.includes("MACD histogram is too flat")));
    assert.ok(signal.confluence.vetoReasons.some((reason) => reason.includes("too-low volatility")));
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
    assert.equal(consoleResponse.eventWindow.horizon, "5m");
    assert.equal(consoleResponse.eventWindow.canObserve, true);
    assert.equal(consoleResponse.eventWindow.isReferenceApproximation, true);
    assert.equal(consoleResponse.observationCandidate.profileName, "balanced");
    assert.equal(consoleResponse.observationPreview.enabled, false);
    assert.equal(consoleResponse.observationPreview.status, "not_loaded");
    assert.equal(consoleResponse.backtestPreview.enabled, false);
    assert.equal(consoleResponse.backtestPreview.status, "not_loaded");
  });

  it("runs small-sample observation preview only when requested", () => {
    const consoleResponse = buildFixtureEventSignalConsole({
      symbol: "BTC",
      horizon: "5m",
      generatedAt,
      includeObservationPreview: true
    });

    assert.equal(consoleResponse.observationPreview.enabled, true);
    assert.ok(consoleResponse.observationPreview.status === "ready" || consoleResponse.observationPreview.status === "insufficient");
    assert.ok(consoleResponse.observationPreview.caveats.some((item) => item.includes("Small local candle sample")));
    assert.equal(consoleResponse.backtestPreview.winRate, consoleResponse.observationPreview.directionalMatchRate);
  });

  it("vetoes extreme volatility and event-risk conditions", () => {
    const fixture = getResearchSignalFixture("BTC", "5m");
    assert.ok(fixture);
    const volatileCandles = fixture.candles.map((candle, index) => ({
      ...candle,
      open: 100_000,
      high: 108_000 + index * 10,
      low: 92_000 - index * 10,
      close: index % 2 === 0 ? 107_000 : 93_000,
      volume: 5_000
    }));
    const volatileSignal = buildResearchSignal({
      symbol: "BTC",
      horizon: "5m",
      candles: volatileCandles,
      generatedAt
    });
    const eventRiskSignal = buildResearchSignal({
      symbol: "BTC",
      horizon: "5m",
      candles: fixture.candles,
      generatedAt,
      context: {
        sourceMode: "manual_fixture",
        newsScore: 0,
        xSignalScore: 0,
        macroRiskState: "neutral",
        marketEventRiskFlag: true,
        notes: ["test event-risk flag"]
      }
    });

    assert.equal(volatileSignal.direction, "NO_SIGNAL");
    assert.ok(volatileSignal.confluence.vetoReasons.some((reason) => reason.includes("extreme short-horizon volatility")));
    assert.equal(eventRiskSignal.direction, "NO_SIGNAL");
    assert.ok(eventRiskSignal.confluence.vetoReasons.some((reason) => reason.includes("event-risk flag")));
  });

  it("vetoes trend/momentum, price/volume, and RSI continuation conflicts", () => {
    const base = buildConfluenceInput();
    const trendMomentum = evaluateConfluence({
      ...base,
      features: {
        ...base.features,
        returns: { oneMinute: -0.004, threeMinute: -0.006, fiveMinute: -0.008 },
        ema: { fast: 101, slow: 100, slope: 0.08 },
        macd: { line: -1, signal: -0.2, histogram: -0.8, histogramSlope: -0.1 },
        volume: { latest: 2_000, mean: 1_000, zScore: 2, abnormal: true }
      }
    });
    const priceVolume = evaluateConfluence({
      ...base,
      features: {
        ...base.features,
        returns: { oneMinute: 0.004, threeMinute: 0.006, fiveMinute: 0.008 },
        volume: { latest: 2_000, mean: 1_000, zScore: -2, abnormal: true }
      }
    });
    const rsiConflict = evaluateConfluence({
      ...base,
      features: {
        ...base.features,
        returns: { oneMinute: -0.004, threeMinute: -0.006, fiveMinute: -0.008 },
        ema: { fast: 101, slow: 100, slope: 0.08 },
        rsi: { value: 78, period: 14 },
        macd: { line: -1, signal: -0.2, histogram: -0.8, histogramSlope: -0.1 }
      }
    });

    assert.ok(trendMomentum.confluence.vetoReasons.some((reason) => reason.includes("trend and momentum")));
    assert.ok(priceVolume.confluence.vetoReasons.some((reason) => reason.includes("price action and volume")));
    assert.ok(rsiConflict.confluence.vetoReasons.some((reason) => reason.includes("RSI reversal risk")));
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

function buildConfluenceInput(): Parameters<typeof evaluateConfluence>[0] {
  const features: ResearchSignal["features"] = {
    lastClose: 102,
    returns: { oneMinute: 0.004, threeMinute: 0.006, fiveMinute: 0.008 },
    ema: { fast: 101, slow: 100, slope: 0.08 },
    rsi: { value: 50, period: 14 },
    macd: { line: 1, signal: 0.2, histogram: 0.8, histogramSlope: 0.1 },
    bollinger: {
      middle: 100,
      upper: 103,
      lower: 97,
      bandwidth: 0.03,
      bandPosition: 0.75,
      squeeze: false,
      expansion: true
    },
    volatility: { atr: 1.2, realizedVolatility: 0.001, regime: "normal" },
    volume: { latest: 2_000, mean: 1_000, zScore: 2, abnormal: true }
  };
  return {
    horizon: "5m",
    features,
    dataQuality: {
      status: "ok",
      source: "fixture",
      candleCount: 35,
      requiredCandleCount: 35,
      freshnessAgeMs: 60_000,
      maxFreshnessMs: 180_000,
      freshness: {
        status: "fresh",
        latestStartTime: "2026-04-22T23:59:00.000Z",
        latestClosedAt: generatedAt,
        ageMs: 60_000,
        maxAgeMs: 180_000
      },
      missingFields: [],
      warnings: [],
      isLive: false,
      isFixtureBacked: true
    },
    context: {
      sourceMode: "manual_fixture",
      newsScore: 0,
      xSignalScore: 0,
      macroRiskState: "neutral",
      marketEventRiskFlag: false,
      notes: []
    }
  };
}
