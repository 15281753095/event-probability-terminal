import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createJsonlResearchStore,
  emptyFailClosedOHLCVResult,
  getResearchSignalFixture,
  type CaptureRunRecord,
  type LiveMarketDataFetchRequest,
  type ReplayResultRecord,
  type StrategyLabResultRecord
} from "@ept/research-signals";
import {
  API_CONTRACT_VERSION,
  type ApiErrorResponse,
  type Candle,
  type EventSignalConsoleResponse,
  type FairValueSignalResponse,
  type LiveMarketDataSource,
  type LiveMarketDataResponse,
  type OHLCVFetchResult,
  type OhlcvCandle,
  type OhlcvSource,
  type PolymarketActiveMarketsResponse,
  type RealtimePriceSsePayload,
  type ResearchSignalsResponse,
  type SignalReplayResponse,
  type StrategyLabReport
} from "@ept/shared-types";
import { buildServer } from "../src/server.js";

const fixedGeneratedAt = "2026-04-23T00:00:00.000Z";

describe("research signals API", () => {
  it("returns research store status and capture runs without private fields", async () => {
    const store = createApiTestStore();
    await store.init();
    await store.recordCaptureRun(mockCaptureRun());
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt, researchStore: store });
    const statusResponse = await server.inject({ method: "GET", url: "/store/status" });
    const runsResponse = await server.inject({ method: "GET", url: "/capture/runs" });

    assert.equal(statusResponse.statusCode, 200);
    assert.equal(runsResponse.statusCode, 200);
    const statusPayload = statusResponse.json<{ counts: Record<string, number>; captureKind: string }>();
    assert.equal(statusPayload.captureKind, "public-read-only");
    assert.equal(statusPayload.counts.capture_runs, 1);
    assertNoPrivateTradingFields(statusResponse.body);
    assertNoPrivateTradingFields(runsResponse.body);

    await server.close();
  });

  it("returns stored replay result or a missing warning", async () => {
    const store = createApiTestStore();
    await store.init();
    await store.insertReplayResult(mockReplayResult());
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt, researchStore: store });

    const storedResponse = await server.inject({
      method: "GET",
      url: "/signals/replay/stored?symbol=BTC&window=1w"
    });
    assert.equal(storedResponse.statusCode, 200);
    const storedPayload = storedResponse.json<{ status: string; source: string; storedSampleCount: number }>();
    assert.equal(storedPayload.status, "ok");
    assert.equal(storedPayload.source, "stored");
    assert.equal(storedPayload.storedSampleCount, 0);
    assertNoPrivateTradingFields(storedResponse.body);

    const missingResponse = await server.inject({
      method: "GET",
      url: "/signals/replay/stored?symbol=ETH&window=1w"
    });
    assert.equal(missingResponse.statusCode, 200);
    assert.ok(missingResponse.json<{ warnings: string[] }>().warnings.includes("NO_STORED_REPLAY_RESULT"));

    await server.close();
  });

  it("returns stored strategy lab result or a missing warning", async () => {
    const store = createApiTestStore();
    await store.init();
    await store.insertStrategyLabResult(mockStrategyLabResult());
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt, researchStore: store });

    const storedResponse = await server.inject({
      method: "GET",
      url: "/strategy-lab/stored?symbol=BTC&window=1w"
    });
    assert.equal(storedResponse.statusCode, 200);
    const storedPayload = storedResponse.json<{ status: string; source: string; latestStoredAt: string }>();
    assert.equal(storedPayload.status, "ok");
    assert.equal(storedPayload.source, "stored");
    assert.equal(storedPayload.latestStoredAt, fixedGeneratedAt);
    assertNoPrivateTradingFields(storedResponse.body);

    const missingResponse = await server.inject({
      method: "GET",
      url: "/strategy-lab/stored?symbol=ETH&window=1w"
    });
    assert.equal(missingResponse.statusCode, 200);
    assert.ok(missingResponse.json<{ warnings: string[] }>().warnings.includes("NO_STORED_STRATEGY_LAB_RESULT"));

    await server.close();
  });

  it("runs manual capture in mock mode through public capture endpoint", async () => {
    const previous = process.env.EPT_LIVE_MARKET_DATA_MOCK;
    process.env.EPT_LIVE_MARKET_DATA_MOCK = "true";
    const store = createApiTestStore();
    await store.init();
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt, researchStore: store });
    try {
      const response = await server.inject({
        method: "POST",
        url: "/capture/run?job=binance"
      });
      assert.equal(response.statusCode, 200);
      const payload = response.json<{ results: Array<{ sourceType: string; recordsInserted: number }> }>();
      assert.equal(payload.results[0]?.sourceType, "mock");
      assert.ok((payload.results[0]?.recordsInserted ?? 0) > 0);
      assertNoPrivateTradingFields(response.body);
    } finally {
      await server.close();
      if (previous === undefined) {
        delete process.env.EPT_LIVE_MARKET_DATA_MOCK;
      } else {
        process.env.EPT_LIVE_MARKET_DATA_MOCK = previous;
      }
    }
  });

  it("returns fixture-backed research signals", async () => {
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt });
    const response = await server.inject({
      method: "GET",
      url: "/signals/research"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<ResearchSignalsResponse>();
    assert.equal(payload.meta.contractVersion, API_CONTRACT_VERSION);
    assert.equal(payload.meta.responseKind, "research_signal");
    assert.equal(payload.meta.mode, "fixture");
    assert.equal(payload.meta.sourceName, "fixture");
    assert.equal(payload.meta.isReadOnly, true);
    assert.equal(payload.meta.isResearchOnly, true);
    assert.equal(payload.meta.isTradeAdvice, false);
    assert.equal(payload.signals.length, 4);
    assert.ok(payload.signals.some((signal) => signal.symbol === "BTC" && signal.horizon === "5m" && signal.direction === "LONG"));
    assert.ok(payload.signals.some((signal) => signal.symbol === "ETH" && signal.horizon === "5m" && signal.direction === "SHORT"));
    assert.ok(payload.signals.every((signal) => signal.isResearchOnly && !signal.isTradeAdvice));
    assert.ok(payload.signals.every((signal) => signal.profileName === "balanced"));

    await server.close();
  });

  it("returns live research signals with a mocked OHLCV adapter", async () => {
    const fixture = getResearchSignalFixture("BTC", "5m");
    assert.ok(fixture);
    const server = buildServer({
      logger: false,
      now: () => fixedGeneratedAt,
      researchSignalOhlcvFetcher: async (request) => ({
        candles: fixture.candles.map((candle) => toLiveCandle(candle, request.symbol)),
        source: "coinbase_exchange",
        sourceType: "live",
        provider: "coinbase-exchange",
        productId: request.symbol === "BTC" ? "BTC-USD" : "ETH-USD",
        displaySymbol: request.symbol === "BTC" ? "BTC-USD" : "ETH-USD",
        candleGranularity: 60,
        candleCount: fixture.candles.length,
        lastCandleTime: fixture.candles.at(-1)?.timestamp ?? null,
        fetchedAt: fixedGeneratedAt,
        freshness: {
          status: "fresh",
          latestStartTime: "2026-04-22T23:59:00.000Z",
          latestClosedAt: fixedGeneratedAt,
          ageMs: 0,
          maxAgeMs: 180_000
        },
        warnings: [],
        failClosedReasons: [],
        isLive: true,
        isMock: false,
        isFixtureBacked: false
      } satisfies OHLCVFetchResult)
    });
    const response = await server.inject({
      method: "GET",
      url: "/signals/research?symbol=BTC&horizon=5m&sourceMode=live"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<ResearchSignalsResponse>();
    assert.equal(payload.meta.mode, "live");
    assert.equal(payload.meta.sourceName, "coinbase_exchange");
    assert.equal(payload.meta.isFixtureBacked, false);
    assert.equal(payload.signals.length, 1);
    assert.equal(payload.signals[0]?.sourceMode, "live");
    assert.equal(payload.signals[0]?.source, "coinbase_exchange");
    assert.equal(payload.signals[0]?.dataQuality.isLive, true);

    await server.close();
  });

  it("returns NO_SIGNAL instead of HTTP 500 when live OHLCV fails closed", async () => {
    const server = buildServer({
      logger: false,
      now: () => fixedGeneratedAt,
      researchSignalOhlcvFetcher: async (request) =>
        emptyFailClosedOHLCVResult(request, fixedGeneratedAt, "mock Coinbase network failure")
    });
    const response = await server.inject({
      method: "GET",
      url: "/signals/research?symbol=BTC&horizon=5m&sourceMode=live"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<ResearchSignalsResponse>();
    assert.equal(payload.signals.length, 1);
    assert.equal(payload.signals[0]?.direction, "NO_SIGNAL");
    assert.equal(payload.signals[0]?.confidence, 0);
    assert.ok(payload.signals[0]?.failClosedReasons.some((reason) => reason.includes("mock Coinbase network failure")));

    await server.close();
  });

  it("defaults /market-data/live to a mocked Binance public ticker and candle packet", async () => {
    const server = buildServer({
      logger: false,
      now: () => fixedGeneratedAt,
      liveMarketDataFetcher: async (request) => mockLiveMarketData(request)
    });
    const response = await server.inject({
      method: "GET",
      url: "/market-data/live?symbol=BTC"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<LiveMarketDataResponse>();
    assert.equal(payload.symbol, "BTC");
    assert.equal(payload.source, "binance-spot-public");
    assert.equal(payload.sourceType, "live");
    assert.equal(payload.provider, "binance-spot-public");
    assert.equal(payload.productId, "BTCUSDT");
    assert.equal(payload.displaySymbol, "BTCUSDT");
    assert.equal(payload.fetchedAt, fixedGeneratedAt);
    assert.equal(payload.latestPrice, 100.8);
    assert.equal(payload.bid, 100.7);
    assert.equal(payload.ask, 100.9);
    assert.equal(payload.tickerTime, fixedGeneratedAt);
    assert.equal(payload.tickerFreshnessSeconds, 0);
    assert.equal(payload.candleInterval, "1m");
    assert.equal(payload.candleGranularity, 60);
    assert.equal(payload.candleCount, 80);
    assert.equal(payload.lastCandleTime, payload.latestCandleTime);
    assert.equal(payload.isLive, true);
    assert.equal(payload.isMock, false);
    assert.equal(payload.isFixtureBacked, false);
    assert.equal(payload.provenance.provider, "binance-spot-public");
    assert.equal(payload.provenance.displaySymbol, "BTCUSDT");
    assert.deepEqual(payload.failClosedReasons, []);
    assert.equal(payload.providerHealth.status, "ok");
    assert.equal(payload.providerHealth.fallbackUsed, false);
    assert.equal(payload.providerHealth.sourceType, "live");
    assert.equal(payload.providerHealth.resolvedProvider, "binance-spot-public");

    await server.close();
  });

  it("supports /market-data/live provider=coinbase interval selection without fixture fallback", async () => {
    let requestedInterval: string | undefined;
    const server = buildServer({
      logger: false,
      now: () => fixedGeneratedAt,
      liveMarketDataFetcher: async (request) => {
        requestedInterval = request.interval;
        return mockLiveMarketData(request);
      }
    });
    const response = await server.inject({
      method: "GET",
      url: "/market-data/live?symbol=ETH&interval=15m&provider=coinbase"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<LiveMarketDataResponse>();
    assert.equal(requestedInterval, "15m");
    assert.equal(payload.symbol, "ETH");
    assert.equal(payload.provider, "coinbase-exchange");
    assert.equal(payload.productId, "ETH-USD");
    assert.equal(payload.displaySymbol, "ETH-USD");
    assert.equal(payload.candleInterval, "15m");
    assert.equal(payload.candleGranularity, 900);
    assert.equal(payload.sourceType, "live");
    assert.equal(payload.isLive, true);
    assert.equal(payload.isMock, false);
    assert.equal(payload.isFixtureBacked, false);
    assert.ok(payload.candles.every((candle) => candle.interval === "15m"));
    assert.ok(payload.candles.every((candle) => candle.sourceType === "live"));

    await server.close();
  });

  it("marks EPT_LIVE_MARKET_DATA_MOCK packets as sourceType mock", async () => {
    const previous = process.env.EPT_LIVE_MARKET_DATA_MOCK;
    process.env.EPT_LIVE_MARKET_DATA_MOCK = "true";
    const server = buildServer({
      logger: false,
      now: () => fixedGeneratedAt
    });
    try {
      const response = await server.inject({
        method: "GET",
        url: "/market-data/live?symbol=BTC&provider=binance"
      });

      assert.equal(response.statusCode, 200);
      const payload = response.json<LiveMarketDataResponse>();
      assert.equal(payload.provider, "binance-spot-public");
      assert.equal(payload.displaySymbol, "BTCUSDT");
      assert.equal(payload.sourceType, "mock");
      assert.equal(payload.isLive, false);
    assert.equal(payload.isMock, true);
    assert.equal(payload.isFixtureBacked, false);
      assert.equal(payload.providerHealth.requestedProvider, "mock");
      assert.equal(payload.providerHealth.resolvedProvider, "mock");
      assert.equal(payload.providerHealth.sourceType, "mock");
    } finally {
      await server.close();
      if (previous === undefined) {
        delete process.env.EPT_LIVE_MARKET_DATA_MOCK;
      } else {
        process.env.EPT_LIVE_MARKET_DATA_MOCK = previous;
      }
    }
  });

  it("returns /market-data/live fail-closed when mocked live ticker fails", async () => {
    const server = buildServer({
      logger: false,
      now: () => fixedGeneratedAt,
      liveMarketDataFetcher: async (request) =>
        mockLiveMarketData(request, {
          latestPrice: null,
          bid: null,
          ask: null,
          tickerTime: null,
          tickerFreshnessSeconds: null,
          failClosedReasons: ["Live data unavailable: mock ticker failure"],
          warnings: ["Live data unavailable: mock ticker failure"]
        })
    });
    const response = await server.inject({
      method: "GET",
      url: "/market-data/live?symbol=ETH"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<LiveMarketDataResponse>();
    assert.equal(payload.symbol, "ETH");
    assert.equal(payload.latestPrice, null);
    assert.ok(payload.failClosedReasons.some((reason) => reason.includes("mock ticker failure")));
    assert.equal(payload.isFixtureBacked, false);

    await server.close();
  });

  it("returns /market-data/live fail-closed when mocked live candles fail", async () => {
    const server = buildServer({
      logger: false,
      now: () => fixedGeneratedAt,
      liveMarketDataFetcher: async (request) =>
        mockLiveMarketData(request, {
          candles: [],
          candleCount: 0,
          latestCandleTime: null,
          candleFreshnessSeconds: null,
          failClosedReasons: ["Coinbase Exchange candles request failed with mock HTTP 503."],
          warnings: ["Coinbase Exchange candles request failed with mock HTTP 503."]
        })
    });
    const response = await server.inject({
      method: "GET",
      url: "/market-data/live?symbol=BTC"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<LiveMarketDataResponse>();
    assert.equal(payload.latestPrice, 100.8);
    assert.equal(payload.candleCount, 0);
    assert.ok(payload.failClosedReasons.some((reason) => reason.includes("mock HTTP 503")));
    assert.equal(payload.isFixtureBacked, false);

    await server.close();
  });

  it("filters research signals by symbol and horizon", async () => {
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt });
    const response = await server.inject({
      method: "GET",
      url: "/signals/research?symbol=BTC&horizon=5m"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<ResearchSignalsResponse>();
    assert.equal(payload.signals.length, 1);
    assert.equal(payload.signals[0]?.symbol, "BTC");
    assert.equal(payload.signals[0]?.horizon, "5m");

    await server.close();
  });

  it("returns typed errors for unsupported research signal filters", async () => {
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt });
    const response = await server.inject({
      method: "GET",
      url: "/signals/research?symbol=DOGE"
    });

    assert.equal(response.statusCode, 400);
    const payload = response.json<ApiErrorResponse>();
    assert.equal(payload.contractVersion, API_CONTRACT_VERSION);
    assert.equal(payload.status, "unsupported");
    assert.equal(payload.error, "out_of_scope");
    assert.equal(payload.generatedAt, fixedGeneratedAt);

    await server.close();
  });

  it("returns typed errors for unsupported research signal sourceMode", async () => {
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt });
    const response = await server.inject({
      method: "GET",
      url: "/signals/research?sourceMode=paper"
    });

    assert.equal(response.statusCode, 400);
    const payload = response.json<ApiErrorResponse>();
    assert.equal(payload.contractVersion, API_CONTRACT_VERSION);
    assert.equal(payload.status, "unsupported");
    assert.equal(payload.error, "out_of_scope");

    await server.close();
  });

  it("returns typed errors for unsupported console profile", async () => {
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt });
    const response = await server.inject({
      method: "GET",
      url: "/signals/console?profile=max-risk"
    });

    assert.equal(response.statusCode, 400);
    const payload = response.json<ApiErrorResponse>();
    assert.equal(payload.contractVersion, API_CONTRACT_VERSION);
    assert.equal(payload.status, "unsupported");
    assert.equal(payload.error, "out_of_scope");

    await server.close();
  });

  it("defaults /signals/console to live sourceMode with mocked live market data", async () => {
    const server = buildServer({
      logger: false,
      now: () => fixedGeneratedAt,
      liveMarketDataFetcher: async (request) => mockLiveMarketData(request)
    });
    const response = await server.inject({
      method: "GET",
      url: "/signals/console?symbol=BTC&horizon=5m"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<EventSignalConsoleResponse>();
    assert.equal(payload.meta.contractVersion, API_CONTRACT_VERSION);
    assert.equal(payload.meta.responseKind, "event_signal_console");
    assert.equal(payload.meta.mode, "live");
    assert.equal(payload.meta.sourceType, "live");
    assert.equal(payload.meta.isFixtureBacked, false);
    assert.equal(payload.sourceMode, "live");
    assert.equal(payload.dataProvenance.sourceType, "live");
    assert.equal(payload.dataProvenance.provider, "binance-spot-public");
    assert.equal(payload.dataProvenance.displaySymbol, "BTCUSDT");
    assert.equal(payload.eventWindow.provider, "binance-spot-public");
    assert.equal(payload.eventWindow.displaySymbol, "BTCUSDT");
    assert.equal(payload.currentSignal.dataQuality.isLive, true);
    assert.equal(payload.currentSignal.dataQuality.isFixtureBacked, false);
    assert.equal(payload.eventWindow.currentPrice, 100.8);
    assert.ok(payload.recentCandles.length > 0);
    assert.ok(payload.recentMarkers.length <= 10);
    assert.equal(payload.providerHealth.status, "ok");
    assert.equal(payload.providerHealth.fallbackUsed, false);
    assert.equal(payload.providerHealth.resolvedProvider, "binance-spot-public");
    assert.equal(payload.currentSignal.failClosedReasons.length, 0);

    await server.close();
  });

  it("returns an explicitly fixture-backed Event Signal Console with backtest disabled by default", async () => {
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt });
    const response = await server.inject({
      method: "GET",
      url: "/signals/console?symbol=BTC&horizon=5m&sourceMode=fixture"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<EventSignalConsoleResponse>();
    assert.equal(payload.meta.contractVersion, API_CONTRACT_VERSION);
    assert.equal(payload.meta.responseKind, "event_signal_console");
    assert.equal(payload.meta.mode, "fixture");
    assert.equal(payload.meta.sourceType, "fixture");
    assert.equal(payload.dataProvenance.sourceType, "fixture");
    assert.equal(payload.profileName, "balanced");
    assert.equal(payload.currentSignal.direction, "LONG");
    assert.equal(payload.currentSignal.profileName, "balanced");
    assert.equal(payload.currentSignal.isTradeAdvice, false);
    assert.equal(payload.confluence.direction, "LONG");
    assert.equal(payload.riskFilters.dataFreshness, "pass");
    assert.ok(payload.recentCandles.length > 0);
    assert.ok(payload.recentMarkers.length <= 10);
    assert.equal(payload.recentMarkers.every((marker) => marker.isRecentOnly), true);
    assert.equal(payload.eventWindow.horizon, "5m");
    assert.equal(payload.eventWindow.canObserve, true);
    assert.equal(payload.eventWindow.isReferenceApproximation, true);
    assert.equal(payload.observationCandidate.profileName, "balanced");
    assert.equal(payload.observationCandidate.sourceMode, "fixture");
    assert.equal(payload.observationPreview.enabled, false);
    assert.equal(payload.observationPreview.status, "not_loaded");
    assert.equal(payload.backtestPreview.enabled, false);
    assert.equal(payload.backtestPreview.status, "not_loaded");
    assert.ok(payload.warnings.some((warning) => warning.includes("Research only")));

    await server.close();
  });

  it("supports profile query param and event-window fields", async () => {
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt });
    const response = await server.inject({
      method: "GET",
      url: "/signals/console?symbol=BTC&horizon=10m&profile=conservative&sourceMode=fixture"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<EventSignalConsoleResponse>();
    assert.equal(payload.profileName, "conservative");
    assert.equal(payload.currentSignal.profileName, "conservative");
    assert.equal(payload.eventWindow.horizon, "10m");
    assert.equal(payload.eventWindow.expectedResolveAt, "2026-04-23T00:09:00.000Z");
    assert.equal(payload.observationCandidate.profileName, "conservative");

    await server.close();
  });

  it("loads small-sample observation preview only when explicitly requested", async () => {
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt });
    const response = await server.inject({
      method: "GET",
      url: "/signals/console?symbol=BTC&horizon=5m&includeObservationPreview=true&sourceMode=fixture"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<EventSignalConsoleResponse>();
    assert.equal(payload.observationPreview.enabled, true);
    assert.ok(payload.observationPreview.status === "ready" || payload.observationPreview.status === "insufficient");
    assert.ok(payload.observationPreview.caveats.some((caveat) => caveat.includes("Small local candle sample")));
    assert.ok(payload.observationPreview.caveats.some((caveat) => caveat.includes("not predictive guarantee")));
    assert.equal(payload.backtestPreview.enabled, true);
    assert.ok(payload.backtestPreview.status === "ready" || payload.backtestPreview.status === "insufficient");
    assert.equal(payload.backtestPreview.winRate, payload.observationPreview.directionalMatchRate);

    await server.close();
  });

  it("returns live Event Signal Console fail-closed with a mocked market-data failure", async () => {
    const server = buildServer({
      logger: false,
      now: () => fixedGeneratedAt,
      liveMarketDataFetcher: async (request) =>
        mockLiveMarketData(request, {
          latestPrice: null,
          bid: null,
          ask: null,
          tickerTime: null,
          tickerFreshnessSeconds: null,
          candles: [],
          candleCount: 0,
          latestCandleTime: null,
          candleFreshnessSeconds: null,
          failClosedReasons: ["Live data unavailable: mock console Binance failure"],
          warnings: ["Live data unavailable: mock console Binance failure"]
        })
    });
    const response = await server.inject({
      method: "GET",
      url: "/signals/console?symbol=BTC&horizon=5m&sourceMode=live"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<EventSignalConsoleResponse>();
    assert.equal(payload.meta.mode, "live");
    assert.equal(payload.currentSignal.direction, "NO_SIGNAL");
    assert.equal(payload.currentSignal.confidence, 0);
    assert.ok(payload.confluence.vetoReasons.some((reason) => reason.includes("mock console Binance failure")));
    assert.equal(payload.recentCandles.length, 0);

    await server.close();
  });

  it("falls back transparently from Binance to Coinbase when Binance market data fails", async () => {
    const server = buildServer({
      logger: false,
      now: () => fixedGeneratedAt,
      liveMarketDataFetcher: async (request) =>
        request.provider === "coinbase-exchange"
          ? mockLiveMarketData(request)
          : mockLiveMarketData(request, {
              latestPrice: null,
              bid: null,
              ask: null,
              tickerTime: null,
              tickerFreshnessSeconds: null,
              candles: [],
              candleCount: 0,
              latestCandleTime: null,
              lastCandleTime: null,
              candleFreshnessSeconds: null,
              failClosedReasons: ["Live data unavailable: mock Binance timeout"],
              warnings: ["Live data unavailable: mock Binance timeout"]
            })
    });
    const response = await server.inject({
      method: "GET",
      url: "/market-data/live?symbol=BTC&provider=binance"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<LiveMarketDataResponse>();
    assert.equal(payload.provider, "coinbase-exchange");
    assert.equal(payload.providerHealth.requestedProvider, "binance");
    assert.equal(payload.providerHealth.resolvedProvider, "coinbase-exchange");
    assert.equal(payload.providerHealth.status, "degraded");
    assert.equal(payload.providerHealth.fallbackUsed, true);
    assert.ok(payload.providerHealth.fallbackReason?.includes("mock Binance timeout"));
    assert.equal(payload.providerHealth.sourceType, "live");

    await server.close();
  });

  it("streams deterministic mock realtime ticks over SSE without private fields", async () => {
    const previous = process.env.EPT_LIVE_MARKET_DATA_MOCK;
    process.env.EPT_LIVE_MARKET_DATA_MOCK = "true";
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt });
    try {
      const response = await server.inject({
        method: "GET",
        url: "/market-data/realtime?symbol=BTC&provider=binance&once=true"
      });

      assert.equal(response.statusCode, 200);
      assert.match(response.headers["content-type"] as string, /text\/event-stream/);
      assert.match(response.body, /event: price/);
      const payload = parseFirstPriceSsePayload(response.body);
      assert.equal(payload.symbol, "BTC");
      assert.equal(payload.displaySymbol, "BTCUSDT");
      assert.equal(payload.provider, "mock");
      assert.equal(payload.sourceType, "mock");
      assert.equal(payload.connectionStatus, "open");
      assert.equal(payload.providerHealth.requestedProvider, "mock");
      assert.equal(payload.providerHealth.resolvedProvider, "mock");
      assert.ok(payload.price !== null);
      assert.equal(/account|order|balance|position|listenKey|apiKey|secret/i.test(response.body), false);
    } finally {
      await server.close();
      if (previous === undefined) {
        delete process.env.EPT_LIVE_MARKET_DATA_MOCK;
      } else {
        process.env.EPT_LIVE_MARKET_DATA_MOCK = previous;
      }
    }
  });

  it("marks research strategies as research-only in the console payload", async () => {
    const server = buildServer({
      logger: false,
      now: () => fixedGeneratedAt,
      liveMarketDataFetcher: async (request) => mockLiveMarketData(request)
    });
    const response = await server.inject({
      method: "GET",
      url: "/signals/console?symbol=BTC&horizon=5m"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<EventSignalConsoleResponse>();
    assert.ok(payload.researchStrategies.registryCount >= 1);
    assert.equal(payload.researchStrategies.backtestScaffoldStatus, "research_only");
    assert.equal(payload.researchStrategies.productionEnabled, false);

    await server.close();
  });

  it("returns deterministic mock Polymarket active markets without private fields", async () => {
    const previousMarketMock = process.env.EPT_POLYMARKET_MOCK;
    const previousLiveMock = process.env.EPT_LIVE_MARKET_DATA_MOCK;
    process.env.EPT_POLYMARKET_MOCK = "true";
    process.env.EPT_LIVE_MARKET_DATA_MOCK = "true";
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt });
    try {
      const response = await server.inject({
        method: "GET",
        url: "/markets/polymarket/active?symbol=BTC"
      });

      assert.equal(response.statusCode, 200);
      const payload = response.json<PolymarketActiveMarketsResponse>();
      assert.equal(payload.symbol, "BTC");
      assert.equal(payload.sourceType, "mock");
      assert.equal(payload.providerHealth.requestedProvider, "mock");
      assert.ok(payload.markets.length >= 2);
      assert.ok(payload.markets.every((market) => market.symbol === "BTC"));
      assert.ok(payload.markets.every((market) => market.market.clobTokenIds.length === 2));
      assert.ok(payload.markets.every((market) => market.odds.impliedProbabilityYes !== null));
      assert.equal(/privateKey|apiKey|secret|passphrase|order|cancel|balance|position/i.test(response.body), false);
    } finally {
      await server.close();
      restoreEnv("EPT_POLYMARKET_MOCK", previousMarketMock);
      restoreEnv("EPT_LIVE_MARKET_DATA_MOCK", previousLiveMock);
    }
  });

  it("returns an explanatory empty Polymarket active markets response", async () => {
    const previousMarketMock = process.env.EPT_POLYMARKET_MOCK;
    const previousEmpty = process.env.EPT_POLYMARKET_MOCK_EMPTY;
    const previousLiveMock = process.env.EPT_LIVE_MARKET_DATA_MOCK;
    process.env.EPT_POLYMARKET_MOCK = "true";
    process.env.EPT_POLYMARKET_MOCK_EMPTY = "true";
    process.env.EPT_LIVE_MARKET_DATA_MOCK = "true";
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt });
    try {
      const response = await server.inject({
        method: "GET",
        url: "/markets/polymarket/active?symbol=ETH"
      });

      assert.equal(response.statusCode, 200);
      const payload = response.json<PolymarketActiveMarketsResponse>();
      assert.equal(payload.markets.length, 0);
      assert.ok(payload.warnings.some((warning) => warning.includes("No active BTC/ETH Polymarket markets found")));
    } finally {
      await server.close();
      restoreEnv("EPT_POLYMARKET_MOCK", previousMarketMock);
      restoreEnv("EPT_POLYMARKET_MOCK_EMPTY", previousEmpty);
      restoreEnv("EPT_LIVE_MARKET_DATA_MOCK", previousLiveMock);
    }
  });

  it("returns deterministic mock fair-value snapshots and markers without private or execution fields", async () => {
    const previousFairValueMock = process.env.EPT_FAIR_VALUE_MOCK;
    const previousMarketMock = process.env.EPT_POLYMARKET_MOCK;
    const previousLiveMock = process.env.EPT_LIVE_MARKET_DATA_MOCK;
    process.env.EPT_FAIR_VALUE_MOCK = "true";
    process.env.EPT_POLYMARKET_MOCK = "true";
    process.env.EPT_LIVE_MARKET_DATA_MOCK = "true";
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt });
    try {
      const response = await server.inject({
        method: "GET",
        url: "/signals/fair-value?symbol=BTC"
      });

      assert.equal(response.statusCode, 200);
      const payload = response.json<FairValueSignalResponse>();
      assert.equal(payload.symbol, "BTC");
      assert.equal(payload.sourceType, "mock");
      assert.equal(payload.isResearchOnly, true);
      assert.ok(payload.snapshots.length >= 1);
      assert.ok(payload.markers.length >= 1);
      assert.ok(payload.rejectedMarkets.length >= 1);
      assert.ok(payload.snapshots[0]?.modelProbabilityYes !== null);
      assert.ok(payload.snapshots[0]?.marketProbabilityYes !== null);
      assert.equal(payload.markers.every((marker) => marker.isResearchOnly), true);
      assert.equal(/privateKey|apiKey|secret|passphrase|order|cancel|balance|position/i.test(response.body), false);
    } finally {
      await server.close();
      restoreEnv("EPT_FAIR_VALUE_MOCK", previousFairValueMock);
      restoreEnv("EPT_POLYMARKET_MOCK", previousMarketMock);
      restoreEnv("EPT_LIVE_MARKET_DATA_MOCK", previousLiveMock);
    }
  });

  it("returns no fake fair-value snapshots when mock discovery is empty", async () => {
    const previousMarketMock = process.env.EPT_POLYMARKET_MOCK;
    const previousEmpty = process.env.EPT_POLYMARKET_MOCK_EMPTY;
    const previousLiveMock = process.env.EPT_LIVE_MARKET_DATA_MOCK;
    process.env.EPT_POLYMARKET_MOCK = "true";
    process.env.EPT_POLYMARKET_MOCK_EMPTY = "true";
    process.env.EPT_LIVE_MARKET_DATA_MOCK = "true";
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt });
    try {
      const response = await server.inject({
        method: "GET",
        url: "/signals/fair-value?symbol=BTC"
      });

      assert.equal(response.statusCode, 200);
      const payload = response.json<FairValueSignalResponse>();
      assert.equal(payload.snapshots.length, 0);
      assert.equal(payload.markers.length, 0);
      assert.equal(payload.rejectedMarkets.length, 0);
      assert.ok(payload.warnings.some((warning) => warning.includes("No active BTC/ETH Polymarket markets found")));
    } finally {
      await server.close();
      restoreEnv("EPT_POLYMARKET_MOCK", previousMarketMock);
      restoreEnv("EPT_POLYMARKET_MOCK_EMPTY", previousEmpty);
      restoreEnv("EPT_LIVE_MARKET_DATA_MOCK", previousLiveMock);
    }
  });

  it("returns deterministic mock signal replay metrics without private or execution fields", async () => {
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt });
    try {
      const first = await server.inject({
        method: "GET",
        url: "/signals/replay?symbol=BTC&window=1w&mock=true"
      });
      const second = await server.inject({
        method: "GET",
        url: "/signals/replay?symbol=BTC&window=1w&mock=true"
      });

      assert.equal(first.statusCode, 200);
      assert.equal(second.statusCode, 200);
      const payload = first.json<SignalReplayResponse>();
      const again = second.json<SignalReplayResponse>();
      assert.deepEqual(payload.metrics, again.metrics);
      assert.equal(payload.symbol, "BTC");
      assert.equal(payload.sourceType, "mock");
      assert.equal(payload.isResearchOnly, true);
      assert.equal(payload.metrics.sampleCount, 6);
      assert.equal(payload.metrics.winRate, 0.666667);
      assert.equal(payload.results.length, 10);
      assert.ok(payload.signals.length > 0);
      assert.ok(payload.markers.length > 0);
      assert.ok(payload.metrics.pendingCount >= 1);
      assert.ok(payload.metrics.rejectedCount >= 1);
      assert.ok(payload.metrics.noSignalCount >= 1);
      assert.equal(/privateKey|apiKey|secret|passphrase|order|cancel|balance|position/i.test(first.body), false);
    } finally {
      await server.close();
    }
  });

  it("returns live replay warnings instead of fake stats when completed samples are unavailable", async () => {
    const server = buildServer({
      logger: false,
      now: () => fixedGeneratedAt,
      signalReplayRunner: async (input): Promise<SignalReplayResponse> => {
        const window = typeof input.window === "string"
          ? {
              id: input.window,
              startTime: "2026-04-22T00:00:00.000Z",
              endTime: fixedGeneratedAt,
              label: "test"
            }
          : input.window;
        return {
          symbol: input.symbol,
          window,
          checkedAt: fixedGeneratedAt,
          sourceType: "live",
          providerHealth: {
            requestedProvider: "polymarket",
            resolvedProvider: "polymarket-gamma",
            sourceType: "live",
            status: "degraded",
            latencyMs: null,
            candleCount: 0,
            expectedMinCandles: 0,
            lastCandleTime: null,
            isFixtureBacked: false,
            fallbackUsed: false,
            fallbackReason: null,
            failClosedReasons: ["No completed replay samples."],
            checkedAt: fixedGeneratedAt
          },
          metrics: {
            symbol: input.symbol,
            window,
            sampleCount: 0,
            actionableCount: 0,
            winCount: 0,
            lossCount: 0,
            pendingCount: 0,
            unresolvedCount: 0,
            rejectedCount: 0,
            noSignalCount: 0,
            winRate: null,
            longYesCount: 0,
            longYesWinRate: null,
            longNoCount: 0,
            longNoWinRate: null,
            coverageRate: null,
            rejectionRate: null,
            pendingRate: null,
            averageEdge: null,
            averageConfidence: null,
            averageTheoreticalPnl: null,
            cumulativeTheoreticalPnl: null,
            maxDrawdown: null,
            warnings: ["NO_COMPLETED_REPLAY_SAMPLES"],
            isResearchOnly: true,
            checkedAt: fixedGeneratedAt
          },
          signals: [],
          results: [],
          markers: [],
          warnings: ["NO_COMPLETED_REPLAY_SAMPLES"],
          isResearchOnly: true
        };
      }
    });
    try {
      const response = await server.inject({
        method: "GET",
        url: "/signals/replay?symbol=BTC&window=1w&mock=false"
      });

      assert.equal(response.statusCode, 200);
      const payload = response.json<SignalReplayResponse>();
      assert.equal(payload.sourceType, "live");
      assert.equal(payload.metrics.sampleCount, 0);
      assert.equal(payload.metrics.winRate, null);
      assert.ok(payload.warnings.includes("NO_COMPLETED_REPLAY_SAMPLES"));
      assert.equal(/privateKey|apiKey|secret|passphrase|order|cancel|balance|position/i.test(response.body), false);
    } finally {
      await server.close();
    }
  });

  it("returns deterministic mock strategy lab report without private or execution fields", async () => {
    const server = buildServer({ logger: false, now: () => "2026-05-06T00:00:00.000Z" });
    try {
      const response = await server.inject({
        method: "GET",
        url: "/strategy-lab/sweep?symbol=BTC&window=1w&mock=true&maxCombinations=50"
      });

      assert.equal(response.statusCode, 200);
      const payload = response.json<{
        report: StrategyLabReport;
        parameterResults: StrategyLabReport["parameterResults"];
        topCandidates: StrategyLabReport["topCandidates"];
        walkForwardResults: StrategyLabReport["walkForwardResults"];
        rejectedParameterSets: StrategyLabReport["rejectedParameterSets"];
        warnings: string[];
        isResearchOnly: true;
      }>();
      assert.equal(payload.report.symbol, "BTC");
      assert.equal(payload.report.window, "1w");
      assert.equal(payload.report.strategyId, "fair-value-v1");
      assert.equal(payload.report.sourceType, "mock");
      assert.equal(payload.report.isResearchOnly, true);
      assert.ok(payload.parameterResults.length > 0);
      assert.ok(payload.topCandidates.length > 0);
      assert.ok(payload.walkForwardResults.length > 0);
      assert.ok(payload.rejectedParameterSets.length > 0);
      assert.ok(payload.topCandidates.every((result) => result.isResearchOnly));
      assert.ok(payload.topCandidates.every((result) => result.metrics.winRate !== null));
      assert.equal(/privateKey|apiKey|secret|passphrase|order|cancel|balance|position/i.test(response.body), false);
    } finally {
      await server.close();
    }
  });

  it("caps strategy lab maxCombinations", async () => {
    const server = buildServer({ logger: false, now: () => "2026-05-06T00:00:00.000Z" });
    try {
      const response = await server.inject({
        method: "GET",
        url: "/strategy-lab/sweep?symbol=BTC&window=1w&mock=true&maxCombinations=500"
      });

      assert.equal(response.statusCode, 200);
      const payload = response.json<{ report: StrategyLabReport }>();
      assert.ok(payload.report.parameterResults.length <= 100);
      assert.ok(payload.report.warnings.some((warning) => warning.includes("capped at 100")));
      assert.equal(/privateKey|apiKey|secret|passphrase|order|cancel|balance|position/i.test(response.body), false);
    } finally {
      await server.close();
    }
  });
});

