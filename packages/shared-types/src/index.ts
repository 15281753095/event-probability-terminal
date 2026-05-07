export type Asset = "BTC" | "ETH";

export type TimeWindow = "10m" | "1h";

export type PrimaryVenueId = "polymarket";

export type SecondaryVenueId = "predict";

export type ReferenceVenueId = "binance-wallet-reference";

export type VenueId = PrimaryVenueId | SecondaryVenueId | ReferenceVenueId;

export type ResearchMode =
  | "read_only_market_data"
  | "probability_pricing"
  | "opportunity_scanning"
  | "paper_trading"
  | "replay_stats";

export interface HealthPayload {
  ok: boolean;
  service: string;
}

export const API_CONTRACT_VERSION = "ept-api-v1" as const;

export type ApiContractVersion = typeof API_CONTRACT_VERSION;

export type ApiResponseKind =
  | "scanner_top"
  | "market_detail"
  | "research_signal"
  | "event_signal_console"
  | "live_market_data"
  | "polymarket_active_markets"
  | "fair_value_signal"
  | "signal_replay";

export type ApiResponseStatus = "ok" | "not_found" | "unsupported" | "fail_closed";

export type ApiErrorCode = "market_not_found" | "unsupported_market" | "out_of_scope";

export interface ApiResponseMeta {
  contractVersion: ApiContractVersion;
  responseKind: ApiResponseKind;
  generatedAt: string;
  status: "ok";
  source: "polymarket";
  mode: SourceProvenance["sourceMode"];
  isFixtureBacked: boolean;
  isReadOnly: true;
  isPlaceholderPricing: true;
  message: string;
}

export interface ApiErrorResponse {
  contractVersion: ApiContractVersion;
  status: Exclude<ApiResponseStatus, "ok">;
  error: ApiErrorCode;
  message: string;
  generatedAt: string;
  supportedIds?: string[];
}

export interface SourceProvenance {
  source: "polymarket";
  sourceIds: string[];
  sourceMode: "fixture" | "live_public";
  classificationSource: "fixture_metadata" | "official_taxonomy";
  evidence: string[];
}

export type BinaryOutcomeRole = "primary" | "secondary";

export interface BinaryOutcome {
  role: BinaryOutcomeRole;
  label: string;
  tokenId: string;
}

export interface EventMarket {
  id: string;
  venue: PrimaryVenueId;
  asset: Asset;
  window: TimeWindow;
  question: string;
  event: {
    id: string;
    slug?: string;
    title?: string;
    startAt?: string;
    endAt?: string;
  };
  market: {
    id: string;
    slug?: string;
    conditionId: string;
    questionId?: string;
    startAt?: string;
    endAt?: string;
    active: boolean;
    closed: boolean;
    enableOrderBook: boolean;
  };
  outcomeType: "binary";
  outcomes: {
    primary: BinaryOutcome;
    secondary: BinaryOutcome;
  };
  metrics: {
    liquidity?: number;
    volume?: number;
    bestBid?: number;
    bestAsk?: number;
    lastTradePrice?: number;
    spread?: number;
  };
  provenance: SourceProvenance;
  uncertainty: string[];
}

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface OrderBookSnapshot {
  marketId: string;
  tokenId: string;
  timestamp: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  minOrderSize?: string;
  tickSize?: string;
  lastTradePrice?: string;
  provenance: SourceProvenance;
}

export type PricingModelVersion = "pricing-engine-v0-placeholder";

export interface OutcomeFairProbability {
  outcomeRole: BinaryOutcomeRole;
  outcomeLabel: string;
  probability: number | null;
  isPlaceholder: true;
}

export interface PricingInputFeatures {
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  liquidity?: number;
  volume?: number;
  observedMidpoint?: number;
  outcomeLabels: {
    primary: string;
    secondary: string;
  };
}

export interface PricingQuoteRequest {
  market: EventMarket;
  requestedAt: string;
}

export interface FairValueSnapshot {
  marketId: string;
  outcomeType: "binary";
  fairProbabilityByOutcome: {
    primary: OutcomeFairProbability;
    secondary: OutcomeFairProbability;
  };
  confidence: number | null;
  reasons: string[];
  inputFeatures: PricingInputFeatures;
  modelVersion: PricingModelVersion;
  isPlaceholder: true;
  createdAt: string;
}

