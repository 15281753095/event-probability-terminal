import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { SignalReplayResponse, StrategyLabReport } from "@ept/shared-types";
import {
  COVERAGE_WINDOWS,
  DEFAULT_RESEARCH_STORE_PATH,
  MARKET_SNAPSHOT_DEDUP_WINDOW_MS,
  assertStoreSource,
  resolveResearchStorePath
} from "./schema.js";
import type {
  CaptureRunRecord,
  CoverageWindowId,
  FairValueSignalRecord,
  InsertSummary,
  MarketSnapshotRecord,
  ReplayResultRecord,
  ResearchDataStore,
  StoreStatus,
  StoreTableCounts,
  StrategyLabResultRecord,
  StoredReplayResult,
  StoredSignalSymbol,
  StoredStrategyLabResult,
  UnderlyingCandleRecord
} from "./types.js";

type JsonlTables = {
  marketSnapshots: MarketSnapshotRecord[];
  underlyingCandles: UnderlyingCandleRecord[];
  fairValueSignals: FairValueSignalRecord[];
  replayResults: ReplayResultRecord[];
  strategyLabResults: StrategyLabResultRecord[];
  captureRuns: CaptureRunRecord[];
};

export function createJsonlResearchStore(options: { dirPath?: string | undefined } = {}): ResearchDataStore {
  const defaultDir = `${DEFAULT_RESEARCH_STORE_PATH.replace(/\.sqlite$/, "")}-jsonl`;
  return new JsonlResearchStore(resolveResearchStorePath(options.dirPath ?? process.env.EPT_RESEARCH_STORE_JSONL_DIR ?? defaultDir));
}

class JsonlResearchStore implements ResearchDataStore {
  readonly kind = "jsonl" as const;
  readonly dbPath: string;
  private initialized = false;
  private tables: JsonlTables = {
    marketSnapshots: [],
    underlyingCandles: [],
    fairValueSignals: [],
    replayResults: [],
    strategyLabResults: [],
    captureRuns: []
  };

  constructor(dirPath: string) {
    this.dbPath = dirPath;
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    mkdirSync(this.dbPath, { recursive: true });
    this.tables = {
      marketSnapshots: this.loadTable<MarketSnapshotRecord>("market_snapshots"),
      underlyingCandles: this.loadTable<UnderlyingCandleRecord>("underlying_candles"),
      fairValueSignals: this.loadTable<FairValueSignalRecord>("fair_value_signals"),
      replayResults: this.loadTable<ReplayResultRecord>("replay_results"),
      strategyLabResults: this.loadTable<StrategyLabResultRecord>("strategy_lab_results"),
      captureRuns: this.loadTable<CaptureRunRecord>("capture_runs")
    };
    this.initialized = true;
  }

  async close(): Promise<void> {
    this.initialized = false;
  }

  async insertMarketSnapshots(records: MarketSnapshotRecord[]): Promise<InsertSummary> {
    await this.init();
    let recordsInserted = 0;
    let recordsSkipped = 0;
    for (const record of records) {
      assertStoreSource(record.provider, record.sourceType);
      const checkedAtMs = Date.parse(record.checkedAt);
      const duplicate = this.tables.marketSnapshots.some((item) =>
        item.provider === record.provider &&
        item.sourceType === record.sourceType &&
        item.symbol === record.symbol &&
        (item.marketId ?? "") === (record.marketId ?? "") &&
        item.rawHash === record.rawHash &&
        Math.abs(Date.parse(item.checkedAt) - checkedAtMs) <= MARKET_SNAPSHOT_DEDUP_WINDOW_MS
      );
      if (duplicate) {
        recordsSkipped += 1;
        continue;
      }
      const next = { ...record, id: this.tables.marketSnapshots.length + 1, createdAt: record.createdAt ?? new Date().toISOString() };
      this.tables.marketSnapshots.push(next);
      this.append("market_snapshots", next);
      recordsInserted += 1;
    }
    return { recordsInserted, recordsUpdated: 0, recordsSkipped };
  }