function parseFirstPriceSsePayload(body: string): RealtimePriceSsePayload {
  const events = body.split("\n\n").filter(Boolean);
  const priceEvent = events.find((event) => event.includes("event: price"));
  assert.ok(priceEvent);
  const dataLine = priceEvent.split("\n").find((line) => line.startsWith("data: "));
  assert.ok(dataLine);
  return JSON.parse(dataLine.slice("data: ".length)) as RealtimePriceSsePayload;
}

function toLiveCandle(candle: OhlcvCandle, symbol: "BTC" | "ETH"): Candle {
  return {
    ...candle,
    source: "coinbase_exchange",
    sourceType: "live",
    provider: "coinbase-exchange",
    symbol,
    interval: "1m",
    granularity: 60,
    productId: symbol === "BTC" ? "BTC-USD" : "ETH-USD",
    displaySymbol: symbol === "BTC" ? "BTC-USD" : "ETH-USD",
    openTime: candle.timestamp,
    startTime: candle.timestamp,
    isLive: true,
    isMock: false,
    isFixtureBacked: false,
    isClosed: true
  };
}

function createApiTestStore() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ept-api-store-"));
  return createJsonlResearchStore({ dirPath: dir });
}

function mockCaptureRun(): CaptureRunRecord {
  return {
    jobName: "binance-candles",
    status: "success",
    startedAt: fixedGeneratedAt,
    finishedAt: "2026-04-23T00:00:01.000Z",
    durationMs: 1_000,
    sourceType: "mock",
    recordsInserted: 1,
    recordsUpdated: 0,
    recordsSkipped: 0,
    errorMessage: null,
    warningsJson: JSON.stringify([])
  };
}

