import type {
  LiveMarketDataResponse,
  MarketDataProvider,
  OhlcvInterval,
  ResearchSignalSourceMode,
  SignalSymbol
} from "@ept/shared-types";

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
}>;

export type LiveMarketDataFetchRequest = {
  symbol: SignalSymbol;
  interval?: OhlcvInterval;
  lookback?: number;
  sourceMode?: ResearchSignalSourceMode;
  provider?: MarketDataProvider;
  requestedAt: string;
};

export type LiveMarketDataFetcher = (
  request: LiveMarketDataFetchRequest
) => Promise<LiveMarketDataResponse>;
