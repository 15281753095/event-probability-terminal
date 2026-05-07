import type {
  BoundEventMarket,
  Candle,
  FairValueSignalResponse,
  SignalReplayResponse,
  StrategyLabReport
} from "@ept/shared-types";
import { stableJson, stableRawHash } from "./schema.js";
import { createJsonlResearchStore } from "./jsonl-store.js";
import { createSqliteResearchStore, isNodeSqliteAvailable } from "./sqlite-store.js";
import type {
  FairValueSignalRecord,
  MarketSnapshotRecord,
  ReplayResultRecord,
  ResearchDataStore,
  ResearchStoreProvider,
  StrategyLabResultRecord,
  StoredUnderlyingSymbol,
  UnderlyingCandleRecord
} from "./types.js";

export type {
  CaptureRunRecord,
  CaptureRunStatus,
  CoverageWindowId,
  FairValueSignalRecord,
  InsertSummary,
  MarketSnapshotRecord,
  ReplayResultRecord,
  ResearchDataStore,
  ResearchStoreProvider,
  StoreStatus,
  StrategyLabResultRecord,
  StoredReplayResult,
  StoredSignalSymbol,
  StoredStrategyLabResult,
  UnderlyingCandleRecord
} from "./types.js";
export {
  COVERAGE_WINDOWS,
  DEFAULT_RESEARCH_STORE_PATH,
  MARKET_SNAPSHOT_DEDUP_WINDOW_MS,
  stableRawHash
} from "./schema.js";
export { createJsonlResearchStore } from "./jsonl-store.js";
export { createSqliteResearchStore, isNodeSqliteAvailable } from "./sqlite-store.js";

export function createResearchDataStore(options: {
  dbPath?: string | undefined;
  jsonlDirPath?: string | undefined;
  forceJsonl?: boolean | undefined;
} = {}): ResearchDataStore {
  if (!options.forceJsonl && isNodeSqliteAvailable()) {
    return createSqliteResearchStore({ dbPath: options.dbPath });
  }
  return createJsonlResearchStore({ dirPath: options.jsonlDirPath });
}

export function marketSnapshotFromBoundMarket(market: BoundEventMarket, checkedAt: string): MarketSnapshotRecord {
  const provider = providerForMarket(market);
  return {
    provider,
    sourceType: market.odds.sourceType,
    symbol: market.symbol,
    marketId: market.market.marketId,
    question: market.market.question,
    tokenIdYes: market.odds.tokenIdYes,
    tokenIdNo: market.odds.tokenIdNo,
    yesPrice: market.odds.yesPrice,
    noPrice: market.odds.noPrice,
    yesMidpoint: market.odds.yesMidpoint,
    noMidpoint: market.odds.noMidpoint,
    spread: market.odds.spread,
    liquidityStatus: market.odds.liquidityStatus,
    rawHash: stableRawHash({
      provider,
      sourceType: market.odds.sourceType,
      symbol: market.symbol,
      marketId: market.market.marketId,
      question: market.market.question,
      tokenIdYes: market.odds.tokenIdYes,
      tokenIdNo: market.odds.tokenIdNo,
      yesPrice: market.odds.yesPrice,
      noPrice: market.odds.noPrice,
      yesMidpoint: market.odds.yesMidpoint,
      noMidpoint: market.odds.noMidpoint,
      spread: market.odds.spread,
      liquidityStatus: market.odds.liquidityStatus
    }),
    checkedAt
  };
}

export function underlyingCandleFromCandle(candle: Candle): UnderlyingCandleRecord {
  return {
    provider: candle.sourceType === "mock" ? "mock" : "binance-spot-public",
    sourceType: candle.sourceType,
    symbol: productSymbol(candle),
    interval: candle.interval,
    openTime: candle.openTime,
    closeTime: new Date(Date.parse(candle.openTime) + candle.granularity * 1000).toISOString(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume
  };
}

export function fairValueSignalRecordsFromResponse(response: FairValueSignalResponse): FairValueSignalRecord[] {
  const rejectedByMarket = new Map(response.rejectedMarkets.map((market) => [market.marketId, market.rejectReasons]));
  return response.markers.map((marker) => ({
    sourceType: response.sourceType,
    symbol: marker.symbol,
    marketId: marker.marketId,
    signalTime: marker.time,
    side: marker.side,
    modelProbabilityYes: marker.modelProbabilityYes,
    marketProbabilityYes: marker.marketProbabilityYes,
    edge: marker.edge,
    confidence: marker.confidence,
    reason: marker.reason,
    rejectReasonsJson: JSON.stringify(rejectedByMarket.get(marker.marketId) ?? (marker.side === "REJECTED" ? [marker.reason] : [])),
    isResearchOnly: true
  }));
}

export function replayResultRecordFromResponse(response: SignalReplayResponse): ReplayResultRecord {
  const windowId = response.window.id === "custom" ? "1w" : response.window.id;
  return {
    sourceType: response.sourceType,
    symbol: response.symbol,
    window: windowId,
    strategyId: "fair-value-v1",
    sampleCount: response.metrics.sampleCount,
    actionableCount: response.metrics.actionableCount,
    winCount: response.metrics.winCount,
    lossCount: response.metrics.lossCount,
    pendingCount: response.metrics.pendingCount,
    unresolvedCount: response.metrics.unresolvedCount,
    rejectedCount: response.metrics.rejectedCount,
    noSignalCount: response.metrics.noSignalCount,
    winRate: response.metrics.winRate,
    coverageRate: response.metrics.coverageRate,
    rejectionRate: response.metrics.rejectionRate,
    averageEdge: response.metrics.averageEdge,
    averageConfidence: response.metrics.averageConfidence,
    theoreticalPnl: response.metrics.cumulativeTheoreticalPnl,
    maxDrawdown: response.metrics.maxDrawdown,
    warningsJson: JSON.stringify(response.warnings),
    checkedAt: response.checkedAt,
    payloadJson: stableJson(response)
  };
}

export function strategyLabResultRecordFromReport(report: StrategyLabReport): StrategyLabResultRecord {
  const top = report.topCandidates[0] ?? report.parameterResults[0];
  const firstWalkForward = report.walkForwardResults[0];
  return {
    sourceType: report.sourceType,
    symbol: report.symbol,
    window: report.window,
    strategyId: report.strategyId,
    parameterSetJson: top ? stableJson(top.parameterSet) : stableJson({ summary: "NO_TOP_CANDIDATE" }),
    score: top?.score ?? null,
    winRate: top?.metrics.winRate ?? null,
    actionableCount: top?.metrics.actionableCount ?? 0,
    theoreticalPnl: top?.metrics.cumulativeTheoreticalPnl ?? null,
    maxDrawdown: top?.metrics.maxDrawdown ?? null,
    overfitRisk: top?.overfitRisk ?? firstWalkForward?.overfitRisk ?? "unknown",
    consistencyScore: firstWalkForward?.stability.consistencyScore ?? null,
    warningsJson: JSON.stringify(report.warnings),
    checkedAt: report.checkedAt,
    payloadJson: stableJson(report)
  };
}

function providerForMarket(market: BoundEventMarket): ResearchStoreProvider {
  return market.odds.provider === "mock" || market.odds.sourceType === "mock"
    ? "mock"
    : "polymarket-clob-public";
}

function productSymbol(candle: Candle): StoredUnderlyingSymbol {
  if (candle.productId === "ETHUSDT" || candle.displaySymbol === "ETHUSDT" || candle.symbol === "ETH") {
    return "ETHUSDT";
  }
  return "BTCUSDT";
}
