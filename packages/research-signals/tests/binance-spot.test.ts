import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  binanceSpotInterval,
  binanceSpotIntervalSeconds,
  buildBinanceSpotSymbol,
  fetchBinanceSpotCandles,
  fetchBinanceSpotMarketData,
  type FetchLike
} from "../src/index.js";
import type { OHLCVFetchRequest } from "@ept/shared-types";

const requestedAt = "2026-05-03T00:40:00.000Z";

describe("Binance Spot public market-data adapter", () => {
  it("maps BTC and ETH to Binance symbols and supported intervals", () => {
    assert.equal(buildBinanceSpotSymbol("BTC"), "BTCUSDT");
    assert.equal(buildBinanceSpotSymbol("ETH"), "ETHUSDT");
    assert.equal(binanceSpotInterval("1m"), "1m");
    assert.equal(binanceSpotInterval("5m"), "5m");
    assert.equal(binanceSpotInterval("15m"), "15m");
    assert.equal(binanceSpotInterval("1h"), "1h");
    assert.equal(binanceSpotIntervalSeconds("1m"), 60);
    assert.equal(binanceSpotIntervalSeconds("5m"), 300);
    assert.equal(binanceSpotIntervalSeconds("15m"), 900);
    assert.equal(binanceSpotIntervalSeconds("1h"), 3600);
  });

  it("fetches, parses, sorts, trims, and proves no auth header for BTCUSDT klines", async () => {
    let requestedUrl = "";
    const fetcher: FetchLike = async (url, init) => {
      requestedUrl = url;
      assert.deepEqual(init.headers, { Accept: "application/json" });
      assert.equal("Authorization" in init.headers, false);
      return jsonResponse(binanceRows("2026-05-03T00:00:00.000Z", 40).reverse());
    };

    const result = await fetchBinanceSpotCandles(baseRequest("BTC"), {
      baseUrl: "https://data-api.binance.vision",
      fetcher
    });

    assert.match(requestedUrl, /\/api\/v3\/klines/);
    assert.match(requestedUrl, /symbol=BTCUSDT/);
    assert.match(requestedUrl, /interval=1m/);
    assert.equal(result.source, "binance_spot_public");
    assert.equal(result.sourceType, "live");
    assert.equal(result.provider, "binance-spot-public");
    assert.equal(result.productId, "BTCUSDT");
    assert.equal(result.displaySymbol, "BTCUSDT");
    assert.equal(result.candleGranularity, 60);
    assert.equal(result.candleCount, 35);
    assert.equal(result.isLive, true);
    assert.equal(result.isMock, false);
    assert.equal(result.isFixtureBacked, false);
    assert.equal(result.candles[0]?.startTime, "2026-05-03T00:05:00.000Z");
    assert.equal(result.candles.at(-1)?.startTime, "2026-05-03T00:39:00.000Z");
    assert.equal(result.candles[0]?.displaySymbol, "BTCUSDT");
    assert.equal(result.candles[0]?.isMock, false);
    assert.deepEqual(result.failClosedReasons, []);
  });

  it("fetches ETHUSDT market data from public ticker and klines", async () => {
    const requestedUrls: string[] = [];
    const fetcher: FetchLike = async (url, init) => {
      requestedUrls.push(url);
      assert.deepEqual(init.headers, { Accept: "application/json" });
      if (url.includes("/ticker/24hr")) {
        return jsonResponse(binanceTicker("ETHUSDT"));
      }
      return jsonResponse(binanceRows("2026-05-03T00:00:00.000Z", 90));
    };

    const result = await fetchBinanceSpotMarketData(
      {
        symbol: "ETH",
        interval: "5m",
        lookback: 35,
        sourceMode: "live",
        requestedAt
      },
      { fetcher }
    );

    assert.ok(requestedUrls.some((url) => url.includes("/api/v3/ticker/24hr")));
    assert.ok(requestedUrls.some((url) => url.includes("symbol=ETHUSDT")));
    assert.equal(result.provider, "binance-spot-public");
    assert.equal(result.displaySymbol, "ETHUSDT");
    assert.equal(result.latestPrice, 101.25);
    assert.equal(result.bid, 101.2);
    assert.equal(result.ask, 101.3);
    assert.equal(result.tickerTime, "2026-05-03T00:39:59.000Z");
    assert.equal(result.candleInterval, "5m");
    assert.equal(result.candleGranularity, 300);
    assert.equal(result.candleCount, 35);
    assert.equal(result.provenance.provider, "binance-spot-public");
    assert.equal(result.provenance.displaySymbol, "ETHUSDT");
  });

  it("fails closed on malformed kline rows", async () => {
    const fetcher: FetchLike = async () => jsonResponse([binanceRow("2026-05-03T00:00:00.000Z", 100), ["bad"]]);

    const result = await fetchBinanceSpotCandles(baseRequest("BTC"), { fetcher });

    assert.equal(result.candles.length, 0);
    assert.ok(result.failClosedReasons.some((reason) => reason.includes("malformed")));
    assert.equal(result.isFixtureBacked, false);
  });

  it("fails closed on network errors", async () => {
    const fetcher: FetchLike = async () => {
      throw new Error("mock Binance network unavailable");
    };

    const result = await fetchBinanceSpotCandles(baseRequest("BTC"), { fetcher });

    assert.equal(result.candles.length, 0);
    assert.ok(result.failClosedReasons.some((reason) => reason.includes("mock Binance network unavailable")));
    assert.equal(result.sourceType, "live");
  });

  it("drops an incomplete latest Binance candle instead of using it as closed evidence", async () => {
    const rows = [
      ...binanceRows("2026-05-03T00:05:00.000Z", 35),
      binanceRow("2026-05-03T00:40:00.000Z", 200)
    ];
    const fetcher: FetchLike = async () => jsonResponse(rows);

    const result = await fetchBinanceSpotCandles(baseRequest("BTC"), { fetcher });

    assert.equal(result.candles.length, 35);
    assert.equal(result.candles.at(-1)?.startTime, "2026-05-03T00:39:00.000Z");
    assert.ok(result.warnings.some((warning) => warning.includes("incomplete")));
    assert.deepEqual(result.failClosedReasons, []);
  });
});

function baseRequest(symbol: "BTC" | "ETH"): OHLCVFetchRequest {
  return {
    symbol,
    interval: "1m",
    lookback: 35,
    sourceMode: "live",
    requestedAt
  };
}

function binanceRows(start: string, count: number, intervalMs = 60_000) {
  const startMs = Date.parse(start);
  return Array.from({ length: count }, (_, index) => binanceRow(new Date(startMs + index * intervalMs).toISOString(), 100 + index, intervalMs));
}

function binanceRow(start: string, open: number, intervalMs = 60_000) {
  const openTime = Date.parse(start);
  const closeTime = openTime + intervalMs - 1;
  return [
    openTime,
    String(open),
    String(open + 2),
    String(open - 1),
    String(open + 1),
    String(1_000 + open),
    closeTime,
    "0",
    100,
    "0",
    "0",
    "0"
  ];
}

function binanceTicker(symbol: "BTCUSDT" | "ETHUSDT") {
  return {
    symbol,
    lastPrice: "101.25",
    bidPrice: "101.20",
    askPrice: "101.30",
    volume: "1000",
    closeTime: 1_777_768_799_000
  };
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body
  };
}