export interface TradeCandidate {
  marketId: string;
  outcomeRole: BinaryOutcomeRole;
  outcomeLabel: string;
  edge: number | null;
  isPlaceholder: true;
  reason: string;
  fairValue?: FairValueSnapshot;
}

export interface RejectionSummary {
  reason: string;
  count: number;
  sampleMarketIds: string[];
}

export interface ScannerMeta extends ApiResponseMeta {
  responseKind: "scanner_top";
  pricing: PricingModelVersion | "local-placeholder-fallback";
  rejectedCount: number;
  rejectionSummary: RejectionSummary[];
  uncertainty: string[];
}

export interface ScannerCandidate {
  market: EventMarket;
  fairValue: FairValueSnapshot;
  tradeCandidate: TradeCandidate;
  isPlaceholder: true;
}

export interface ScannerTopResponse {
  candidates: ScannerCandidate[];
  meta: ScannerMeta;
}

export type EvidenceTrailKind =
  | "source_id"
  | "classification"
  | "adapter_note"
  | "uncertainty"
  | "placeholder";

export interface EvidenceTrailItem {
  kind: EvidenceTrailKind;
  label: string;
  value: string;
  source: SourceProvenance["source"];
}

export interface ResearchReadiness {
  outcomeContract: "binary";
  pricingStatus: ScannerMeta["pricing"] | "unknown";
  classificationSource: SourceProvenance["classificationSource"];
  openEvidenceGapCount: number;
  isPlaceholderPricing: true;
  notes: string[];
}

export interface TokenTraceItem {
  label: string;
  value: string;
  outcomeRole?: BinaryOutcomeRole;
  tokenId?: string;
}

export interface RelatedMarketSummary {
  id: string;
  question: string;
  asset: Asset;
  window: TimeWindow;
  sourceMode: SourceProvenance["sourceMode"];
  href: string;
}

export interface MarketDetailResponse {
  market: EventMarket;
  relatedMarkets: RelatedMarketSummary[];
  researchReadiness: ResearchReadiness;
  tokenTrace: TokenTraceItem[];
  sourceTrace: EvidenceTrailItem[];
  evidenceTrail: EvidenceTrailItem[];
  openGaps: EvidenceTrailItem[];
  meta: {
    contractVersion: ApiContractVersion;
    responseKind: "market_detail";
    generatedAt: string;
    status: "ok";
    source: "polymarket";
    mode: SourceProvenance["sourceMode"];
    isFixtureBacked: boolean;
    isReadOnly: true;
    isPlaceholderPricing: true;
    message: string;
  };
  candidate?: ScannerCandidate;
  book?: OrderBookSnapshot;
}

export type SignalSymbol = Asset;

export type SignalHorizon = "5m" | "10m";

export type SignalDirection = "LONG" | "SHORT" | "NO_SIGNAL";

export type SignalProfileName = "balanced" | "conservative" | "aggressive";

export type SignalDataQualityStatus = "ok" | "stale" | "insufficient" | "conflicted";

export type ResearchSignalModelVersion = "research-signal-engine-v0";

export type ResearchSignalSourceMode = "fixture" | "live";

export type OhlcvSource = "fixture" | "coinbase_exchange" | "binance_spot_public";

export type DataSourceType = "live" | "mock" | "fixture";

export type OhlcvInterval = "1m" | "5m" | "15m" | "1h";

export type LiveMarketDataSource = "binance-spot-public" | "coinbase-exchange";

export type MarketDataProvider = LiveMarketDataSource | "mock" | "fixture";

export type ProviderHealthRequestedProvider = "binance" | "coinbase" | "polymarket" | "mock";

export type ProviderHealthResolvedProvider = LiveMarketDataSource | "polymarket-gamma" | "polymarket-clob-public" | "mock";

export type ProviderHealthStatus = "ok" | "degraded" | "failed";

export interface ProviderHealth {
  requestedProvider: ProviderHealthRequestedProvider;
  resolvedProvider: ProviderHealthResolvedProvider;
  sourceType: DataSourceType;
  status: ProviderHealthStatus;
  latencyMs: number | null;
  candleCount: number;
  expectedMinCandles: number;
  lastCandleTime: string | null;
  isFixtureBacked: boolean;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  failClosedReasons: string[];
  checkedAt: string;
}

