import { mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { ShortWindowReplayResponse, SignalReplayResponse, StrategyLabReport } from "@ept/shared-types";
import {
  COVERAGE_WINDOWS,
  DEFAULT_RESEARCH_STORE_PATH,
  MARKET_SNAPSHOT_DEDUP_WINDOW_MS,
  RESEARCH_STORE_SCHEMA_SQL,
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
  ShortWindowReplayResultRecord,
  ShortWindowSignalRecord,
  StoreStatus,
  StoreTableCounts,
  StrategyLabResultRecord,
  StoredShortWindowReplayResult,
  StoredReplayResult,
  StoredSignalSymbol,
  StoredStrategyLabResult,
  UnderlyingCandleRecord
} from "./types.js";

type DatabaseSyncConstructor = new (filename: string) => SqliteDatabase;
type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
};
type SqliteStatement = {
  run(...params: unknown[]): { changes?: number; lastInsertRowid?: number | bigint };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Array<Record<string, unknown>>;
};

const require = createRequire(import.meta.url);

export function isNodeSqliteAvailable(): boolean {
  try {
    require("node:sqlite");
    return true;
  } catch {
    return false;
  }
}

export function createSqliteResearchStore(options: { dbPath?: string | undefined } = {}): ResearchDataStore {
  return new SqliteResearchStore(resolveResearchStorePath(options.dbPath ?? process.env.EPT_RESEARCH_STORE_PATH ?? DEFAULT_RESEARCH_STORE_PATH));
}

