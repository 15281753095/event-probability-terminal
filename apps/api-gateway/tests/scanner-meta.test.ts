import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeRejections } from "../src/scanner-meta.js";

describe("scanner metadata helpers", () => {
  it("groups rejection reasons and keeps only sample ids", () => {
    const summary = summarizeRejections([
      { marketId: "m1", reason: "missing asset/window classification" },
      { marketId: "m2", reason: "enableOrderBook is not true" },
      { marketId: "m3", reason: "missing asset/window classification" },
      { marketId: "m4", reason: "missing asset/window classification" },
      { marketId: "m5", reason: "missing asset/window classification" }
    ]);

    assert.deepEqual(summary, [
      {
        reason: "missing asset/window classification",
        count: 4,
        sampleMarketIds: ["m1", "m3", "m4"]
      },
      {
        reason: "enableOrderBook is not true",
        count: 1,
        sampleMarketIds: ["m2"]
      }
    ]);
  });
});
