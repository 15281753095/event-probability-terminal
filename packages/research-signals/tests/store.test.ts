import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createResearchDataStore,
  stableRawHash,
  type CaptureRunRecord,
  type FairValueSignalRecord,
  type MarketSnapshotRecord,
  type ReplayResultRecord,
  type StrategyLabResultRecord,
  type UnderlyingCandleRecord
} from "../src/index.js";

const checkedAt = "2026-05-07T00:00:00.000Z";

describe("research data store", () => {
  it("initializes schema and returns empty status", async () => {
    const store = createTestStore();
    await store.init();
    const status = await store.getStatus({ asOf: checkedAt });
    assert.equal(status.counts.underlying_candles, 0);
    assert.equal(status.counts.market_snapshots, 0);
    assert.equal(status.coverage.length, 4);
    await store.close();
  });

  it("upserts candles idempotently", async () => {
    const store = createTestStore();
    await store.init();
    const candle = mockCandle();
    assert.deepEqual(await store.insertUnderlyingCandles([candle]), {
      recordsInserted: 1,
      recordsUpdated: 0,
      recordsSkipped: 0
    });
    assert.deepEqual(await store.insertUnderlyingCandles([candle]), {
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsSkipped: 1
    });
    const status = await store.getStatus({ asOf: checkedAt });
    assert.equal(status.counts.underlying_candles, 1);
    await store.close();
  });

  it("appends market snapshots and skips near duplicate raw hashes", async () => {
    const store = createTestStore();
    await store.init();
    const snapshot = mockSnapshot();
    assert.equal((await store.insertMarketSnapshots([snapshot])).recordsInserted, 1);
    assert.equal((await store.insertMarketSnapshots([snapshot])).recordsSkipped, 1);
    assert.equal((await store.insertMarketSnapshots([{ ...snapshot, checkedAt: "2026-05-07T00:02:00.000Z" }])).recordsInserted, 1);
    const status = await store.getStatus({ asOf: "2026-05-07T00:03:00.000Z" });
    assert.equal(status.counts.market_snapshots, 2);
    await store.close();
  });

  it("inserts fair-value signals, replay results, strategy results, and capture runs", async () => {
    const store = createTestStore();
    await store.init();
    assert.equal((await store.insertFairValueSignals([mockFairValueSignal("LONG_YES")])).recordsInserted, 1);
    assert.equal((await store.insertFairValueSignals([mockFairValueSignal("REJECTED")])).recordsInserted, 1);
    assert.equal((await store.insertReplayResult(mockReplayResult())).recordsInserted, 1);
    assert.equal((await store.insertStrategyLabResult(mockStrategyLabResult())).recordsInserted, 1);
    assert.equal((await store.recordCaptureRun(mockCaptureRun("success"))).recordsInserted, 1);
    assert.equal((await store.recordCaptureRun(mockCaptureRun("failed"))).recordsInserted, 1);

    const replay = await store.getLatestReplayResult({ symbol: "BTC", window: "1w" });
    assert.equal(replay?.record.winRate, null);
    const strategy = await store.getLatestStrategyLabResult({ symbol: "BTC", window: "1w" });
    assert.equal(strategy?.record.overfitRisk, "unknown");
    const runs = await store.getCaptureRuns(5);
    assert.equal(runs.length, 2);
    assert.ok(runs.some((run) => run.status === "failed"));
    await store.close();
  });

  it("does not allow mock provider records to be written as live", async () => {
    const store = createTestStore();
    await store.init();
    await assert.rejects(
      () => store.insertMarketSnapshots([{ ...mockSnapshot(), provider: "mock", sourceType: "live" }]),
      /Mock provider records must be written with sourceType=mock/
    );
    await store.close();
  });
});

function createTestStore() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ept-store-"));
  return createResearchDataStore({ dbPath: path.join(dir, "test.sqlite") });
}

function mockCandle(): UnderlyingCandleRecord {
  return {
    provider: "binance-spot-public",
    sourceType: "mock",
    symbol: "BTCUSDT",
    interval: "1m",
    openTime: "2026-05-06T23:59:00.000Z",
    closeTime: checkedAt,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 10
  };
}

function mockSnapshot(): MarketSnapshotRecord {
  const raw = { marketId: "mock-market", yesPrice: 0.55 };
  return {
    provider: "mock",
    sourceType: "mock",
    symbol: "BTC",
    marketId: "mock-market",
    question: "Will BTC close above 100?",
    tokenIdYes: "yes",
    tokenIdNo: "no",
    yesPrice: 0.55,
    noPrice: 0.45,
    yesMidpoint: 0.55,
    noMidpoint: 0.45,
    spread: 0.02,
    liquidityStatus: "ok",
    rawHash: stableRawHash(raw),
    checkedAt
  };
}

function mockFairValueSignal(side: FairValueSignalRecord["side"]): FairValueSignalRecord {
  return {
    sourceType: "mock",
    symbol: "BTC",
    marketId: `mock-${side}`,
    signalTime: checkedAt,
    side,
    modelProbabilityYes: side === "REJECTED" ? null : 0.62,
    marketProbabilityYes: 0.55,
    edge: side === "REJECTED" ? null : 0.07,
    confidence: side === "REJECTED" ? 0 : 0.4,
    reason: side === "REJECTED" ? "Rejected by eligibility gate." : "YES edge after buffer.",
    rejectReasonsJson: JSON.stringify(side === "REJECTED" ? ["reject"] : []),
    isResearchOnly: true
  };
}

function mockReplayResult(): ReplayResultRecord {
  return {
    sourceType: "mock",
    symbol: "BTC",
    window: "1w",
    strategyId: "fair-value-v1",
    sampleCount: 0,
    actionableCount: 1,
    winCount: 0,
    lossCount: 0,
    pendingCount: 1,
    unresolvedCount: 0,
    rejectedCount: 1,
    noSignalCount: 0,
    winRate: null,
    coverageRate: 0.5,
    rejectionRate: 0.5,
    averageEdge: 0.04,
    averageConfidence: 0.3,
    theoreticalPnl: null,
    maxDrawdown: null,
    warningsJson: JSON.stringify(["NO_COMPLETED_REPLAY_SAMPLES"]),
    checkedAt
  };
}

function mockStrategyLabResult(): StrategyLabResultRecord {
  return {
    sourceType: "mock",
    symbol: "BTC",
    window: "1w",
    strategyId: "fair-value-v1",
    parameterSetJson: JSON.stringify({ id: "mock" }),
    score: null,
    winRate: null,
    actionableCount: 0,
    theoreticalPnl: null,
    maxDrawdown: null,
    overfitRisk: "unknown",
    consistencyScore: null,
    warningsJson: JSON.stringify(["LOW_SAMPLE_SIZE"]),
    checkedAt
  };
}

function mockCaptureRun(status: CaptureRunRecord["status"]): CaptureRunRecord {
  return {
    jobName: status === "success" ? "binance-candles" : "replay-metrics",
    status,
    startedAt: checkedAt,
    finishedAt: status === "success" ? "2026-05-07T00:00:01.000Z" : "2026-05-07T00:00:02.000Z",
    durationMs: status === "success" ? 1_000 : 2_000,
    sourceType: "mock",
    recordsInserted: status === "success" ? 1 : 0,
    recordsUpdated: 0,
    recordsSkipped: 0,
    errorMessage: status === "failed" ? "mock failure" : null,
    warningsJson: JSON.stringify(status === "failed" ? ["failed"] : [])
  };
}

