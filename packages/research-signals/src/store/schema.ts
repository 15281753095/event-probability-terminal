import { createHash } from "node:crypto";
import path from "node:path";
import type { DataSourceType } from "@ept/shared-types";
import type { CoverageWindowId, ResearchStoreProvider } from "./types.js";

export const DEFAULT_RESEARCH_STORE_PATH = ".var/ept-research.sqlite";
export const MARKET_SNAPSHOT_DEDUP_WINDOW_MS = 60_000;
export const COVERAGE_WINDOWS: Array<{ id: CoverageWindowId; durationMs: number }> = [
  { id: "1d", durationMs: 24 * 60 * 60 * 1000 },
  { id: "3d", durationMs: 3 * 24 * 60 * 60 * 1000 },
  { id: "1w", durationMs: 7 * 24 * 60 * 60 * 1000 },
  { id: "1m", durationMs: 30 * 24 * 60 * 60 * 1000 }
];

export const RESEARCH_STORE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS market_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  source_type TEXT NOT NULL,
  symbol TEXT NOT NULL,
  market_id TEXT,
  question TEXT,
  token_id_yes TEXT,
  token_id_no TEXT,
  yes_price REAL,
  no_price REAL,
  yes_midpoint REAL,
  no_midpoint REAL,
  spread REAL,
  liquidity_status TEXT,
  raw_hash TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_snapshots_checked_at ON market_snapshots(checked_at);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_raw_hash ON market_snapshots(provider, source_type, symbol, market_id, raw_hash, checked_at);

CREATE TABLE IF NOT EXISTS underlying_candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  source_type TEXT NOT NULL,
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL,
  open_time TEXT NOT NULL,
  close_time TEXT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(symbol, interval, open_time, provider)
);

CREATE INDEX IF NOT EXISTS idx_underlying_candles_close_time ON underlying_candles(close_time);

CREATE TABLE IF NOT EXISTS fair_value_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  symbol TEXT NOT NULL,
  market_id TEXT NOT NULL,
  signal_time TEXT NOT NULL,
  side TEXT NOT NULL,
  model_probability_yes REAL,
  market_probability_yes REAL,
  edge REAL,
  confidence REAL,
  reason TEXT NOT NULL,
  reject_reasons_json TEXT NOT NULL,
  is_research_only INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(source_type, symbol, market_id, signal_time, side)
);

CREATE INDEX IF NOT EXISTS idx_fair_value_signals_signal_time ON fair_value_signals(signal_time);

CREATE TABLE IF NOT EXISTS replay_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  symbol TEXT NOT NULL,
  window TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  sample_count INTEGER NOT NULL,
  actionable_count INTEGER NOT NULL,
  win_count INTEGER NOT NULL,
  loss_count INTEGER NOT NULL,
  pending_count INTEGER NOT NULL,
  unresolved_count INTEGER NOT NULL,
  rejected_count INTEGER NOT NULL,
  no_signal_count INTEGER NOT NULL,
  win_rate REAL,
  coverage_rate REAL,
  rejection_rate REAL,
  average_edge REAL,
  average_confidence REAL,
  theoretical_pnl REAL,
  max_drawdown REAL,
  warnings_json TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload_json TEXT,
  UNIQUE(source_type, symbol, window, strategy_id, checked_at)
);

CREATE INDEX IF NOT EXISTS idx_replay_results_lookup ON replay_results(symbol, window, strategy_id, checked_at);

CREATE TABLE IF NOT EXISTS short_window_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  venue TEXT NOT NULL,
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL,
  event_id TEXT NOT NULL,
  signal_time TEXT NOT NULL,
  side TEXT NOT NULL,
  confidence REAL,
  score REAL,
  start_reference_price REAL,
  current_price REAL,
  result_status TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(source_type, venue, symbol, interval, event_id, signal_time, side)
);

CREATE INDEX IF NOT EXISTS idx_short_window_signals_signal_time ON short_window_signals(signal_time);

CREATE TABLE IF NOT EXISTS short_window_replay_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  venue TEXT NOT NULL,
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL,
  window TEXT NOT NULL,
  total_events INTEGER NOT NULL,
  actionable_count INTEGER NOT NULL,
  win_count INTEGER NOT NULL,
  loss_count INTEGER NOT NULL,
  wait_count INTEGER NOT NULL,
  rejected_count INTEGER NOT NULL,
  win_rate REAL,
  warnings_json TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload_json TEXT,
  UNIQUE(source_type, venue, symbol, interval, window, checked_at)
);

CREATE INDEX IF NOT EXISTS idx_short_window_replay_lookup ON short_window_replay_results(symbol, interval, window, venue, checked_at);

CREATE TABLE IF NOT EXISTS strategy_lab_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  symbol TEXT NOT NULL,
  window TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  parameter_set_json TEXT NOT NULL,
  score REAL,
  win_rate REAL,
  actionable_count INTEGER NOT NULL,
  theoretical_pnl REAL,
  max_drawdown REAL,
  overfit_risk TEXT NOT NULL,
  consistency_score REAL,
  warnings_json TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload_json TEXT,
  UNIQUE(source_type, symbol, window, strategy_id, parameter_set_json, checked_at)
);

CREATE INDEX IF NOT EXISTS idx_strategy_lab_results_lookup ON strategy_lab_results(symbol, window, strategy_id, checked_at);

CREATE TABLE IF NOT EXISTS capture_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  records_inserted INTEGER NOT NULL,
  records_updated INTEGER NOT NULL,
  records_skipped INTEGER NOT NULL,
  error_message TEXT,
  warnings_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_capture_runs_started_at ON capture_runs(started_at);
`;

const sourceTypes = new Set<DataSourceType>(["live", "mock", "fixture"]);
const providers = new Set<ResearchStoreProvider>([
  "polymarket-gamma",
  "polymarket-clob-public",
  "binance-spot-public",
  "mock"
]);

export function assertStoreSource(provider: ResearchStoreProvider | undefined, sourceType: DataSourceType): void {
  if (!sourceTypes.has(sourceType)) {
    throw new Error(`Unsupported research store sourceType: ${String(sourceType)}`);
  }
  if (provider && !providers.has(provider)) {
    throw new Error(`Unsupported research store provider: ${String(provider)}`);
  }
  if (provider === "mock" && sourceType !== "mock") {
    throw new Error("Mock provider records must be written with sourceType=mock.");
  }
}

export function stableRawHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function resolveResearchStorePath(storePath: string): string {
  if (storePath === ":memory:" || path.isAbsolute(storePath)) {
    return storePath;
  }
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), storePath);
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)])
    );
  }
  return value;
}
