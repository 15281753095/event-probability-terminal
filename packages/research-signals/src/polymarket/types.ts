import type {
  BoundEventMarket,
  EventMarketCandidate,
  EventMarketOdds,
  PolymarketActiveMarketsResponse,
  SignalSymbol
} from "@ept/shared-types";
import type { FetchLike } from "../ohlcv/types.js";

export type PolymarketSymbolFilter = SignalSymbol | "ALL";

export type PolymarketPublicOptions = {
  gammaBaseUrl?: string;
  clobBaseUrl?: string;
  fetcher?: FetchLike;
  timeoutMs?: number;
  now?: () => string;
};

export type GammaMarketRecord = Record<string, unknown>;

export type PolymarketOrderLevel = {
  price: string;
  size: string;
};

export type PolymarketOrderBook = {
  market?: string;
  asset_id?: string;
  timestamp?: string;
  bids?: PolymarketOrderLevel[];
  asks?: PolymarketOrderLevel[];
};

export type FindCryptoEventMarketsInput = PolymarketPublicOptions & {
  symbol?: PolymarketSymbolFilter;
  limit?: number;
  useMock?: boolean;
  realtimeUnderlyingPrice?: Partial<Record<SignalSymbol, number | null>>;
};

export type FindCryptoEventMarketsResult = PolymarketActiveMarketsResponse;

export type { BoundEventMarket, EventMarketCandidate, EventMarketOdds };