export type ProviderProduct = "BTCUSDT" | "ETHUSDT" | "BTC-USD" | "ETH-USD";

export type RealtimePriceSymbol = "BTCUSDT" | "ETHUSDT";

export type RealtimePriceEventType = "trade" | "aggTrade" | "bookTicker" | "kline";

export type RealtimeConnectionStatus = "connecting" | "open" | "stale" | "reconnecting" | "closed" | "failed";

export interface RealTimePriceTick {
  symbol: RealtimePriceSymbol;
  displaySymbol: RealtimePriceSymbol;
  provider: "binance-spot-public" | "mock";
  sourceType: DataSourceType;
  eventType: RealtimePriceEventType;
  price: number;
  bidPrice?: number | undefined;
  askPrice?: number | undefined;
  eventTime: string;
  receivedAt: string;
  latencyMs: number | null;
  sequenceId?: string | number | undefined;
  isClosedKline?: boolean | undefined;
  rawProviderEventType?: string | undefined;
  candle?: OhlcvCandle | undefined;
}

export interface RealtimePriceEvent {
  type: "price" | "health" | "stale" | "error";
  tick?: RealTimePriceTick;
  providerHealth?: ProviderHealth;
  connectionStatus: RealtimeConnectionStatus;
  message?: string;
  checkedAt: string;
}

export interface RealtimePriceSsePayload {
  symbol: SignalSymbol;
  displaySymbol: RealtimePriceSymbol;
  provider: "binance-spot-public" | "mock";
  sourceType: DataSourceType;
  price: number | null;
  bidPrice: number | null;
  askPrice: number | null;
  eventTime: string | null;
  receivedAt: string;
  latencyMs: number | null;
  connectionStatus: RealtimeConnectionStatus;
  stale: boolean;
  providerHealth: ProviderHealth;
  tick?: RealTimePriceTick;
}

export interface ResearchStrategyStatus {
  registryCount: number;
  backtestScaffoldStatus: "research_only";
  productionEnabled: false;
  message: string;
}

export type PolymarketPublicProvider = "polymarket-gamma" | "polymarket-clob-public" | "mock";

export type PolymarketLiquidityStatus = "ok" | "thin" | "unknown";

export type BoundEventMarketStatus = "bound" | "ambiguous" | "unsupported" | "failed";

export interface EventMarketCandidate {
  id: string;
  eventId: string;
  marketId: string;
  question: string;
  slug: string;
  description?: string | undefined;
  active: boolean;
  closed: boolean;
  archived?: boolean | undefined;
  endDate?: string | undefined;
  startDate?: string | undefined;
  volume?: number | undefined;
  liquidity?: number | undefined;
  outcomes: string[];
  outcomePrices: number[];
  clobTokenIds: string[];
  conditionId?: string | undefined;
  questionId?: string | undefined;
  resolutionSource?: string | undefined;
  rawSource: "gamma" | "mock" | "fixture";
}

export interface EventMarketOdds {
  marketId: string;
  question: string;
  tokenIdYes: string | null;
  tokenIdNo: string | null;
  yesPrice: number | null;
  noPrice: number | null;
  yesMidpoint: number | null;
  noMidpoint: number | null;
  spread: number | null;
  bestBidYes?: number | undefined;
  bestAskYes?: number | undefined;
  bestBidNo?: number | undefined;
  bestAskNo?: number | undefined;
  impliedProbabilityYes: number | null;
  impliedProbabilityNo: number | null;
  liquidityStatus: PolymarketLiquidityStatus;
  sourceType: DataSourceType;
  provider: PolymarketPublicProvider;
  checkedAt: string;
  failClosedReasons: string[];
}

export interface BoundEventMarket {
  symbol: SignalSymbol;
  underlyingSymbol: RealtimePriceSymbol;
  market: EventMarketCandidate;
  odds: EventMarketOdds;
  realtimeUnderlyingPrice: number | null;
  bindingStatus: BoundEventMarketStatus;
  bindingReasons: string[];
  researchEligible: boolean;
  researchRejectReasons: string[];
}