function mockReplayResult(): ReplayResultRecord {
  return {
    sourceType: "mock",
    symbol: "BTC",
    window: "1w",
    strategyId: "fair-value-v1",
    sampleCount: 0,
    actionableCount: 1,
    winCount: 0,
    lossCount: 0,
    pendingCount: 1,
    unresolvedCount: 0,
    rejectedCount: 0,
    noSignalCount: 0,
    winRate: null,
    coverageRate: 1,
    rejectionRate: 0,
    averageEdge: 0.04,
    averageConfidence: 0.3,
    theoreticalPnl: null,
    maxDrawdown: null,
    warningsJson: JSON.stringify(["NO_COMPLETED_REPLAY_SAMPLES"]),
    checkedAt: fixedGeneratedAt
  };
}

function mockStrategyLabResult(): StrategyLabResultRecord {
  return {
    sourceType: "mock",
    symbol: "BTC",
    window: "1w",
    strategyId: "fair-value-v1",
    parameterSetJson: JSON.stringify({ id: "fair-value-v1:i1m" }),
    score: null,
    winRate: null,
    actionableCount: 0,
    theoreticalPnl: null,
    maxDrawdown: null,
    overfitRisk: "unknown",
    consistencyScore: null,
    warningsJson: JSON.stringify(["LOW_SAMPLE_SIZE"]),
    checkedAt: fixedGeneratedAt
  };
}

