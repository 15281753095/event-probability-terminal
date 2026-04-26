import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  atrSnapshot,
  bollingerSnapshot,
  buildFeatureSnapshot,
  emaSeries,
  macdSnapshot,
  realizedVolatilitySnapshot,
  rsiSnapshot,
  volumeSnapshot
} from "../src/index.js";
import { researchSignalFixtures } from "../src/fixtures.js";

const btcFiveMinute = researchSignalFixtures.find(
  (fixture) => fixture.symbol === "BTC" && fixture.horizon === "5m"
);

describe("technical indicators", () => {
  it("calculates EMA deterministically", () => {
    assert.deepEqual(emaSeries([1, 2, 3], 2).map((value) => Number(value.toFixed(4))), [
      1, 1.6667, 2.5556
    ]);
  });

  it("calculates the RC-7 indicator feature set from fixture candles", () => {
    assert.ok(btcFiveMinute);
    const closes = btcFiveMinute.candles.map((candle) => candle.close);
    const volumes = btcFiveMinute.candles.map((candle) => candle.volume);
    const features = buildFeatureSnapshot(btcFiveMinute.candles);

    assert.equal(features.lastClose, 103912.04);
    assert.ok(features.ema.fast > features.ema.slow);
    assert.ok(features.ema.slope > 0);
    assert.ok(rsiSnapshot(closes, 14) > 70);
    assert.ok(macdSnapshot(closes, { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }).histogram > 0);
    assert.ok(bollingerSnapshot(closes, 20, 2).bandPosition > 0.5);
    assert.ok(atrSnapshot(btcFiveMinute.candles, 14) > 0);
    assert.ok(realizedVolatilitySnapshot(closes, 14) > 0);
    assert.ok(volumeSnapshot(volumes, 20).zScore > 0);
  });
});
