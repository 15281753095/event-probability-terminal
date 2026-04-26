import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildResearchSignal, getResearchSignalFixture, listResearchSignals } from "../src/index.js";

const generatedAt = "2026-04-23T00:00:00.000Z";

describe("research signal engine v0", () => {
  it("emits deterministic LONG, SHORT, and NO_SIGNAL examples", () => {
    const response = listResearchSignals({ generatedAt });
    const byKey = new Map(response.signals.map((signal) => [`${signal.symbol}-${signal.horizon}`, signal]));

    assert.equal(response.meta.contractVersion, "ept-api-v1");
    assert.equal(response.meta.isResearchOnly, true);
    assert.equal(response.meta.isTradeAdvice, false);
    assert.equal(byKey.get("BTC-5m")?.direction, "LONG");
    assert.equal(byKey.get("ETH-5m")?.direction, "SHORT");
    assert.equal(byKey.get("BTC-10m")?.direction, "NO_SIGNAL");
    assert.equal(byKey.get("ETH-10m")?.direction, "NO_SIGNAL");
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
});