class SqliteResearchStore implements ResearchDataStore {
  readonly kind = "sqlite" as const;
  readonly dbPath: string;
  private db: SqliteDatabase | null = null;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    this.database();
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  async insertMarketSnapshots(records: MarketSnapshotRecord[]): Promise<InsertSummary> {
    const db = this.database();
    let recordsInserted = 0;
    let recordsSkipped = 0;
    const insert = db.prepare(`
      INSERT INTO market_snapshots (
        provider, source_type, symbol, market_id, question, token_id_yes, token_id_no,
        yes_price, no_price, yes_midpoint, no_midpoint, spread, liquidity_status,
        raw_hash, checked_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const record of records) {
      assertStoreSource(record.provider, record.sourceType);
      if (this.hasNearDuplicateSnapshot(record)) {
        recordsSkipped += 1;
        continue;
      }
      const createdAt = record.createdAt ?? new Date().toISOString();
      const result = insert.run(
        record.provider,
        record.sourceType,
        record.symbol,
        nullable(record.marketId),
        nullable(record.question),
        nullable(record.tokenIdYes),
        nullable(record.tokenIdNo),
        nullable(record.yesPrice),
        nullable(record.noPrice),
        nullable(record.yesMidpoint),
        nullable(record.noMidpoint),
        nullable(record.spread),
        nullable(record.liquidityStatus),
        record.rawHash,
        record.checkedAt,
        createdAt
      );
      recordsInserted += result.changes ?? 0;
    }
    return { recordsInserted, recordsUpdated: 0, recordsSkipped };
  }

  async insertUnderlyingCandles(records: UnderlyingCandleRecord[]): Promise<InsertSummary> {
    const db = this.database();
    let recordsInserted = 0;
    let recordsSkipped = 0;
    const exists = db.prepare(`
      SELECT id FROM underlying_candles
      WHERE symbol = ? AND interval = ? AND open_time = ? AND provider = ?
      LIMIT 1
    `);
    const insert = db.prepare(`
      INSERT OR IGNORE INTO underlying_candles (
        provider, source_type, symbol, interval, open_time, close_time,
        open, high, low, close, volume, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const record of records) {
      assertStoreSource(record.provider, record.sourceType);
      if (exists.get(record.symbol, record.interval, record.openTime, record.provider)) {
        recordsSkipped += 1;
        continue;
      }
      const createdAt = record.createdAt ?? new Date().toISOString();
      const result = insert.run(
        record.provider,
        record.sourceType,
        record.symbol,
        record.interval,
        record.openTime,
        record.closeTime,
        record.open,
        record.high,
        record.low,
        record.close,
        record.volume,
        createdAt
      );
      recordsInserted += result.changes ?? 0;
      if (!result.changes) {
        recordsSkipped += 1;
      }
    }
    return { recordsInserted, recordsUpdated: 0, recordsSkipped };
  }

  async insertFairValueSignals(records: FairValueSignalRecord[]): Promise<InsertSummary> {
    const db = this.database();
    let recordsInserted = 0;
    let recordsSkipped = 0;
    const exists = db.prepare(`
      SELECT id FROM fair_value_signals
      WHERE source_type = ? AND symbol = ? AND market_id = ? AND signal_time = ? AND side = ?
      LIMIT 1
    `);
    const insert = db.prepare(`
      INSERT OR IGNORE INTO fair_value_signals (
        source_type, symbol, market_id, signal_time, side, model_probability_yes,
        market_probability_yes, edge, confidence, reason, reject_reasons_json,
        is_research_only, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const record of records) {
      assertStoreSource(undefined, record.sourceType);
      if (record.sourceType === "mock" && record.marketId.startsWith("live:")) {
        throw new Error("Mock fair-value signal cannot be written with a live market id marker.");
      }
      if (exists.get(record.sourceType, record.symbol, record.marketId, record.signalTime, record.side)) {
        recordsSkipped += 1;
        continue;
      }
      const createdAt = record.createdAt ?? new Date().toISOString();
      const result = insert.run(
        record.sourceType,
        record.symbol,
        record.marketId,
        record.signalTime,
        record.side,
        nullable(record.modelProbabilityYes),
        nullable(record.marketProbabilityYes),
        nullable(record.edge),
        nullable(record.confidence),
        record.reason,
        record.rejectReasonsJson,
        record.isResearchOnly ? 1 : 0,
        createdAt
      );
      recordsInserted += result.changes ?? 0;
      if (!result.changes) {
        recordsSkipped += 1;
      }
    }
    return { recordsInserted, recordsUpdated: 0, recordsSkipped };
  }

  async insertReplayResult(record: ReplayResultRecord): Promise<InsertSummary> {
    const db = this.database();
    assertStoreSource(undefined, record.sourceType);
    const exists = db.prepare(`
      SELECT id FROM replay_results
      WHERE source_type = ? AND symbol = ? AND window = ? AND strategy_id = ? AND checked_at = ?
      LIMIT 1
    `);
    if (exists.get(record.sourceType, record.symbol, record.window, record.strategyId, record.checkedAt)) {
      return { recordsInserted: 0, recordsUpdated: 0, recordsSkipped: 1 };
    }
    const createdAt = record.createdAt ?? new Date().toISOString();
    const result = db.prepare(`
      INSERT OR IGNORE INTO replay_results (
        source_type, symbol, window, strategy_id, sample_count, actionable_count,
        win_count, loss_count, pending_count, unresolved_count, rejected_count,
        no_signal_count, win_rate, coverage_rate, rejection_rate, average_edge,
        average_confidence, theoretical_pnl, max_drawdown, warnings_json,
        checked_at, created_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.sourceType,
      record.symbol,
      record.window,
      record.strategyId,
      record.sampleCount,
      record.actionableCount,
      record.winCount,
      record.lossCount,
      record.pendingCount,
      record.unresolvedCount,
      record.rejectedCount,
      record.noSignalCount,
      nullable(record.winRate),
      nullable(record.coverageRate),
      nullable(record.rejectionRate),
      nullable(record.averageEdge),
      nullable(record.averageConfidence),
      nullable(record.theoreticalPnl),
      nullable(record.maxDrawdown),
      record.warningsJson,
      record.checkedAt,
      createdAt,
      nullable(record.payloadJson)
    );
    return { recordsInserted: result.changes ?? 0, recordsUpdated: 0, recordsSkipped: result.changes ? 0 : 1 };
  }

  async insertShortWindowSignals(records: ShortWindowSignalRecord[]): Promise<InsertSummary> {
    const db = this.database();
    let recordsInserted = 0;
    let recordsSkipped = 0;
    const exists = db.prepare(`
      SELECT id FROM short_window_signals
      WHERE source_type = ? AND venue = ? AND symbol = ? AND interval = ?
        AND event_id = ? AND signal_time = ? AND side = ?
      LIMIT 1
    `);
    const insert = db.prepare(`
      INSERT OR IGNORE INTO short_window_signals (
        source_type, venue, symbol, interval, event_id, signal_time, side,
        confidence, score, start_reference_price, current_price, result_status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const record of records) {
      assertStoreSource(undefined, record.sourceType);
      if (exists.get(record.sourceType, record.venue, record.symbol, record.interval, record.eventId, record.signalTime, record.side)) {
        recordsSkipped += 1;
        continue;
      }
      const createdAt = record.createdAt ?? new Date().toISOString();
      const result = insert.run(
        record.sourceType,
        record.venue,
        record.symbol,
        record.interval,
        record.eventId,
        record.signalTime,
        record.side,
        nullable(record.confidence),
        nullable(record.score),
        nullable(record.startReferencePrice),
        nullable(record.currentPrice),
        nullable(record.resultStatus),
        createdAt
      );
      recordsInserted += result.changes ?? 0;
      if (!result.changes) {
        recordsSkipped += 1;
      }
    }
    return { recordsInserted, recordsUpdated: 0, recordsSkipped };
  }

  async insertShortWindowReplayResult(record: ShortWindowReplayResultRecord): Promise<InsertSummary> {
    const db = this.database();
    assertStoreSource(undefined, record.sourceType);
    const exists = db.prepare(`
      SELECT id FROM short_window_replay_results
      WHERE source_type = ? AND venue = ? AND symbol = ? AND interval = ? AND window = ? AND checked_at = ?
      LIMIT 1
    `);
    if (exists.get(record.sourceType, record.venue, record.symbol, record.interval, record.window, record.checkedAt)) {
      return { recordsInserted: 0, recordsUpdated: 0, recordsSkipped: 1 };
    }
    const createdAt = record.createdAt ?? new Date().toISOString();
    const result = db.prepare(`
      INSERT OR IGNORE INTO short_window_replay_results (
        source_type, venue, symbol, interval, window, total_events, actionable_count,
        win_count, loss_count, wait_count, rejected_count, win_rate, warnings_json,
        checked_at, created_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.sourceType,
      record.venue,
      record.symbol,
      record.interval,
      record.window,
      record.totalEvents,
      record.actionableCount,
      record.winCount,
      record.lossCount,
      record.waitCount,
      record.rejectedCount,
      nullable(record.winRate),
      record.warningsJson,
      record.checkedAt,
      createdAt,
      nullable(record.payloadJson)
    );
    return { recordsInserted: result.changes ?? 0, recordsUpdated: 0, recordsSkipped: result.changes ? 0 : 1 };
  }

  async insertStrategyLabResult(record: StrategyLabResultRecord): Promise<InsertSummary> {
    const db = this.database();
    assertStoreSource(undefined, record.sourceType);
    const exists = db.prepare(`
      SELECT id FROM strategy_lab_results
      WHERE source_type = ? AND symbol = ? AND window = ? AND strategy_id = ?
        AND parameter_set_json = ? AND checked_at = ?
      LIMIT 1
    `);
    if (exists.get(record.sourceType, record.symbol, record.window, record.strategyId, record.parameterSetJson, record.checkedAt)) {
      return { recordsInserted: 0, recordsUpdated: 0, recordsSkipped: 1 };
    }
    const createdAt = record.createdAt ?? new Date().toISOString();
    const result = db.prepare(`
      INSERT OR IGNORE INTO strategy_lab_results (
        source_type, symbol, window, strategy_id, parameter_set_json, score, win_rate,
        actionable_count, theoretical_pnl, max_drawdown, overfit_risk,
        consistency_score, warnings_json, checked_at, created_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.sourceType,
      record.symbol,
      record.window,
      record.strategyId,
      record.parameterSetJson,
      nullable(record.score),
      nullable(record.winRate),
      record.actionableCount,
      nullable(record.theoreticalPnl),
      nullable(record.maxDrawdown),
      record.overfitRisk,
      nullable(record.consistencyScore),
      record.warningsJson,
      record.checkedAt,
      createdAt,
      nullable(record.payloadJson)
    );
    return { recordsInserted: result.changes ?? 0, recordsUpdated: 0, recordsSkipped: result.changes ? 0 : 1 };
  }

  async recordCaptureRun(record: CaptureRunRecord): Promise<InsertSummary> {
    const db = this.database();
    assertStoreSource(undefined, record.sourceType);
    const result = db.prepare(`
      INSERT INTO capture_runs (
        job_name, status, started_at, finished_at, duration_ms, source_type,
        records_inserted, records_updated, records_skipped, error_message, warnings_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.jobName,
      record.status,
      record.startedAt,
      record.finishedAt,
      record.durationMs,
      record.sourceType,
      record.recordsInserted,
      record.recordsUpdated,
      record.recordsSkipped,
      nullable(record.errorMessage),
      record.warningsJson
    );
    return { recordsInserted: result.changes ?? 0, recordsUpdated: 0, recordsSkipped: result.changes ? 0 : 1 };
  }

  async getStatus(input: { asOf?: string | undefined } = {}): Promise<StoreStatus> {
    const checkedAt = input.asOf ?? new Date().toISOString();
    const counts: StoreTableCounts = {
      market_snapshots: this.scalarNumber("SELECT COUNT(*) AS value FROM market_snapshots"),
      underlying_candles: this.scalarNumber("SELECT COUNT(*) AS value FROM underlying_candles"),
      fair_value_signals: this.scalarNumber("SELECT COUNT(*) AS value FROM fair_value_signals"),
      replay_results: this.scalarNumber("SELECT COUNT(*) AS value FROM replay_results"),
      short_window_signals: this.scalarNumber("SELECT COUNT(*) AS value FROM short_window_signals"),
      short_window_replay_results: this.scalarNumber("SELECT COUNT(*) AS value FROM short_window_replay_results"),
      strategy_lab_results: this.scalarNumber("SELECT COUNT(*) AS value FROM strategy_lab_results"),
      capture_runs: this.scalarNumber("SELECT COUNT(*) AS value FROM capture_runs")
    };
    return {
      storeKind: "sqlite",
      dbPath: this.dbPath,
      checkedAt,
      counts,
      latest: {
        latestMarketSnapshotAt: this.scalarText("SELECT MAX(checked_at) AS value FROM market_snapshots"),
        latestCandleCloseAt: this.scalarText("SELECT MAX(close_time) AS value FROM underlying_candles"),
        latestFairValueSignalAt: this.scalarText("SELECT MAX(signal_time) AS value FROM fair_value_signals"),
        latestReplayMetricsAt: this.scalarText("SELECT MAX(checked_at) AS value FROM replay_results"),
        latestShortWindowSignalAt: this.scalarText("SELECT MAX(signal_time) AS value FROM short_window_signals"),
        latestShortWindowReplayAt: this.scalarText("SELECT MAX(checked_at) AS value FROM short_window_replay_results"),
        latestStrategyLabResultAt: this.scalarText("SELECT MAX(checked_at) AS value FROM strategy_lab_results"),
        latestCaptureRunAt: this.scalarText("SELECT MAX(finished_at) AS value FROM capture_runs")
      },
      coverage: COVERAGE_WINDOWS.map((window) => {
        const since = new Date(Date.parse(checkedAt) - window.durationMs).toISOString();
        return {
          window: window.id,
          since,
          candleCount: this.scalarNumber("SELECT COUNT(*) AS value FROM underlying_candles WHERE close_time >= ?", since),
          marketSnapshotCount: this.scalarNumber("SELECT COUNT(*) AS value FROM market_snapshots WHERE checked_at >= ?", since),
          fairValueSignalCount: this.scalarNumber("SELECT COUNT(*) AS value FROM fair_value_signals WHERE signal_time >= ?", since),
          replayResultCount: this.scalarNumber("SELECT COUNT(*) AS value FROM replay_results WHERE checked_at >= ?", since),
          shortWindowSignalCount: this.scalarNumber("SELECT COUNT(*) AS value FROM short_window_signals WHERE signal_time >= ?", since),
          shortWindowReplayResultCount: this.scalarNumber("SELECT COUNT(*) AS value FROM short_window_replay_results WHERE checked_at >= ?", since),
          strategyLabResultCount: this.scalarNumber("SELECT COUNT(*) AS value FROM strategy_lab_results WHERE checked_at >= ?", since)
        };
      }),
      latestCaptureRun: (await this.getCaptureRuns(1))[0] ?? null
    };
  }

  async getCaptureRuns(limit = 20): Promise<CaptureRunRecord[]> {
    const db = this.database();
    return db.prepare(`
      SELECT * FROM capture_runs
      ORDER BY finished_at DESC, id DESC
      LIMIT ?
    `).all(Math.max(1, Math.min(200, Math.floor(limit)))).map(rowToCaptureRun);
  }

  async getLatestReplayResult(input: {
    symbol: StoredSignalSymbol;
    window: CoverageWindowId;
    strategyId?: "fair-value-v1" | undefined;
  }): Promise<StoredReplayResult | null> {
    const db = this.database();
    const row = db.prepare(`
      SELECT * FROM replay_results
      WHERE symbol = ? AND window = ? AND strategy_id = ?
      ORDER BY checked_at DESC, id DESC
      LIMIT 1
    `).get(input.symbol, input.window, input.strategyId ?? "fair-value-v1");
    if (!row) {
      return null;
    }
    const record = rowToReplayResult(row);
    return {
      record,
      response: parsePayload<SignalReplayResponse>(record.payloadJson)
    };
  }

  async getLatestShortWindowReplayResult(input: {
    symbol: ShortWindowReplayResultRecord["symbol"];
    interval: ShortWindowReplayResultRecord["interval"];
    window: ShortWindowReplayResultRecord["window"];
    venue?: ShortWindowReplayResultRecord["venue"] | undefined;
  }): Promise<StoredShortWindowReplayResult | null> {
    const db = this.database();
    const row = input.venue
      ? db.prepare(`
        SELECT * FROM short_window_replay_results
        WHERE symbol = ? AND interval = ? AND window = ? AND venue = ?
        ORDER BY checked_at DESC, id DESC
        LIMIT 1
      `).get(input.symbol, input.interval, input.window, input.venue)
      : db.prepare(`
        SELECT * FROM short_window_replay_results
        WHERE symbol = ? AND interval = ? AND window = ?
        ORDER BY checked_at DESC, id DESC
        LIMIT 1
      `).get(input.symbol, input.interval, input.window);
    if (!row) {
      return null;
    }
    const record = rowToShortWindowReplayResult(row);
    return {
      record,
      response: parsePayload<ShortWindowReplayResponse>(record.payloadJson)
    };
  }

  async getLatestStrategyLabResult(input: {
    symbol: StoredSignalSymbol;
    window: CoverageWindowId;
    strategyId?: "fair-value-v1" | undefined;
  }): Promise<StoredStrategyLabResult | null> {
    const db = this.database();
    const row = db.prepare(`
      SELECT * FROM strategy_lab_results
      WHERE symbol = ? AND window = ? AND strategy_id = ?
      ORDER BY checked_at DESC, id DESC
      LIMIT 1
    `).get(input.symbol, input.window, input.strategyId ?? "fair-value-v1");
    if (!row) {
      return null;
    }
    const record = rowToStrategyLabResult(row);
    return {
      record,
      report: parsePayload<StrategyLabReport>(record.payloadJson)
    };
  }

  private database(): SqliteDatabase {
    if (this.db) {
      return this.db;
    }
    if (this.dbPath !== ":memory:") {
      mkdirSync(path.dirname(path.resolve(this.dbPath)), { recursive: true });
    }
    const sqlite = require("node:sqlite") as { DatabaseSync: DatabaseSyncConstructor };
    const db = new sqlite.DatabaseSync(this.dbPath);
    db.exec(RESEARCH_STORE_SCHEMA_SQL);
    this.db = db;
    return db;
  }

  private hasNearDuplicateSnapshot(record: MarketSnapshotRecord): boolean {
    const db = this.database();
    const rows = db.prepare(`
      SELECT checked_at FROM market_snapshots
      WHERE provider = ? AND source_type = ? AND symbol = ? AND ifnull(market_id, '') = ifnull(?, '')
        AND raw_hash = ?
      ORDER BY checked_at DESC
      LIMIT 10
    `).all(record.provider, record.sourceType, record.symbol, nullable(record.marketId), record.rawHash);
    const checkedAtMs = Date.parse(record.checkedAt);
    return rows.some((row) => {
      const previous = textValue(row.checked_at);
      return previous !== null && Math.abs(checkedAtMs - Date.parse(previous)) <= MARKET_SNAPSHOT_DEDUP_WINDOW_MS;
    });
  }

  private scalarNumber(sql: string, ...params: unknown[]): number {
    const row = this.database().prepare(sql).get(...params);
    const value = row?.value;
    return typeof value === "number" ? value : Number(value ?? 0);
  }

  private scalarText(sql: string, ...params: unknown[]): string | null {
    const row = this.database().prepare(sql).get(...params);
    return textValue(row?.value);
  }
}

function rowToCaptureRun(row: Record<string, unknown>): CaptureRunRecord {
  return {
    id: numberValue(row.id) ?? 0,
    jobName: stringValue(row.job_name),
    status: statusValue(row.status),
    startedAt: stringValue(row.started_at),
    finishedAt: stringValue(row.finished_at),
    durationMs: numberValue(row.duration_ms) ?? 0,
    sourceType: sourceTypeValue(row.source_type),
    recordsInserted: numberValue(row.records_inserted) ?? 0,
    recordsUpdated: numberValue(row.records_updated) ?? 0,
    recordsSkipped: numberValue(row.records_skipped) ?? 0,
    errorMessage: textValue(row.error_message),
    warningsJson: stringValue(row.warnings_json)
  };
}

function rowToReplayResult(row: Record<string, unknown>): ReplayResultRecord {
  return {
    id: numberValue(row.id) ?? 0,
    sourceType: sourceTypeValue(row.source_type),
    symbol: stringValue(row.symbol) as StoredSignalSymbol,
    window: stringValue(row.window) as CoverageWindowId,
    strategyId: "fair-value-v1",
    sampleCount: numberValue(row.sample_count) ?? 0,
    actionableCount: numberValue(row.actionable_count) ?? 0,
    winCount: numberValue(row.win_count) ?? 0,
    lossCount: numberValue(row.loss_count) ?? 0,
    pendingCount: numberValue(row.pending_count) ?? 0,
    unresolvedCount: numberValue(row.unresolved_count) ?? 0,
    rejectedCount: numberValue(row.rejected_count) ?? 0,
    noSignalCount: numberValue(row.no_signal_count) ?? 0,
    winRate: numberValue(row.win_rate),
    coverageRate: numberValue(row.coverage_rate),
    rejectionRate: numberValue(row.rejection_rate),
    averageEdge: numberValue(row.average_edge),
    averageConfidence: numberValue(row.average_confidence),
    theoreticalPnl: numberValue(row.theoretical_pnl),
    maxDrawdown: numberValue(row.max_drawdown),
    warningsJson: stringValue(row.warnings_json),
    checkedAt: stringValue(row.checked_at),
    createdAt: stringValue(row.created_at),
    payloadJson: textValue(row.payload_json)
  };
}

function rowToShortWindowReplayResult(row: Record<string, unknown>): ShortWindowReplayResultRecord {
  return {
    id: numberValue(row.id) ?? 0,
    sourceType: sourceTypeValue(row.source_type),
    venue: stringValue(row.venue) as ShortWindowReplayResultRecord["venue"],
    symbol: stringValue(row.symbol) as ShortWindowReplayResultRecord["symbol"],
    interval: stringValue(row.interval) as ShortWindowReplayResultRecord["interval"],
    window: stringValue(row.window) as ShortWindowReplayResultRecord["window"],
    totalEvents: numberValue(row.total_events) ?? 0,
    actionableCount: numberValue(row.actionable_count) ?? 0,
    winCount: numberValue(row.win_count) ?? 0,
    lossCount: numberValue(row.loss_count) ?? 0,
    waitCount: numberValue(row.wait_count) ?? 0,
    rejectedCount: numberValue(row.rejected_count) ?? 0,
    winRate: numberValue(row.win_rate),
    warningsJson: stringValue(row.warnings_json),
    checkedAt: stringValue(row.checked_at),
    createdAt: stringValue(row.created_at),
    payloadJson: textValue(row.payload_json)
  };
}

function rowToStrategyLabResult(row: Record<string, unknown>): StrategyLabResultRecord {
  return {
    id: numberValue(row.id) ?? 0,
    sourceType: sourceTypeValue(row.source_type),
    symbol: stringValue(row.symbol) as StoredSignalSymbol,
    window: stringValue(row.window) as CoverageWindowId,
    strategyId: "fair-value-v1",
    parameterSetJson: stringValue(row.parameter_set_json),
    score: numberValue(row.score),
    winRate: numberValue(row.win_rate),
    actionableCount: numberValue(row.actionable_count) ?? 0,
    theoreticalPnl: numberValue(row.theoretical_pnl),
    maxDrawdown: numberValue(row.max_drawdown),
    overfitRisk: overfitRiskValue(row.overfit_risk),
    consistencyScore: numberValue(row.consistency_score),
    warningsJson: stringValue(row.warnings_json),
    checkedAt: stringValue(row.checked_at),
    createdAt: stringValue(row.created_at),
    payloadJson: textValue(row.payload_json)
  };
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

function sourceTypeValue(value: unknown): "live" | "mock" | "fixture" {
  return value === "mock" || value === "fixture" ? value : "live";
}

function statusValue(value: unknown): "success" | "partial" | "failed" {
  return value === "partial" || value === "failed" ? value : "success";
}

function overfitRiskValue(value: unknown): "low" | "medium" | "high" | "unknown" {
  return value === "low" || value === "medium" || value === "high" ? value : "unknown";
}

function nullable(value: unknown): unknown {
  return value === undefined ? null : value;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
