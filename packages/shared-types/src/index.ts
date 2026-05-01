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

export type ApiResponseKind = "scanner_top" | "market_detail" | "research_signal" | "event_signal_console";

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

export type OhlcvSource = "fixture" | "coinbase_exchange";

export type OhlcvInterval = "1m" | "5m";

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
  symbol: SignalSymbol;
  interval: OhlcvInterval;
  startTime: string;
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
  fetchedAt: string;
  freshness: OHLCVFreshness;
  warnings: string[];
  failClosedReasons: string[];
  isLive: boolean;
  isFixtureBacked: boolean;
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
  eventWindow: EventWindow;
  observationCandidate: SignalObservationCandidate;
  currentSignal: ResearchSignal;
  confluence: ConfluenceScore;
  riskFilters: RiskFilterSummary;
  recentCandles: OhlcvCandle[];
  recentMarkers: SignalMarker[];
  observationPreview: ObservationPreview;
  backtestPreview: BacktestPreview;
  warnings: string[];
}
