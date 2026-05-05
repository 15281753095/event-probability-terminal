import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyFailClosedOHLCVResult,
  getResearchSignalFixture,
  type LiveMarketDataFetchRequest
} from "@ept/research-signals";
import {
  API_CONTRACT_VERSION,
  type ApiErrorResponse,
  type Candle,
  type EventSignalConsoleResponse,
  type LiveMarketDataSource,
  type LiveMarketDataResponse,
  type OHLCVFetchResult,
  type OhlcvCandle,
  type OhlcvSource,
  type ResearchSignalsResponse
} from "@ept/shared-types";
import { buildServer } from "../src/server.js";

const fixedGeneratedAt = "2026-04-23T00:00:00.000Z";

describe("research signals API", () => {
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
});

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