  async insertUnderlyingCandles(records: UnderlyingCandleRecord[]): Promise<InsertSummary> {
    await this.init();
    let recordsInserted = 0;
    let recordsSkipped = 0;
    for (const record of records) {
      assertStoreSource(record.provider, record.sourceType);
      const duplicate = this.tables.underlyingCandles.some((item) =>
        item.symbol === record.symbol &&
        item.interval === record.interval &&
        item.openTime === record.openTime &&
        item.provider === record.provider
      );
      if (duplicate) {
        recordsSkipped += 1;
        continue;
      }
      const next = { ...record, id: this.tables.underlyingCandles.length + 1, createdAt: record.createdAt ?? new Date().toISOString() };
      this.tables.underlyingCandles.push(next);
      this.append("underlying_candles", next);
      recordsInserted += 1;
    }
    return { recordsInserted, recordsUpdated: 0, recordsSkipped };
  }

  async insertFairValueSignals(records: FairValueSignalRecord[]): Promise<InsertSummary> {
    await this.init();
    let recordsInserted = 0;
    let recordsSkipped = 0;
    for (const record of records) {
      assertStoreSource(undefined, record.sourceType);
      const duplicate = this.tables.fairValueSignals.some((item) =>
        item.sourceType === record.sourceType &&
        item.symbol === record.symbol &&
        item.marketId === record.marketId &&
        item.signalTime === record.signalTime &&
        item.side === record.side
      );
      if (duplicate) {
        recordsSkipped += 1;
        continue;
      }
      const next = { ...record, id: this.tables.fairValueSignals.length + 1, createdAt: record.createdAt ?? new Date().toISOString() };
      this.tables.fairValueSignals.push(next);
      this.append("fair_value_signals", next);
      recordsInserted += 1;
    }
    return { recordsInserted, recordsUpdated: 0, recordsSkipped };
  }

  async insertReplayResult(record: ReplayResultRecord): Promise<InsertSummary> {
    await this.init();
    assertStoreSource(undefined, record.sourceType);
    const duplicate = this.tables.replayResults.some((item) =>
      item.sourceType === record.sourceType &&
      item.symbol === record.symbol &&
      item.window === record.window &&
      item.strategyId === record.strategyId &&
      item.checkedAt === record.checkedAt
    );
    if (duplicate) {
      return { recordsInserted: 0, recordsUpdated: 0, recordsSkipped: 1 };
    }
    const next = { ...record, id: this.tables.replayResults.length + 1, createdAt: record.createdAt ?? new Date().toISOString() };
    this.tables.replayResults.push(next);
    this.append("replay_results", next);
    return { recordsInserted: 1, recordsUpdated: 0, recordsSkipped: 0 };
  }

  async insertStrategyLabResult(record: StrategyLabResultRecord): Promise<InsertSummary> {
    await this.init();
    assertStoreSource(undefined, record.sourceType);
    const duplicate = this.tables.strategyLabResults.some((item) =>
      item.sourceType === record.sourceType &&
      item.symbol === record.symbol &&
      item.window === record.window &&
      item.strategyId === record.strategyId &&
      item.parameterSetJson === record.parameterSetJson &&
      item.checkedAt === record.checkedAt
    );
    if (duplicate) {
      return { recordsInserted: 0, recordsUpdated: 0, recordsSkipped: 1 };
    }
    const next = { ...record, id: this.tables.strategyLabResults.length + 1, createdAt: record.createdAt ?? new Date().toISOString() };
    this.tables.strategyLabResults.push(next);
    this.append("strategy_lab_results", next);
    return { recordsInserted: 1, recordsUpdated: 0, recordsSkipped: 0 };
  }

  async recordCaptureRun(record: CaptureRunRecord): Promise<InsertSummary> {
    await this.init();
    assertStoreSource(undefined, record.sourceType);
    const next = { ...record, id: this.tables.captureRuns.length + 1 };
    this.tables.captureRuns.push(next);
    this.append("capture_runs", next);
    return { recordsInserted: 1, recordsUpdated: 0, recordsSkipped: 0 };
  }

