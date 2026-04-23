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

export interface ScannerMeta {
  source: "polymarket";
  mode: SourceProvenance["sourceMode"];
  pricing: PricingModelVersion | "local-placeholder-fallback";
  message: string;
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
    source: "polymarket";
    mode: SourceProvenance["sourceMode"];
    message: string;
  };
  candidate?: ScannerCandidate;
  book?: OrderBookSnapshot;
}
