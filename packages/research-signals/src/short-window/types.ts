import type {
  Candle,
  ProviderHealth,
  RealTimePriceTick,
  ShortWindowContractRule,
  ShortWindowCurrentResponse,
  ShortWindowEvent,
  ShortWindowInterval,
  ShortWindowMarker,
  ShortWindowMetrics,
  ShortWindowMetricsWindow,
  ShortWindowReplayResponse,
  ShortWindowReplayResult,
  ShortWindowRuleConfidence,
  ShortWindowSignal,
  ShortWindowSignalSide,
  ShortWindowVenue,
  SignalSymbol
} from "@ept/shared-types";
import type { FetchLike } from "../ohlcv/types.js";

export type {
  ShortWindowContractRule,
  ShortWindowCurrentResponse,
  ShortWindowEvent,
  ShortWindowInterval,
  ShortWindowMarker,
  ShortWindowMetrics,
  ShortWindowMetricsWindow,
  ShortWindowReplayResponse,
  ShortWindowReplayResult,
  ShortWindowRuleConfidence,
  ShortWindowSignal,
  ShortWindowSignalSide,
  ShortWindowVenue
};

export type BuildCurrentShortWindowEventInput = {
  symbol: SignalSymbol;
  interval: ShortWindowInterval;
  venue: ShortWindowVenue;
  now: string;
  priceTicks?: RealTimePriceTick[] | undefined;
  candles?: Candle[] | undefined;
  rule: ShortWindowContractRule;
};

export type ShortWindowMarketState = {
  candles: Candle[];
  priceTick?: RealTimePriceTick | undefined;
  bid?: number | null | undefined;
  ask?: number | null | undefined;
  latencyMs?: number | null | undefined;
  now: string;
  staleAfterMs?: number | undefined;
  minConfidence?: number | undefined;
};

export type RuleTemplateInput = {
  venue: ShortWindowVenue;
  symbol: SignalSymbol;
  interval: ShortWindowInterval;
};

export type RuleOutcomeInput = {
  rule: ShortWindowContractRule;
  event: Pick<ShortWindowEvent, "startTime" | "endTime" | "startReferencePrice">;
  candles: Candle[];
};

export type RuleOutcome = {
  resolvedSide: "UP" | "DOWN" | "TIE" | "UNKNOWN";
  startReferencePrice: number | null;
  endReferencePrice: number | null;
  notes: string[];
};

export type RunShortWindowReplayInput = {
  symbol: SignalSymbol;
  interval: ShortWindowInterval;
  venue: ShortWindowVenue;
  window: ShortWindowMetricsWindow;
  useStored?: boolean | undefined;
  useMock?: boolean | undefined;
  now?: (() => string) | undefined;
  fetcher?: FetchLike | undefined;
  timeoutMs?: number | undefined;
};

export type ShortWindowFixture = {
  sourceType: "mock";
  venue: "mock";
  symbol: SignalSymbol;
  interval: ShortWindowInterval;
  checkedAt: string;
  candles: Array<Pick<Candle, "timestamp" | "open" | "high" | "low" | "close" | "volume"> & Partial<Candle>>;
  scenarios: Array<{
    id: string;
    signalTime: string;
    side: ShortWindowSignalSide;
    outcomeStatus: ShortWindowReplayResult["outcome"]["status"];
    note: string;
  }>;
};

export type CombinedShortWindowProviderHealthInput = {
  checkedAt: string;
  sourceType: "live" | "mock" | "stored";
  providerHealths: ProviderHealth[];
  warnings: string[];
  candleCount: number;
};