export interface PolymarketActiveMarketsResponse {
  symbol: SignalSymbol | "ALL";
  checkedAt: string;
  sourceType: DataSourceType;
  providerHealth: ProviderHealth;
  realtimeUnderlyingPrice: Record<SignalSymbol, number | null>;
  markets: BoundEventMarket[];
  warnings: string[];
  failClosedReasons: string[];
}

export type FairValueComparator = "ABOVE" | "BELOW" | "HIT";

export type FairValueResolutionRuleConfidence = "high" | "medium" | "low" | "unknown";

export type FairValueSignalSide = "LONG_YES" | "LONG_NO" | "NO_SIGNAL" | "REJECTED";

export interface FairValueMarketEligibility {
  eligible: boolean;
  rejectReasons: string[];
  extracted: {
    thresholdPrice?: number | undefined;
    comparator?: FairValueComparator | undefined;
    expiryTime?: string | undefined;
    underlyingSymbol?: RealtimePriceSymbol | undefined;
    resolutionRuleConfidence: FairValueResolutionRuleConfidence;
  };
}

export interface FairProbabilitySnapshot {
  symbol: SignalSymbol;
  marketId: string;
  question: string;
  modelProbabilityYes: number | null;
  marketProbabilityYes: number | null;
  edgeYes: number | null;
  edgeNo: number | null;
  fairYesPrice: number | null;
  fairNoPrice: number | null;
  marketYesPrice: number | null;
  marketNoPrice: number | null;
  spread: number | null;
  confidence: number;
  method: "realized-vol-terminal-probability-v1";
  assumptions: string[];
  warnings: string[];
  rejectReasons: string[];
  isResearchOnly: true;
  checkedAt: string;
}

export interface FairValueSignalMarker {
  id: string;
  symbol: SignalSymbol;
  marketId: string;
  time: string;
  price: number;
  side: FairValueSignalSide;
  label: string;
  reason: string;
  confidence: number;
  modelProbabilityYes: number | null;
  marketProbabilityYes: number | null;
  edge: number | null;
  isResearchOnly: true;
}

export interface FairValueRejectedMarket {
  symbol: SignalSymbol;
  marketId: string;
  question: string;
  rejectReasons: string[];
  eligibility: FairValueMarketEligibility;
}

export interface FairValueSignalResponse {
  symbol: SignalSymbol | "ALL";
  checkedAt: string;
  sourceType: DataSourceType;
  providerHealth: ProviderHealth;
  snapshots: FairProbabilitySnapshot[];
  markers: FairValueSignalMarker[];
  rejectedMarkets: FairValueRejectedMarket[];
  warnings: string[];
  isResearchOnly: true;
}

export type ReplayWindowId = "1d" | "3d" | "1w" | "1m" | "custom";

export interface ReplayWindow {
  id: ReplayWindowId;
  startTime: string;
  endTime: string;
  label: string;
}

export type ReplayOutcomeStatus =
  | "WIN"
  | "LOSS"
  | "PENDING"
  | "UNRESOLVED"
  | "REJECTED"
  | "NO_SIGNAL";

export type ReplayResolvedOutcome = "YES" | "NO";

export type ReplayOutcomeSource =
  | "polymarket-closed-market"
  | "binance-threshold-reconstruction"
  | "mock-fixture"
  | "unknown";

export interface ReplaySignal {
  id: string;
  symbol: SignalSymbol;
  underlyingSymbol: RealtimePriceSymbol;
  marketId: string;
  question: string;
  signalTime: string;
  expiryTime: string;
  priceAtSignal: number;
  side: FairValueSignalSide;
  modelProbabilityYes: number | null;
  marketProbabilityYes: number | null;
  edge: number | null;
  confidence: number;
  reason: string;
  rejectReasons: string[];
  assumptions: string[];
  isResearchOnly: true;
}

export interface ReplayOutcome {
  signalId: string;
  marketId: string;
  status: ReplayOutcomeStatus;
  resolvedOutcome?: ReplayResolvedOutcome | undefined;
  outcomeSource: ReplayOutcomeSource;
  resolvedAt?: string | undefined;
  priceAtExpiry?: number | undefined;
  notes: string[];
}