function assertNoPrivateTradingFields(body: string): void {
  assert.doesNotMatch(body, /privateKey|apiKey|secret|order|cancel|balance|position/i);
}

function mockLiveMarketData(
  request: LiveMarketDataFetchRequest,
  overrides: Partial<LiveMarketDataResponse> = {}
): LiveMarketDataResponse {
  const candles = mockLiveCandles(request);
  const latest = candles.at(-1);
  const provider: LiveMarketDataSource = request.provider === "coinbase-exchange" ? "coinbase-exchange" : "binance-spot-public";
  const displaySymbol =
    provider === "coinbase-exchange"
      ? request.symbol === "BTC" ? "BTC-USD" : "ETH-USD"
      : request.symbol === "BTC" ? "BTCUSDT" : "ETHUSDT";
  const base = {
    symbol: request.symbol,
    source: provider,
    sourceType: "live",
    provider,
    productId: displaySymbol,
    displaySymbol,
    fetchedAt: fixedGeneratedAt,
    latestPrice: 100.8,
    bid: 100.7,
    ask: 100.9,
    tickerTime: fixedGeneratedAt,
    tickerFreshnessSeconds: 0,
    tickerVolume: 1200,
    candles,
    candleInterval: request.interval ?? "1m",
    candleGranularity: intervalSeconds(request.interval ?? "1m"),
    candleCount: candles.length,
    latestCandleTime: latest?.timestamp ?? null,
    lastCandleTime: latest?.timestamp ?? null,
    candleFreshnessSeconds: 0,
    isLive: true,
    isMock: false,
    isFixtureBacked: false,
    warnings: [],
    failClosedReasons: []
  };
  return withProvenance({
    ...base,
    ...overrides
  });
}

