import type { Asset, EventMarket, TimeWindow } from "@ept/shared-types";

export type PolymarketSourceMode = "fixture" | "live_public";

export interface PolymarketAdapterConfig {
  gammaBaseUrl: string;
  clobBaseUrl: string;
  sourceMode: PolymarketSourceMode;
  fixturePath?: string;
}

export interface GammaEventsKeysetParams {
  limit?: number;
  afterCursor?: string;
  closed?: boolean;
}

export interface GammaEventsKeysetResponse {
  events: GammaEvent[];
  next_cursor?: string | null;
}

export interface GammaEvent {
  id?: unknown;
  slug?: unknown;
  title?: unknown;
  description?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  active?: unknown;
  closed?: unknown;
  archived?: unknown;
  liquidity?: unknown;
  volume?: unknown;
  markets?: unknown;
}

export interface GammaMarket {
  id?: unknown;
  question?: unknown;
  conditionId?: unknown;
  slug?: unknown;
  startDate?: unknown;
  startDateIso?: unknown;
  endDate?: unknown;
  endDateIso?: unknown;
  active?: unknown;
  closed?: unknown;
  enableOrderBook?: unknown;
  questionID?: unknown;
  clobTokenIds?: unknown;
  outcomes?: unknown;
  shortOutcomes?: unknown;
  outcomePrices?: unknown;
  liquidity?: unknown;
  liquidityNum?: unknown;
  liquidityClob?: unknown;
  volume?: unknown;
  volumeNum?: unknown;
  volumeClob?: unknown;
  bestBid?: unknown;
  bestAsk?: unknown;
  lastTradePrice?: unknown;
  spread?: unknown;
}

export interface PolymarketClassification {
  asset: Asset;
  window: TimeWindow;
  source: "fixture_metadata";
  evidence: string[];
}

export interface PolymarketFixtureDocument {
  metadata: {
    fixtureId: string;
    kind: string;
    sourceIds: string[];
    capturedAt: string | null;
    redaction: string;
    uncertainty: string[];
  };
  events: GammaEvent[];
  classifications: Record<string, PolymarketClassification>;
  orderBooks: Record<string, PolymarketOrderBookSnapshot>;
}

export interface PolymarketOrderLevel {
  price: string;
  size: string;
}

export interface PolymarketOrderBookSnapshot {
  market: string;
  asset_id: string;
  timestamp: string;
  hash: string;
  bids: PolymarketOrderLevel[];
  asks: PolymarketOrderLevel[];
  min_order_size: string;
  tick_size: string;
  neg_risk: boolean;
  last_trade_price?: string;
}

export type EventMarketCandidate = EventMarket & {
  raw: {
    event: GammaEvent;
    market: GammaMarket;
  };
};

export interface DiscoverEventMarketsInput {
  assets: Asset[];
  windows: TimeWindow[];
  limit?: number;
  cursor?: string;
}

export interface DiscoverEventMarketsResult {
  markets: EventMarketCandidate[];
  nextCursor?: string;
  rejected: Array<{
    marketId?: string;
    reason: string;
  }>;
  uncertainty: string[];
}

export interface PolymarketPublicReadTransport {
  listEventsKeyset(params: GammaEventsKeysetParams): Promise<GammaEventsKeysetResponse>;
  getOrderBook(tokenId: string): Promise<PolymarketOrderBookSnapshot>;
}