export interface ReplayTradeLikeResult {
  signal: ReplaySignal;
  outcome: ReplayOutcome;
  theoreticalEntryPrice: number | null;
  theoreticalExitValue: number | null;
  theoreticalPnl: number | null;
  feesAssumption: string;
  slippageAssumption: string;
  spreadAssumption: string;
  countedInWinRate: boolean;
}

export interface ReplayCalibrationBucket {
  bucketStart: number;
  bucketEnd: number;
  sampleCount: number;
  observedYesRate: number | null;
  averageModelProbabilityYes: number | null;
}

export interface ReplayMetrics {
  symbol: SignalSymbol | "ALL";
  window: ReplayWindow;
  sampleCount: number;
  actionableCount: number;
  winCount: number;
  lossCount: number;
  pendingCount: number;
  unresolvedCount: number;
  rejectedCount: number;
  noSignalCount: number;
  winRate: number | null;
  longYesCount: number;
  longYesWinRate: number | null;
  longNoCount: number;
  longNoWinRate: number | null;
  coverageRate: number | null;
  rejectionRate: number | null;
  pendingRate: number | null;
  averageEdge: number | null;
  averageConfidence: number | null;
  averageTheoreticalPnl: number | null;
  cumulativeTheoreticalPnl: number | null;
  maxDrawdown: number | null;
  brierScore?: number | undefined;
  calibrationBuckets?: ReplayCalibrationBucket[] | undefined;
  warnings: string[];
  isResearchOnly: true;
  checkedAt: string;
}

export interface SignalReplayResponse {
  symbol: SignalSymbol | "ALL";
  window: ReplayWindow;
  checkedAt: string;
  sourceType: DataSourceType;
  providerHealth: ProviderHealth;
  metrics: ReplayMetrics;
  signals: ReplaySignal[];
  results: ReplayTradeLikeResult[];
  markers: SignalMarker[];
  warnings: string[];
  isResearchOnly: true;
}

export type BaselineResearchDirection = "UP" | "DOWN" | "NO_SIGNAL";

export interface BaselineSignalResult {
  direction: BaselineResearchDirection;
  confidence: number;
  reasons: string[];
  vetoReasons: string[];
  isResearchOnly: true;
}

export interface StrategyCandidate<Input = unknown> {
  id: string;
  name: string;
  hypothesis: string;
  requiredInputs: string[];
  forbiddenInputs: string[];
  signalFn: (input: Input) => BaselineSignalResult;
  riskNotes: string[];
  status: "research_only";
}

export interface BacktestResult {
  strategyId: string;
  sampleCount: number;
  winRate: number | null;
  avgReturn: number | null;
  maxDrawdown: number | null;
  feesAssumption: string;
  slippageAssumption: string;
  spreadAssumption: string;
  dataRange: {
    start: string | null;
    end: string | null;
  };
  warnings: string[];
  rejectedReasons: string[];
  isResearchOnly: true;
}

export interface OhlcvCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Candle extends OhlcvCandle {
  source: OhlcvSource;
  sourceType: DataSourceType;
  provider: LiveMarketDataSource | "fixture";
  symbol: SignalSymbol;
  interval: OhlcvInterval;
  granularity: number;
  productId: string;
  displaySymbol: string;
  openTime: string;
  startTime: string;
  isLive: boolean;
  isMock: boolean;
  isFixtureBacked: boolean;
  isClosed: boolean;
}

export interface OHLCVFetchRequest {
  symbol: SignalSymbol;
  interval: OhlcvInterval;
  lookback: number;
  sourceMode: ResearchSignalSourceMode;
  requestedAt: string;
}

export interface OHLCVFreshness {
  status: "fresh" | "stale" | "unknown";
  latestStartTime: string | null;
  latestClosedAt: string | null;
  ageMs: number | null;
  maxAgeMs: number;
}

export interface OHLCVFetchResult {
  candles: Candle[];
  source: OhlcvSource;
  sourceType: DataSourceType;
  provider: LiveMarketDataSource;
  productId: string;
  displaySymbol: string;
  candleGranularity: number;
  candleCount: number;
  lastCandleTime: string | null;
  fetchedAt: string;
  freshness: OHLCVFreshness;
  warnings: string[];
  failClosedReasons: string[];
  isLive: boolean;
  isMock: boolean;
  isFixtureBacked: boolean;
}

