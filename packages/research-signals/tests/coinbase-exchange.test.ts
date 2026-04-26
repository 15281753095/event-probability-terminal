import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCoinbaseProductId,
  coinbaseGranularity,
  fetchCoinbaseExchangeCandles,
  type FetchLike
} from "../src/index.js";
import type { OHLCVFetchRequest } from "@ept/shared-types";

const requestedAt = "2026-04-26T00:40:00.000Z";

describe("Coinbase Exchange OHLCV adapter", () => {
  it("maps BTC and ETH to Coinbase Exchange product ids and granularities", () => {
    assert.equal(buildCoinbaseProductId("BTC"), "BTC-USD");
    assert.equal(buildCoinbaseProductId("ETH"), "ETH-USD");
    assert.equal(coinbaseGranularity("1m"), 60);
    assert.equal(coinbaseGranularity("5m"), 300);
  });

  it("fetches, parses, sorts, and trims BTC candles with mocked fetch", async () => {
    let requestedUrl = "";
    const fetcher: FetchLike = async (url) => {
      requestedUrl = url;
      return jsonResponse(coinbaseRows("2026-04-26T00:00:00.000Z", 40).reverse());
    };

    const result = await fetchCoinbaseExchangeCandles(baseRequest("BTC"), {
      baseUrl: "https://api.exchange.coinbase.com",
      fetcher
    });

    assert.match(requestedUrl, /\/products\/BTC-USD\/candles/);
    assert.match(requestedUrl, /granularity=60/);
    assert.equal(result.source, "coinbase_exchange");
    assert.equal(result.isLive, true);
    assert.equal(result.isFixtureBacked, false);
    assert.equal(result.candles.length, 35);
    assert.equal(result.candles[0]?.startTime, "2026-04-26T00:05:00.000Z");
    assert.equal(result.candles.at(-1)?.startTime, "2026-04-26T00:39:00.000Z");
    assert.equal(result.freshness.status, "fresh");
    assert.deepEqual(result.failClosedReasons, []);
  });

  it("fetches ETH candles from the ETH-USD product id", async () => {
    let requestedUrl = "";
    const fetcher: FetchLike = async (url) => {
      requestedUrl = url;
      return jsonResponse(coinbaseRows("2026-04-26T00:00:00.000Z", 40));
    };

    await fetchCoinbaseExchangeCandles(baseRequest("ETH"), {
      baseUrl: "https://api.exchange.coinbase.com",
      fetcher
    });

    assert.match(requestedUrl, /\/products\/ETH-USD\/candles/);
  });

  it("drops incomplete candles instead of using them as closed evidence", async () => {
    const rows = [
      ...coinbaseRows("2026-04-26T00:05:00.000Z", 35),
      coinbaseRow("2026-04-26T00:40:00.000Z", 200)
    ];
    const fetcher: FetchLike = async () => jsonResponse(rows);

    const result = await fetchCoinbaseExchangeCandles(baseRequest("BTC"), { fetcher });

    assert.equal(result.candles.length, 35);
    assert.equal(result.candles.at(-1)?.startTime, "2026-04-26T00:39:00.000Z");
    assert.ok(result.warnings.some((warning) => warning.includes("incomplete")));
    assert.deepEqual(result.failClosedReasons, []);
  });

  it("fails closed when Coinbase returns too few closed candles", async () => {
    const fetcher: FetchLike = async () => jsonResponse(coinbaseRows("2026-04-26T00:00:00.000Z", 10));

    const result = await fetchCoinbaseExchangeCandles(baseRequest("BTC"), { fetcher });

    assert.equal(result.candles.length, 10);
    assert.ok(result.failClosedReasons.some((reason) => reason.includes("10 closed candle")));
  });

  it("fails closed when the latest closed candle is stale", async () => {
    const fetcher: FetchLike = async () => jsonResponse(coinbaseRows("2026-04-26T00:00:00.000Z", 35));

    const result = await fetchCoinbaseExchangeCandles(baseRequest("BTC"), { fetcher });

    assert.equal(result.freshness.status, "stale");
    assert.ok(result.failClosedReasons.some((reason) => reason.includes("stale")));
  });

  it("fails closed on network errors", async () => {
    const fetcher: FetchLike = async () => {
      throw new Error("mock network unavailable");
    };

    const result = await fetchCoinbaseExchangeCandles(baseRequest("BTC"), { fetcher });

    assert.equal(result.candles.length, 0);
    assert.ok(result.failClosedReasons.some((reason) => reason.includes("mock network unavailable")));
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

function coinbaseRows(start: string, count: number) {
  const startMs = Date.parse(start);
  return Array.from({ length: count }, (_, index) => coinbaseRow(new Date(startMs + index * 60_000).toISOString(), 100 + index));
}

function coinbaseRow(start: string, open: number) {
  const time = Date.parse(start) / 1000;
  return [time, open - 1, open + 2, open, open + 1, 1_000 + open];
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body
  };
}
