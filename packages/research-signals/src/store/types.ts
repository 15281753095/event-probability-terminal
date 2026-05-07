import type {
  DataSourceType,
  FairValueSignalSide,
  OhlcvInterval,
  PolymarketLiquidityStatus,
  ReplayWindowId,
  SignalReplayResponse,
  SignalSymbol,
  StrategyLabReport,
  StrategyLabStrategyId,
  StrategyParameterOverfitRisk
} from "@ept/shared-types";

export type ResearchStoreProvider =
  | "polymarket-gamma"
  | "polymarket-clob-public"
  | "binance-spot-public"
  | "mock";

export type StoredUnderlyingSymbol = "BTCUSDT" | "ETHUSDT";
export type StoredSignalSymbol = SignalSymbol | "ALL";
export type CaptureRunStatus = "success" | "partial" | "failed";
export type CoverageWindowId = Exclude<ReplayWindowId, "custom">;

export type InsertSummary = {
  recordsInserted: number;
  recordsUpdated: number;
  recordsSkipped: number;
};

export type MarketSnapshotRecord = {
  id?: number;
  provider: ResearchStoreProvider;
  sourceType: DataSourceType;
  symbol: StoredSignalSymbol;
  marketId?: string | null;
  question?: string | null;
  tokenIdYes?: string | null;
  tokenIdNo?: string | null;
  yesPrice?: number | null;
  noPrice?: number | null;
  yesMidpoint?: number | null;
  noMidpoint?: number | null;
  spread?: number | null;
  liquidityStatus?: PolymarketLiquidityStatus | null;
  rawHash: string;
  checkedAt: string;
  createdAt?: string;
};

export type UnderlyingCandleRecord = {
  id?: number;
  provider: Extract<ResearchStoreProvider, "binance-spot-public" | "mock">;
  sourceType: DataSourceType;
  symbol: StoredUnderlyingSymbol;
  interval: OhlcvInterval;
  openTime: string;
  closeTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  createdAt?: string;
};

export type FairValueSignalRecord = {
  id?: number;
  sourceType: DataSourceType;
  symbol: StoredSignalSymbol;
  marketId: string;
  signalTime: string;
  side: FairValueSignalSide;
  modelProbabilityYes: number | null;
  marketProbabilityYes: number | null;
  edge: number | null;
  confidence: number | null;
  reason: string;
  rejectReasonsJson: string;
  isResearchOnly: true;
  createdAt?: string;
};

export type ReplayResultRecord = {
  id?: number;
  sourceType: DataSourceType;
  symbol: StoredSignalSymbol;
  window: CoverageWindowId;
  strategyId: StrategyLabStrategyId;
  sampleCount: number;
  actionableCount: number;
  winCount: number;
  lossCount: number;
  pendingCount: number;
  unresolvedCount: number;
  rejectedCount: number;
  noSignalCount: number;
  winRate: number | null;
  coverageRate: number | null;
  rejectionRate: number | null;
  averageEdge: number | null;
  averageConfidence: number | null;
  theoreticalPnl: number | null;
  maxDrawdown: number | null;
  warningsJson: string;
  checkedAt: string;
  createdAt?: string;
  payloadJson?: string | null;
};

export type StrategyLabResultRecord = {
  id?: number;
  sourceType: DataSourceType;
  symbol: StoredSignalSymbol;
  window: CoverageWindowId;
  strategyId: StrategyLabStrategyId;
  parameterSetJson: string;
  score: number | null;
  winRate: number | null;
  actionableCount: number;
  theoreticalPnl: number | null;
  maxDrawdown: number | null;
  overfitRisk: StrategyParameterOverfitRisk;
  consistencyScore: number | null;
  warningsJson: string;
  checkedAt: string;
  createdAt?: string;
  payloadJson?: string | null;
};

export type CaptureRunRecord = {
  id?: number;
  jobName: string;
  status: CaptureRunStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  sourceType: DataSourceType;
  recordsInserted: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errorMessage?: string | null;
  warningsJson: string;
};

export type StoreTableName =
  | "market_snapshots"
  | "underlying_candles"
  | "fair_value_signals"
  | "replay_results"
  | "strategy_lab_results"
  | "capture_runs";

export type StoreTableCounts = Record<StoreTableName, number>;

export type StoreLatestTimestamps = {
  latestMarketSnapshotAt: string | null;
  latestCandleCloseAt: string | null;
  latestFairValueSignalAt: string | null;
  latestReplayMetricsAt: string | null;
  latestStrategyLabResultAt: string | null;
  latestCaptureRunAt: string | null;
};

export type CoverageWindowSummary = {
  window: CoverageWindowId;
  since: string;
  candleCount: number;
  marketSnapshotCount: number;
  fairValueSignalCount: number;
  replayResultCount: number;
  strategyLabResultCount: number;
};

export type StoreStatus = {
  storeKind: "sqlite" | "jsonl";
  dbPath: string;
  checkedAt: string;
  counts: StoreTableCounts;
  latest: StoreLatestTimestamps;
  coverage: CoverageWindowSummary[];
  latestCaptureRun: CaptureRunRecord | null;
};

export type StoredReplayResult = {
  record: ReplayResultRecord;
  response: SignalReplayResponse | null;
};

export type StoredStrategyLabResult = {
  record: StrategyLabResultRecord;
  report: StrategyLabReport | null;
};

export type ResearchDataStore = {
  readonly kind: "sqlite" | "jsonl";
  readonly dbPath: string;
  init(): Promise<void>;
  close(): Promise<void>;
  insertMarketSnapshots(records: MarketSnapshotRecord[]): Promise<InsertSummary>;
  insertUnderlyingCandles(records: UnderlyingCandleRecord[]): Promise<InsertSummary>;
  insertFairValueSignals(records: FairValueSignalRecord[]): Promise<InsertSummary>;
  insertReplayResult(record: ReplayResultRecord): Promise<InsertSummary>;
  insertStrategyLabResult(record: StrategyLabResultRecord): Promise<InsertSummary>;
  recordCaptureRun(record: CaptureRunRecord): Promise<InsertSummary>;
  getStatus(input?: { asOf?: string }): Promise<StoreStatus>;
  getCaptureRuns(limit?: number): Promise<CaptureRunRecord[]>;
  getLatestReplayResult(input: {
    symbol: StoredSignalSymbol;
    window: CoverageWindowId;
    strategyId?: StrategyLabStrategyId | undefined;
  }): Promise<StoredReplayResult | null>;
  getLatestStrategyLabResult(input: {
    symbol: StoredSignalSymbol;
    window: CoverageWindowId;
    strategyId?: StrategyLabStrategyId | undefined;
  }): Promise<StoredStrategyLabResult | null>;
};