export interface MarketDataProvenance {
  source: string;
  sourceType: DataSourceType;
  provider: LiveMarketDataSource | "fixture";
  productId: string | null;
  displaySymbol: string | null;
  sourceMode: ResearchSignalSourceMode;
  isLive: boolean;
  isMock: boolean;
  isFixtureBacked: boolean;
  fetchedAt: string;
  candleInterval: OhlcvInterval;
  candleGranularity: number;
  candleCount: number;
  lastCandleTime: string | null;
}

export interface LiveMarketDataResponse {
  symbol: SignalSymbol;
  source: LiveMarketDataSource;
  sourceType: DataSourceType;
  provider: LiveMarketDataSource;
  productId: string;
  displaySymbol: string;
  fetchedAt: string;
  latestPrice: number | null;
  bid: number | null;
  ask: number | null;
  tickerTime: string | null;
  tickerFreshnessSeconds: number | null;
  tickerVolume: number | null;
  candles: Candle[];
  candleInterval: OhlcvInterval;
  candleGranularity: number;
  candleCount: number;
  latestCandleTime: string | null;
  lastCandleTime: string | null;
  candleFreshnessSeconds: number | null;
  isLive: boolean;
  isMock: boolean;
  isFixtureBacked: boolean;
  warnings: string[];
  failClosedReasons: string[];
  provenance: MarketDataProvenance;
  providerHealth: ProviderHealth;
}

export interface SignalFeatureSnapshot {
  lastClose: number;
  returns: {
    oneMinute: number | null;
    threeMinute: number | null;
    fiveMinute: number | null;
  };
  ema: {
    fast: number;
    slow: number;
    slope: number;
  };
  rsi: {
    value: number;
    period: number;
  };
  macd: {
    line: number;
    signal: number;
    histogram: number;
    histogramSlope: number;
  };
  bollinger: {
    middle: number;
    upper: number;
    lower: number;
    bandwidth: number;
    bandPosition: number;
    squeeze: boolean;
    expansion: boolean;
  };
  volatility: {
    atr: number;
    realizedVolatility: number;
    regime: "low" | "normal" | "high";
  };
  volume: {
    latest: number;
    mean: number;
    zScore: number;
    abnormal: boolean;
  };
}

export interface SignalContextSnapshot {
  sourceMode: "manual_fixture" | "not_configured" | "adapter_contract";
  newsScore: number | null;
  xSignalScore: number | null;
  macroRiskState: "risk_on" | "neutral" | "risk_off" | "unknown";
  marketEventRiskFlag: boolean;
  notes: string[];
}

export interface SignalDataQuality {
  status: SignalDataQualityStatus;
  source: OhlcvSource;
  sourceType: DataSourceType;
  candleCount: number;
  requiredCandleCount: number;
  freshnessAgeMs: number;
  maxFreshnessMs: number;
  freshness: OHLCVFreshness;
  missingFields: string[];
  warnings: string[];
  isLive: boolean;
  isFixtureBacked: boolean;
}

export type RiskFilterState = "pass" | "watch" | "veto";

export type VolumeConfirmationState = "confirmed" | "weak" | "missing";

export interface RiskFilterSummary {
  dataFreshness: RiskFilterState;
  volatility: RiskFilterState;
  volumeConfirmation: VolumeConfirmationState;
  chop: RiskFilterState;
  conflict: RiskFilterState;
  meanReversion: RiskFilterState;
  reasons: string[];
  vetoReasons: string[];
}

export interface ConfluenceScore {
  profileName: SignalProfileName;
  trendScore: number;
  momentumScore: number;
  volatilityScore: number;
  volumeScore: number;
  reversalRisk: number;
  chopRisk: number;
  totalScore: number;
  direction: SignalDirection;
  confidence: number;
  reasons: string[];
  vetoReasons: string[];
}

