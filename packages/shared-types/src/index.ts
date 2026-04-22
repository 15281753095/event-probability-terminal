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

export interface ScannerCandidate {
  market: EventMarket;
  fairValue: FairValueSnapshot;
  tradeCandidate: TradeCandidate;
  isPlaceholder: true;
}
