export {
  atrSnapshot,
  bollingerSnapshot,
  buildFeatureSnapshot,
  emaSeries,
  macdSnapshot,
  realizedVolatilitySnapshot,
  rsiSnapshot,
  volumeSnapshot
} from "./indicators.js";
export {
  REQUIRED_CANDLE_COUNT,
  RESEARCH_SIGNAL_MODEL_VERSION,
  buildResearchSignalFromOHLCV,
  buildResearchSignal,
  getResearchSignalFixture,
  rebaseFixtureCandles,
  listLiveResearchSignals,
  listResearchSignals
} from "./engine.js";
export type { ListLiveSignalsInput, ListSignalsInput, OHLCVFetcher } from "./engine.js";
export { evaluateConfluence } from "./confluence.js";
export {
  CONSOLE_CANDLE_LOOKBACK,
  RECENT_CANDLE_LIMIT,
  RECENT_MARKER_LIMIT,
  buildFixtureEventSignalConsole,
  buildLiveEventSignalConsole
} from "./console.js";
export type { BuildEventSignalConsoleInput, BuildLiveEventSignalConsoleInput } from "./console.js";
export { findResearchSignalFixture, researchSignalFixtures } from "./fixtures.js";
export {
  AGGRESSIVE_SIGNAL_PROFILE,
  BALANCED_SIGNAL_PROFILE,
  CONSERVATIVE_SIGNAL_PROFILE,
  SIGNAL_PROFILES,
  getSignalProfile
} from "./profiles.js";
export type { HorizonThresholdConfig, SignalProfile, SignalProfileName } from "./profiles.js";
export {
  RESEARCH_ONLY_STRATEGY_REGISTRY,
  baselineUnderlyingMomentumSignal,
  researchStrategyRegistryCount
} from "./strategies/baselines.js";
export type { ResearchStrategyCandidate, ResearchStrategyInput } from "./strategies/types.js";
export { runResearchBacktest } from "./backtest/runner.js";
export type { BacktestSample, RunBacktestInput } from "./backtest/types.js";
export {
  POLYMARKET_GAMMA_PUBLIC_BASE_URL,
  fetchActivePolymarketMarkets,
  fetchClosedPolymarketMarkets,
  findCryptoEventMarkets,
  searchPolymarketMarkets
} from "./polymarket/gamma.js";
export type { ClosedPolymarketMarket } from "./polymarket/gamma.js";
export {
  POLYMARKET_CLOB_PUBLIC_BASE_URL,
  buildEventMarketOdds,
  fetchPolymarketMidpoint,
  fetchPolymarketOrderBook,
  fetchPolymarketPrice,
  fetchPolymarketSpread
} from "./polymarket/clob-public.js";
export {
  fetchPolymarketPriceHistory,
  priceAtOrBeforeHistory
} from "./polymarket/price-history.js";
export type {
  PolymarketPriceHistoryInterval,
  PolymarketPriceHistoryRequest,
  PolymarketPriceHistoryResult,
  PolymarketPricePoint
} from "./polymarket/price-history.js";
export {
  bindMarketToUnderlying,
  inferSymbols,
  mapGammaMarketToCandidate
} from "./polymarket/market-mapper.js";
export {
  buildFairValueSignalResponse,
  evaluateFairValueMarket
} from "./fair-value/edge.js";
export { evaluateMarketEligibility } from "./fair-value/market-eligibility.js";
export {
  FAIR_VALUE_ASSUMPTIONS,
  FAIR_VALUE_METHOD,
  estimateTerminalAboveProbability
} from "./fair-value/probability.js";
export type {
  BuildFairValueSignalResponseInput,
  FairValueEvaluation,
  FairValueInput,
  TerminalProbabilityInput,
  TerminalProbabilityResult
} from "./fair-value/types.js";
export {
  buildCfRtiAverageRuleTemplate,
  buildShortWindowRuleTemplate,
  evaluateShortWindowRuleOutcome,
  shortWindowIntervalMs
} from "./short-window/rule-templates.js";
export {
  buildCurrentShortWindowEvent,
  resolveShortWindowPhase,
  resolveStartReferencePrice
} from "./short-window/window-engine.js";
export { generateShortWindowSignal } from "./short-window/signal-engine.js";
export {
  combineShortWindowProviderHealth,
  replayCandles,
  resolveShortWindowMetricsWindow,
  runShortWindowReplay
} from "./short-window/replay.js";
export { computeShortWindowMetrics } from "./short-window/metrics.js";
export type {
  BuildCurrentShortWindowEventInput,
  RuleOutcome,
  RuleOutcomeInput,
  RuleTemplateInput,
  RunShortWindowReplayInput,
  ShortWindowContractRule,
  ShortWindowCurrentResponse,
  ShortWindowEvent,
  ShortWindowFixture,
  ShortWindowInterval,
  ShortWindowMarker,
  ShortWindowMarketState,
  ShortWindowMetrics,
  ShortWindowMetricsWindow,
  ShortWindowReplayResponse,
  ShortWindowReplayResult,
  ShortWindowRuleConfidence,
  ShortWindowSignal,
  ShortWindowSignalSide,
  ShortWindowVenue
} from "./short-window/types.js";
export type {
  FindCryptoEventMarketsInput,
  FindCryptoEventMarketsResult,
  PolymarketOrderBook,
  PolymarketPublicOptions,
  PolymarketSymbolFilter
} from "./polymarket/types.js";
export {
  aggregateCandlesToInterval,
  intervalMsForOhlcv
} from "./ohlcv/aggregate.js";
export type {
  AggregateCandlesResult
} from "./ohlcv/aggregate.js";
export {
  BINANCE_SPOT_PUBLIC_PROVIDER,
  BINANCE_SPOT_PUBLIC_SOURCE,
  binanceSpotInterval,
  binanceSpotIntervalSeconds,
  buildBinanceSpotSymbol,
  emptyFailClosedBinanceMarketData,
  emptyFailClosedBinanceOHLCVResult,
  fetchBinanceSpotCandles,
  fetchBinanceSpotMarketData,
  isBinanceNativeInterval
} from "./ohlcv/binance-spot.js";
export type { BinanceSpotOptions } from "./ohlcv/binance-spot.js";
export {
  fetchBinanceHistoricalKlines
} from "./ohlcv/binance-history.js";
export type {
  BinanceHistoricalKlinesOptions,
  BinanceHistoricalKlinesRequest,
  BinanceHistoricalKlinesResult,
  BinanceHistoryLookback
} from "./ohlcv/binance-history.js";
export {
  loadMarketDataKlines,
  resolveRangeForInterval
} from "./ohlcv/market-data-klines.js";
export type {
  MarketDataKlinesRequest
} from "./ohlcv/market-data-klines.js";
export {
  BINANCE_SPOT_PUBLIC_WS_BASE_URL,
  BinanceSpotRealtimeClient,
  buildBinanceSpotRealtimeStreamUrl,
  parseBinanceAggTrade,
  parseBinanceBookTicker,
  parseBinanceKline,
  parseBinanceSpotRealtimeMessage,
  parseBinanceTrade,
  toBinanceRealtimeSymbol
} from "./realtime/binance-spot-ws.js";
export type {
  BinanceRealtimeClientOptions,
  BinanceRealtimeParseResult,
  BinanceRealtimeStreamType,
  RealtimeWebSocketFactory,
  RealtimeWebSocketLike
} from "./realtime/binance-spot-ws.js";
export {
  buildCoinbaseProductId,
  coinbaseGranularity,
  COINBASE_EXCHANGE_PROVIDER,
  COINBASE_EXCHANGE_SOURCE,
  emptyFailClosedOHLCVResult,
  emptyFailClosedLiveMarketData,
  fetchCoinbaseExchangeCandles,
  fetchCoinbaseExchangeMarketData
} from "./ohlcv/coinbase-exchange.js";
export type { CoinbaseExchangeOptions } from "./ohlcv/coinbase-exchange.js";
export type { FetchLike, LiveMarketDataFetcher, LiveMarketDataFetchRequest } from "./ohlcv/types.js";
export { computeReplayMetrics } from "./replay/metrics.js";
export {
  buildReplayTradeLikeResult,
  labelReplayOutcome
} from "./replay/outcome-labeler.js";
export { runSignalReplay } from "./replay/runner.js";
export {
  intervalMsForReplay,
  parseReplayWindowId,
  resolveReplayWindow
} from "./replay/window.js";
export {
  DEFAULT_STRATEGY_LAB_MAX_COMBINATIONS,
  STRATEGY_LAB_MAX_COMBINATIONS_LIMIT,
  buildFairValueV1ParameterGrid,
  normalizeMaxCombinations
} from "./strategy-lab/parameter-grid.js";
export {
  buildScoreBreakdown,
  estimateSweepOverfitRisk,
  rankStrategyParameterResults,
  rejectionReasonsForResult,
  warningsForMetrics
} from "./strategy-lab/ranking.js";
export {
  aggregateReplayMetrics,
  runParameterSweep,
  runReplayForParameter
} from "./strategy-lab/sweep-runner.js";
export { runWalkForwardValidation } from "./strategy-lab/walk-forward.js";
export type {
  BuildReplayResultInput,
  LabelReplayOutcomeInput,
  MockReplayFixture,
  ReplayClosedMarketData,
  ReplayHistoricalCandles,
  ReplayMarketSource,
  ReplayMetrics,
  ReplayOutcome,
  ReplayOutcomeStatus,
  ReplaySignal,
  ReplayStrategyId,
  ReplaySymbolFilter,
  ReplayTradeLikeResult,
  ReplayWindow,
  ReplayWindowId,
  RunSignalReplayInput,
  SignalMarker,
  SignalReplayResponse
} from "./replay/types.js";
export type {
  BuildStrategyLabReportInput,
  ParameterGridBuildResult,
  ParameterGridOptions,
  ParameterSweepRequest,
  ParameterSweepResult,
  RunParameterSweepInput,
  RunParameterSweepOutput,
  RunSignalReplayOutput,
  RunWalkForwardValidationInput,
  RunWalkForwardValidationOutput,
  StrategyLabReport,
  StrategyParameterOverfitRisk,
  StrategyParameterSet,
  WalkForwardResult,
  WalkForwardWindow
} from "./strategy-lab/types.js";
export {
  createResearchDataStore,
  createJsonlResearchStore,
  createSqliteResearchStore,
  fairValueSignalRecordsFromResponse,
  isNodeSqliteAvailable,
  marketSnapshotFromBoundMarket,
  replayResultRecordFromResponse,
  shortWindowReplayResultRecordFromResponse,
  shortWindowSignalRecordsFromResponse,
  stableRawHash,
  strategyLabResultRecordFromReport,
  underlyingCandleFromCandle
} from "./store/index.js";
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
  ShortWindowReplayResultRecord,
  ShortWindowSignalRecord,
  StoreStatus,
  StrategyLabResultRecord,
  StoredReplayResult,
  StoredShortWindowReplayResult,
  StoredSignalSymbol,
  StoredStrategyLabResult,
  UnderlyingCandleRecord
} from "./store/index.js";
export {
  DEFAULT_CAPTURE_SCHEDULE_MS,
  createCaptureScheduler,
  runCaptureJobByName,
  runCaptureOnce,
  runSnapshotCaptureOnce
} from "./capture/scheduler.js";
export type { CaptureRunMode, CaptureScheduleConfig } from "./capture/scheduler.js";
export { runBinanceCandlesCaptureJob } from "./capture/binance-candles-job.js";
export { runPolymarketMarketsCaptureJob } from "./capture/polymarket-markets-job.js";
export { runFairValueSignalsCaptureJob } from "./capture/fair-value-signals-job.js";
export { runReplayMetricsCaptureJob } from "./capture/replay-metrics-job.js";
export { runStrategyLabCaptureJob } from "./capture/strategy-lab-job.js";
export type { CaptureJobContext, CaptureJobName, CaptureJobResult } from "./capture/types.js";