export interface ResearchSignal {
  symbol: SignalSymbol;
  horizon: SignalHorizon;
  generatedAt: string;
  direction: SignalDirection;
  confidence: number;
  score: number;
  reasons: string[];
  features: SignalFeatureSnapshot;
  context: SignalContextSnapshot;
  dataQuality: SignalDataQuality;
  source: OhlcvSource;
  sourceType: DataSourceType;
  sourceMode: ResearchSignalSourceMode;
  isResearchOnly: true;
  isTradeAdvice: false;
  modelVersion: ResearchSignalModelVersion;
  profileName: SignalProfileName;
  invalidation: string[];
  failClosedReasons: string[];
  confluence: ConfluenceScore;
  riskFilters: RiskFilterSummary;
}

export interface ResearchSignalsMeta {
  contractVersion: ApiContractVersion;
  responseKind: "research_signal";
  generatedAt: string;
  status: "ok";
  source: "research_signal_engine";
  mode: ResearchSignalSourceMode;
  sourceName: OhlcvSource;
  sourceType: DataSourceType;
  isFixtureBacked: boolean;
  isReadOnly: true;
  isResearchOnly: true;
  isTradeAdvice: false;
  modelVersion: ResearchSignalModelVersion;
  message: string;
}

export interface ResearchSignalsResponse {
  signals: ResearchSignal[];
  meta: ResearchSignalsMeta;
}

export interface SignalMarker {
  time: string;
  price: number;
  direction: SignalDirection;
  score: number;
  confidence: number;
  reasonSummary: string;
  isRecentOnly: true;
  markerType?: "signal" | "observation_pending" | "observation_hit" | "observation_miss";
}

export interface BacktestPreview {
  enabled: boolean;
  status: "not_loaded" | "ready" | "insufficient";
  sampleSize: number;
  winRate: number | null;
  averageReturn: number | null;
  maxDrawdownProxy: number | null;
  caveats: string[];
}

export interface ObservationPreview {
  enabled: boolean;
  status: "not_loaded" | "ready" | "insufficient";
  sampleSize: number;
  directionalMatchRate: number | null;
  pendingCount: number;
  invalidatedCount: number;
  caveats: string[];
}

export interface EventWindow {
  horizon: SignalHorizon;
  provider: LiveMarketDataSource | "fixture";
  displaySymbol: string | null;
  expectedResolveAt: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  referencePrice: number | null;
  currentPrice: number | null;
  distanceFromReferencePct: number | null;
  canObserve: boolean;
  referencePriceSource: "latest_closed_candle" | "unavailable";
  isReferenceApproximation: boolean;
  warnings: string[];
}

export interface SignalObservationCandidate {
  createdAt: string;
  symbol: SignalSymbol;
  horizon: SignalHorizon;
  sourceMode: ResearchSignalSourceMode;
  direction: SignalDirection;
  score: number;
  confidence: number;
  profileName: SignalProfileName;
  entryPrice: number | null;
  entryCandleTime: string | null;
  expectedResolveAt: string | null;
  reasonSummary: string;
  caveats: string[];
  canObserve: boolean;
}

export interface EventSignalConsoleMeta {
  contractVersion: ApiContractVersion;
  responseKind: "event_signal_console";
  generatedAt: string;
  status: "ok";
  source: "research_signal_engine";
  mode: ResearchSignalSourceMode;
  sourceName: OhlcvSource;
  sourceType: DataSourceType;
  isFixtureBacked: boolean;
  isReadOnly: true;
  isResearchOnly: true;
  isTradeAdvice: false;
  modelVersion: ResearchSignalModelVersion;
  message: string;
}

export interface EventSignalConsoleResponse {
  meta: EventSignalConsoleMeta;
  profileName: SignalProfileName;
  symbol: SignalSymbol;
  horizon: SignalHorizon;
  sourceMode: ResearchSignalSourceMode;
  dataProvenance: MarketDataProvenance;
  providerHealth: ProviderHealth;
  eventWindow: EventWindow;
  observationCandidate: SignalObservationCandidate;
  currentSignal: ResearchSignal;
  confluence: ConfluenceScore;
  riskFilters: RiskFilterSummary;
  recentCandles: OhlcvCandle[];
  recentMarkers: SignalMarker[];
  observationPreview: ObservationPreview;
  backtestPreview: BacktestPreview;
  researchStrategies: ResearchStrategyStatus;
  warnings: string[];
}
