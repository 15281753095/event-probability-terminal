import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RESEARCH_ONLY_STRATEGY_REGISTRY, runResearchBacktest } from "../src/index.js";
import type { BacktestSample } from "../src/backtest/types.js";

const strategy = RESEARCH_ONLY_STRATEGY_REGISTRY[0];

describe("research-only backtest scaffold", () => {
  it("runs valid fixtures into a research-only BacktestResult", () => {
    assert.ok(strategy);
    const result = runResearchBacktest({
      strategy,
      samples: Array.from({ length: 35 }, (_, index) => sample(index)),
      feesAssumption: "1% fee placeholder",
      slippageAssumption: "2 ticks placeholder",
      spreadAssumption: "2c spread placeholder"
    });

    assert.equal(result.strategyId, strategy.id);
    assert.equal(result.isResearchOnly, true);
    assert.equal(result.sampleCount, 35);
    assert.ok(result.winRate !== null);
    assert.equal(result.rejectedReasons.length, 0);
  });

  it("rejects future-looking candle data", () => {
    assert.ok(strategy);
    const bad = sample(0);
    bad.candles.push({ timestamp: bad.outcomeTime, open: 1, high: 1, low: 1, close: 1, volume: 1 });
    const result = runResearchBacktest({ strategy, samples: [bad] });

    assert.equal(result.isResearchOnly, true);
    assert.equal(result.sampleCount, 0);
    assert.ok(result.rejectedReasons.some((reason) => reason.includes("future candle")));
  });

  it("warns when sampleCount is too small", () => {
    assert.ok(strategy);
    const result = runResearchBacktest({ strategy, samples: [sample(0), sample(1)], minSampleCount: 30 });

    assert.equal(result.isResearchOnly, true);
    assert.ok(result.warnings.some((warning) => warning.includes("below minimum")));
  });

  it("rejects entry at or after outcome time", () => {
    assert.ok(strategy);
    const bad = sample(0);
    bad.entryTime = bad.outcomeTime;
    const result = runResearchBacktest({ strategy, samples: [bad] });

    assert.equal(result.isResearchOnly, true);
    assert.ok(result.rejectedReasons.some((reason) => reason.includes("entryTime must be earlier")));
  });
});

function sample(index: number): BacktestSample {
  const entryMs = Date.parse("2026-05-05T00:10:00.000Z") + index * 600_000;
  const candles = [4, 3, 2, 1].map((offset) => {
    const timestamp = new Date(entryMs - offset * 60_000).toISOString();
    const close = 100 + index + (4 - offset) * 0.2;
    return {
      timestamp,
      open: close - 0.1,
      high: close + 0.2,
      low: close - 0.2,
      close,
      volume: 1000 + index
    };
  });
  return {
    entryTime: new Date(entryMs).toISOString(),
    outcomeTime: new Date(entryMs + 300_000).toISOString(),
    entryPrice: candles.at(-1)?.close ?? 100,
    outcomePrice: (candles.at(-1)?.close ?? 100) + 0.5,
    candles
  };
}