function mockLiveCandles(request: LiveMarketDataFetchRequest): Candle[] {
  const lookback = request.lookback ?? 80;
  const interval = request.interval ?? "1m";
  const provider: LiveMarketDataSource = request.provider === "coinbase-exchange" ? "coinbase-exchange" : "binance-spot-public";
  const source: OhlcvSource = provider === "coinbase-exchange" ? "coinbase_exchange" : "binance_spot_public";
  const displaySymbol =
    provider === "coinbase-exchange"
      ? request.symbol === "BTC" ? "BTC-USD" : "ETH-USD"
      : request.symbol === "BTC" ? "BTCUSDT" : "ETHUSDT";
  const intervalMs = intervalSeconds(interval) * 1000;
  const latestStartMs = Date.parse(request.requestedAt) - intervalMs;
  return Array.from({ length: lookback }, (_, index) => {
    const startMs = latestStartMs - (lookback - 1 - index) * intervalMs;
    const open = 100 + index * 0.01;
    const close = open + 0.02;
    const startTime = new Date(startMs).toISOString();
    return {
      source,
      sourceType: "live",
      provider,
      symbol: request.symbol,
      interval,
      granularity: intervalSeconds(interval),
      productId: displaySymbol,
      displaySymbol,
      openTime: startTime,
      startTime,
      timestamp: startTime,
      open,
      high: close + 0.03,
      low: open - 0.03,
      close,
      volume: 1000 + index,
      isLive: true,
      isMock: false,
      isFixtureBacked: false,
      isClosed: true
    };
  });
}