  async getStatus(input: { asOf?: string | undefined } = {}): Promise<StoreStatus> {
    await this.init();
    const checkedAt = input.asOf ?? new Date().toISOString();
    const counts: StoreTableCounts = {
      market_snapshots: this.tables.marketSnapshots.length,
      underlying_candles: this.tables.underlyingCandles.length,
      fair_value_signals: this.tables.fairValueSignals.length,
      replay_results: this.tables.replayResults.length,
      strategy_lab_results: this.tables.strategyLabResults.length,
      capture_runs: this.tables.captureRuns.length
    };
    const latestCaptureRun = [...this.tables.captureRuns].sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))[0] ?? null;
    return {
      storeKind: "jsonl",
      dbPath: this.dbPath,
      checkedAt,
      counts,
      latest: {
        latestMarketSnapshotAt: maxIso(this.tables.marketSnapshots.map((item) => item.checkedAt)),
        latestCandleCloseAt: maxIso(this.tables.underlyingCandles.map((item) => item.closeTime)),
        latestFairValueSignalAt: maxIso(this.tables.fairValueSignals.map((item) => item.signalTime)),
        latestReplayMetricsAt: maxIso(this.tables.replayResults.map((item) => item.checkedAt)),
        latestStrategyLabResultAt: maxIso(this.tables.strategyLabResults.map((item) => item.checkedAt)),
        latestCaptureRunAt: maxIso(this.tables.captureRuns.map((item) => item.finishedAt))
      },
      coverage: COVERAGE_WINDOWS.map((window) => {
        const since = new Date(Date.parse(checkedAt) - window.durationMs).toISOString();
        return {
          window: window.id,
          since,
          candleCount: this.tables.underlyingCandles.filter((item) => item.closeTime >= since).length,
          marketSnapshotCount: this.tables.marketSnapshots.filter((item) => item.checkedAt >= since).length,
          fairValueSignalCount: this.tables.fairValueSignals.filter((item) => item.signalTime >= since).length,
          replayResultCount: this.tables.replayResults.filter((item) => item.checkedAt >= since).length,
          strategyLabResultCount: this.tables.strategyLabResults.filter((item) => item.checkedAt >= since).length
        };
      }),
      latestCaptureRun
    };
  }

  async getCaptureRuns(limit = 20): Promise<CaptureRunRecord[]> {
    await this.init();
    return [...this.tables.captureRuns]
      .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))
      .slice(0, Math.max(1, Math.min(200, Math.floor(limit))));
  }

  async getLatestReplayResult(input: {
    symbol: StoredSignalSymbol;
    window: CoverageWindowId;
    strategyId?: "fair-value-v1" | undefined;
  }): Promise<StoredReplayResult | null> {
    await this.init();
    const record = [...this.tables.replayResults]
      .filter((item) => item.symbol === input.symbol && item.window === input.window && item.strategyId === (input.strategyId ?? "fair-value-v1"))
      .sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt))[0];
    if (!record) {
      return null;
    }
    return { record, response: parsePayload<SignalReplayResponse>(record.payloadJson) };
  }

  async getLatestStrategyLabResult(input: {
    symbol: StoredSignalSymbol;
    window: CoverageWindowId;
    strategyId?: "fair-value-v1" | undefined;
  }): Promise<StoredStrategyLabResult | null> {
    await this.init();
    const record = [...this.tables.strategyLabResults]
      .filter((item) => item.symbol === input.symbol && item.window === input.window && item.strategyId === (input.strategyId ?? "fair-value-v1"))
      .sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt))[0];
    if (!record) {
      return null;
    }
    return { record, report: parsePayload<StrategyLabReport>(record.payloadJson) };
  }

  private loadTable<T>(name: string): T[] {
    const file = this.filePath(name);
    if (!existsSync(file)) {
      return [];
    }
    return readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  }

  private append(name: string, record: unknown): void {
    mkdirSync(this.dbPath, { recursive: true });
    appendFileSync(this.filePath(name), `${JSON.stringify(record)}\n`);
  }

  private filePath(name: string): string {
    return path.join(this.dbPath, `${name}.jsonl`);
  }
}

function maxIso(values: string[]): string | null {
  return values.length
    ? values.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
    : null;
}

function parsePayload<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
