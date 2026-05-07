import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createJsonlResearchStore,
  runBinanceCandlesCaptureJob,
  runFairValueSignalsCaptureJob,
  runCaptureOnce,
  runPolymarketMarketsCaptureJob,
  runReplayMetricsCaptureJob,
  runStrategyLabCaptureJob,
  type CaptureRunRecord,
  type ResearchDataStore
} from "../src/index.js";

const fixedNow = "2026-05-07T00:00:00.000Z";

describe("capture jobs", () => {
  it("writes mock Binance candles idempotently", async () => {
    const { store } = await createJsonlStore();
    const result = await runBinanceCandlesCaptureJob({ store, now: () => fixedNow, useMock: true });
    assert.equal(result.status, "success");
    assert.equal(result.sourceType, "mock");
    assert.ok(result.recordsInserted > 0);
    const second = await runBinanceCandlesCaptureJob({ store, now: () => fixedNow, useMock: true });
    assert.ok(second.recordsSkipped > 0);
    const status = await store.getStatus({ asOf: fixedNow });
    assert.ok(status.counts.underlying_candles > 0);
    await store.close();
  });

  it("writes mock Polymarket market snapshots", async () => {
    const { store } = await createJsonlStore();
    const result = await runPolymarketMarketsCaptureJob({ store, now: () => fixedNow, useMock: true });
    assert.equal(result.sourceType, "mock");
    assert.ok(result.recordsInserted > 0);
    const status = await store.getStatus({ asOf: fixedNow });
    assert.ok(status.counts.market_snapshots > 0);
    await store.close();
  });

  it("writes mock fair-value LONG_YES and REJECTED signals", async () => {
    const previous = process.env.EPT_FAIR_VALUE_MOCK;
    process.env.EPT_FAIR_VALUE_MOCK = "true";
    const { dir, store } = await createJsonlStore();
    try {
      const result = await runFairValueSignalsCaptureJob({ store, now: () => fixedNow, useMock: true });
      assert.equal(result.sourceType, "mock");
      assert.ok(result.recordsInserted > 0);
      const rows = readJsonl<{ side: string; sourceType: string }>(path.join(dir, "fair_value_signals.jsonl"));
      assert.ok(rows.some((row) => row.side === "LONG_YES"));
      assert.ok(rows.some((row) => row.side === "REJECTED"));
      assert.ok(rows.every((row) => row.sourceType === "mock"));
    } finally {
      if (previous === undefined) {
        delete process.env.EPT_FAIR_VALUE_MOCK;
      } else {
        process.env.EPT_FAIR_VALUE_MOCK = previous;
      }
      await store.close();
    }
  });

  it("writes replay metrics with honest null or finite win rate", async () => {
    const { dir, store } = await createJsonlStore();
    const result = await runReplayMetricsCaptureJob({ store, now: () => fixedNow, useMock: true });
    assert.equal(result.sourceType, "mock");
    assert.ok(result.recordsInserted > 0);
    const rows = readJsonl<{ winRate: number | null; warningsJson: string }>(path.join(dir, "replay_results.jsonl"));
    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => row.winRate === null || Number.isFinite(row.winRate)));
    await store.close();
  });

  it("keeps default live replay capture fail-closed and bounded", async () => {
    const { dir, store } = await createJsonlStore();
    const result = await runReplayMetricsCaptureJob({
      store,
      now: () => fixedNow,
      useMock: false,
      fetcher: async () => {
        throw new Error("live fetch should not run in default replay capture");
      }
    });
    assert.equal(result.sourceType, "live");
    assert.equal(result.status, "partial");
    assert.ok(result.recordsInserted > 0);
    const rows = readJsonl<{ sourceType: string; winRate: number | null; sampleCount: number; warningsJson: string }>(path.join(dir, "replay_results.jsonl"));
    assert.equal(rows.length, 12);
    assert.ok(rows.every((row) => row.sourceType === "live"));
    assert.ok(rows.every((row) => row.winRate === null));
    assert.ok(rows.every((row) => row.sampleCount === 0));
    assert.ok(rows.every((row) => row.warningsJson.includes("LIVE_REPLAY_CAPTURE_DEFERRED")));
    await store.close();
  });

  it("writes strategy lab results with warnings/top-candidate summary", async () => {
    const { dir, store } = await createJsonlStore();
    const result = await runStrategyLabCaptureJob({ store, now: () => fixedNow, useMock: true });
    assert.equal(result.sourceType, "mock");
    assert.ok(result.recordsInserted > 0);
    const rows = readJsonl<{ warningsJson: string; parameterSetJson: string }>(path.join(dir, "strategy_lab_results.jsonl"));
    assert.ok(rows.length > 0);
    assert.ok(rows.some((row) => row.parameterSetJson.includes("fair-value-v1") || row.parameterSetJson.includes("NO_TOP_CANDIDATE")));
    await store.close();
  });

  it("keeps default live strategy lab capture fail-closed and bounded", async () => {
    const { dir, store } = await createJsonlStore();
    const result = await runStrategyLabCaptureJob({
      store,
      now: () => fixedNow,
      useMock: false,
      fetcher: async () => {
        throw new Error("live fetch should not run in default strategy lab capture");
      }
    });
    assert.equal(result.sourceType, "live");
    assert.equal(result.status, "partial");
    assert.ok(result.recordsInserted > 0);
    const rows = readJsonl<{ sourceType: string; winRate: number | null; parameterSetJson: string; warningsJson: string }>(path.join(dir, "strategy_lab_results.jsonl"));
    assert.equal(rows.length, 4);
    assert.ok(rows.every((row) => row.sourceType === "live"));
    assert.ok(rows.every((row) => row.winRate === null));
    assert.ok(rows.every((row) => row.parameterSetJson.includes("NO_LIVE_STRATEGY_LAB_CANDIDATE")));
    assert.ok(rows.every((row) => row.warningsJson.includes("LIVE_STRATEGY_LAB_CAPTURE_DEFERRED")));
    await store.close();
  });

  it("runs mock capture once deterministically across full jobs", async () => {
    const { store } = await createJsonlStore();
    const results = await runCaptureOnce({ store, now: () => fixedNow, useMock: true });
    assert.ok(results.some((result) => result.jobName === "replay-metrics"));
    assert.ok(results.some((result) => result.jobName === "strategy-lab"));
    assert.equal(results.at(-1)?.jobName, "capture-once");
    assert.equal(results.at(-1)?.sourceType, "mock");
    assert.ok(results.at(-1)?.recordsInserted);
    const status = await store.getStatus({ asOf: fixedNow });
    assert.ok(status.counts.capture_runs >= 6);
    assert.ok(status.counts.replay_results > 0);
    assert.ok(status.counts.strategy_lab_results > 0);
    await store.close();
  });

  it("records failed capture_runs when a job throws before inserting records", async () => {
    const runs: CaptureRunRecord[] = [];
    const failingStore = {
      kind: "jsonl",
      dbPath: "memory",
      init: async () => undefined,
      close: async () => undefined,
      insertUnderlyingCandles: async () => {
        throw new Error("mock insert failure");
      },
      recordCaptureRun: async (record: CaptureRunRecord) => {
        runs.push(record);
        return { recordsInserted: 1, recordsUpdated: 0, recordsSkipped: 0 };
      }
    } as unknown as ResearchDataStore;
    const result = await runBinanceCandlesCaptureJob({ store: failingStore, now: () => fixedNow, useMock: true });
    assert.equal(result.status, "failed");
    assert.equal(runs.at(-1)?.status, "failed");
    assert.match(runs.at(-1)?.errorMessage ?? "", /mock insert failure/);
  });
});

async function createJsonlStore() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ept-capture-"));
  const store = createJsonlResearchStore({ dirPath: dir });
  await store.init();
  return { dir, store };
}

function readJsonl<T>(file: string): T[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
