import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyFailClosedOHLCVResult, getResearchSignalFixture } from "@ept/research-signals";
import {
  API_CONTRACT_VERSION,
  type ApiErrorResponse,
  type Candle,
  type EventSignalConsoleResponse,
  type OHLCVFetchResult,
  type OhlcvCandle,
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

  it("returns a fixture-backed Event Signal Console with backtest disabled by default", async () => {
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt });
    const response = await server.inject({
      method: "GET",
      url: "/signals/console?symbol=BTC&horizon=5m"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<EventSignalConsoleResponse>();
    assert.equal(payload.meta.contractVersion, API_CONTRACT_VERSION);
    assert.equal(payload.meta.responseKind, "event_signal_console");
    assert.equal(payload.meta.mode, "fixture");
    assert.equal(payload.currentSignal.direction, "LONG");
    assert.equal(payload.currentSignal.isTradeAdvice, false);
    assert.equal(payload.confluence.direction, "LONG");
    assert.equal(payload.riskFilters.dataFreshness, "pass");
    assert.ok(payload.recentCandles.length > 0);
    assert.ok(payload.recentMarkers.length <= 20);
    assert.equal(payload.recentMarkers.every((marker) => marker.isRecentOnly), true);
    assert.equal(payload.backtestPreview.enabled, false);
    assert.equal(payload.backtestPreview.status, "not_loaded");
    assert.ok(payload.warnings.some((warning) => warning.includes("Research only")));

    await server.close();
  });

  it("loads lightweight backtest preview only when explicitly requested", async () => {
    const server = buildServer({ logger: false, now: () => fixedGeneratedAt });
    const response = await server.inject({
      method: "GET",
      url: "/signals/console?symbol=BTC&horizon=5m&includeBacktest=true"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<EventSignalConsoleResponse>();
    assert.equal(payload.backtestPreview.enabled, true);
    assert.ok(payload.backtestPreview.status === "ready" || payload.backtestPreview.status === "insufficient");
    assert.ok(payload.backtestPreview.caveats.some((caveat) => caveat.includes("Small local candle sample")));
    assert.ok(payload.backtestPreview.caveats.some((caveat) => caveat.includes("not a predictive guarantee")));

    await server.close();
  });

  it("returns live Event Signal Console fail-closed with a mocked OHLCV failure", async () => {
    const server = buildServer({
      logger: false,
      now: () => fixedGeneratedAt,
      researchSignalOhlcvFetcher: async (request) =>
        emptyFailClosedOHLCVResult(request, fixedGeneratedAt, "mock console Coinbase failure")
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
    assert.ok(payload.confluence.vetoReasons.some((reason) => reason.includes("mock console Coinbase failure")));

    await server.close();
  });
});

function toLiveCandle(candle: OhlcvCandle, symbol: "BTC" | "ETH"): Candle {
  return {
    ...candle,
    source: "coinbase_exchange",
    symbol,
    interval: "1m",
    startTime: candle.timestamp,
    isClosed: true
  };
}