function withProvenance(
  response: Omit<LiveMarketDataResponse, "provenance" | "providerHealth"> & Partial<Pick<LiveMarketDataResponse, "providerHealth">>
): LiveMarketDataResponse {
  return {
    ...response,
    provenance: {
      source: response.source,
      sourceType: response.sourceType,
      provider: response.provider,
      productId: response.productId,
      displaySymbol: response.displaySymbol,
      sourceMode: response.sourceType === "fixture" ? "fixture" : "live",
      isLive: response.isLive,
      isMock: response.isMock,
      isFixtureBacked: response.isFixtureBacked,
      fetchedAt: response.fetchedAt,
      candleInterval: response.candleInterval,
      candleGranularity: response.candleGranularity,
      candleCount: response.candleCount,
      lastCandleTime: response.lastCandleTime
    },
    providerHealth: response.providerHealth ?? {
      requestedProvider: response.sourceType === "mock" ? "mock" : response.provider === "coinbase-exchange" ? "coinbase" : "binance",
      resolvedProvider: response.sourceType === "mock" ? "mock" : response.provider,
      sourceType: response.sourceType,
      status: response.failClosedReasons.length || response.candleCount === 0 || response.latestPrice === null ? "failed" : "ok",
      latencyMs: null,
      candleCount: response.candleCount,
      expectedMinCandles: response.candleCount,
      lastCandleTime: response.lastCandleTime,
      isFixtureBacked: response.isFixtureBacked,
      fallbackUsed: false,
      fallbackReason: null,
      failClosedReasons: response.failClosedReasons,
      checkedAt: response.fetchedAt
    }
  };
}

function intervalSeconds(interval: LiveMarketDataFetchRequest["interval"]): number {
  return interval === "5m" ? 300 : interval === "15m" ? 900 : interval === "1h" ? 3600 : 60;
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
