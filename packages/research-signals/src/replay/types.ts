import type {
  BoundEventMarket,
  Candle,
  DataSourceType,
  EventMarketCandidate,
  FairValueMarketEligibility,
  OhlcvInterval,
  ProviderHealth,
  ReplayMetrics,
  ReplayOutcome,
  ReplayOutcomeSource,
  ReplayOutcomeStatus,
  ReplaySignal,
  ReplayTradeLikeResult,
  ReplayWindow,
  ReplayWindowId,
  SignalMarker,
  SignalReplayResponse,
  SignalSymbol
} from "@ept/shared-types";
import type { FetchLike } from "../ohlcv/types.js";

export type ReplayStrategyId = "fair-value-v1";

export type ReplaySymbolFilter = SignalSymbol | "ALL";

export type RunSignalReplayInput = {
  symbol: ReplaySymbolFilter;
  window: ReplayWindowId | ReplayWindow;
  interval?: OhlcvInterval | undefined;
  strategyId?: ReplayStrategyId | undefined;
  useMock?: boolean | undefined;
  now?: () => string;
  fetcher?: FetchLike | undefined;
  gammaBaseUrl?: string | undefined;
  clobBaseUrl?: string | undefined;
  timeoutMs?: number | undefined;
};

export type ReplayMarketSource = {
  activeMarkets: BoundEventMarket[];
  closedMarkets: EventMarketCandidate[];
  sourceType: DataSourceType;
  providerHealth: ProviderHealth;
  warnings: string[];
  failClosedReasons: string[];
};

export type ReplayHistoricalCandles = {
  symbol: SignalSymbol;
  candles: Candle[];
  providerHealth: ProviderHealth;
  warnings: string[];
  failClosedReasons: string[];
};

export type ReplayClosedMarketData = {
  market: EventMarketCandidate;
  eligibility?: FairValueMarketEligibility | undefined;
  resolvedOutcome?: "YES" | "NO" | undefined;
  outcomeSource?: ReplayOutcomeSource | undefined;
  resolvedAt?: string | undefined;
  resolutionNotes?: string[] | undefined;
};

export type LabelReplayOutcomeInput = {
  signal: ReplaySignal;
  market?: EventMarketCandidate | undefined;
  eligibility?: FairValueMarketEligibility | undefined;
  historicalCandles: Candle[];
  closedMarketData?: ReplayClosedMarketData | undefined;
  now: string;
};

export type BuildReplayResultInput = {
  signal: ReplaySignal;
  outcome: ReplayOutcome;
  marketNoPrice?: number | null | undefined;
};

export type MockReplayFixture = {
  fixtureId: string;
  sourceType: "mock";
  symbol: SignalSymbol;
  window: ReplayWindow;
  checkedAt: string;
  warnings: string[];
  results: ReplayTradeLikeResult[];
};

export type {
  ReplayMetrics,
  ReplayOutcome,
  ReplayOutcomeStatus,
  ReplaySignal,
  ReplayTradeLikeResult,
  ReplayWindow,
  ReplayWindowId,
  SignalMarker,
  SignalReplayResponse
};
