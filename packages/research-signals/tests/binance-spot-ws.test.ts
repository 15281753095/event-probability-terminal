import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBinanceSpotRealtimeMessage } from "../src/realtime/binance-spot-ws.js";

const receivedAt = "2026-05-05T00:00:01.000Z";
const eventMs = Date.parse("2026-05-05T00:00:00.900Z");

describe("Binance Spot public realtime parser", () => {
  it("parses trade payloads into realtime ticks", () => {
    const result = parseBinanceSpotRealtimeMessage({
      e: "trade",
      E: eventMs,
      s: "BTCUSDT",
      t: 123,
      p: "64000.12"
    }, receivedAt);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.tick.symbol, "BTCUSDT");
    assert.equal(result.tick.displaySymbol, "BTCUSDT");
    assert.equal(result.tick.provider, "binance-spot-public");
    assert.equal(result.tick.sourceType, "live");
    assert.equal(result.tick.eventType, "trade");
    assert.equal(result.tick.price, 64000.12);
    assert.equal(result.tick.latencyMs, 100);
    assert.equal(result.tick.sequenceId, 123);
  });

  it("parses aggTrade payloads into realtime ticks", () => {
    const result = parseBinanceSpotRealtimeMessage({
      e: "aggTrade",
      E: eventMs,
      s: "ETHUSDT",
      a: 456,
      p: "3123.45"
    }, receivedAt);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.tick.symbol, "ETHUSDT");
    assert.equal(result.tick.eventType, "aggTrade");
    assert.equal(result.tick.price, 3123.45);
    assert.equal(result.tick.sequenceId, 456);
  });

  it("parses bookTicker payloads into bid ask ticks", () => {
    const result = parseBinanceSpotRealtimeMessage({
      u: 400900217,
      s: "BTCUSDT",
      b: "63999.50",
      a: "64000.50"
    }, receivedAt);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.tick.eventType, "bookTicker");
    assert.equal(result.tick.bidPrice, 63999.5);
    assert.equal(result.tick.askPrice, 64000.5);
    assert.equal(result.tick.price, 64000);
    assert.equal(result.tick.latencyMs, null);
  });

  it("parses kline payloads with close metadata", () => {
    const result = parseBinanceSpotRealtimeMessage({
      e: "kline",
      E: eventMs,
      s: "BTCUSDT",
      k: {
        t: Date.parse("2026-05-05T00:00:00.000Z"),
        i: "1m",
        L: 999,
        o: "64000",
        h: "64020",
        l: "63990",
        c: "64010",
        v: "12.5",
        x: true
      }
    }, receivedAt);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.tick.eventType, "kline");
    assert.equal(result.tick.price, 64010);
    assert.equal(result.tick.isClosedKline, true);
    assert.equal(result.tick.candle?.timestamp, "2026-05-05T00:00:00.000Z");
  });

  it("unwraps combined stream payloads", () => {
    const result = parseBinanceSpotRealtimeMessage(JSON.stringify({
      stream: "btcusdt@trade",
      data: {
        e: "trade",
        E: eventMs,
        s: "BTCUSDT",
        t: 321,
        p: "64001.00"
      }
    }), receivedAt);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.tick.price, 64001);
  });

  it("rejects invalid and private account/order-like payloads", () => {
    const invalid = parseBinanceSpotRealtimeMessage({ e: "executionReport", E: eventMs, s: "BTCUSDT", X: "NEW" }, receivedAt);
    assert.equal(invalid.ok, false);
    if (invalid.ok) return;
    assert.match(invalid.reason, /Unsupported/);
  });
});
