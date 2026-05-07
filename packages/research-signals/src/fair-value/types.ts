import type {
  BoundEventMarket,
  Candle,
  FairProbabilitySnapshot,
  FairValueMarketEligibility,
  FairValueSignalMarker,
  FairValueSignalResponse,
  PolymarketLiquidityStatus,
  RealtimePriceSymbol,
  SignalSymbol
} from "@ept/shared-types";

export type FairValueInput = {
  symbol: SignalSymbol;
  underlyingSymbol: RealtimePriceSymbol;
  currentPrice: number | null;
  candles: Candle[];
  market: BoundEventMarket;
  odds: BoundEventMarket["odds"];
  now: string;
  horizonSeconds: number;
  feesBps: number;
  slippageBps: number;
  minEdgeBps: number;
  maxSpread: number;
  minLiquidityStatus: PolymarketLiquidityStatus;
};

export type TerminalProbabilityInput = {
  currentPrice: number;
  thresholdPrice: number;
  candles: Candle[];
  horizonSeconds: number;
  now?: string | undefined;
};

export type TerminalProbabilityResult = {
  probabilityAbove: number | null;
  realizedVolatilityPerSecond: number | null;
  usableReturnCount: number;
  warnings: string[];
  rejectReasons: string[];
  assumptions: string[];
  method: FairProbabilitySnapshot["method"];
};

export type FairValueEvaluation = {
  snapshot: FairProbabilitySnapshot;
  marker: FairValueSignalMarker;
  eligibility: FairValueMarketEligibility;
};

export type BuildFairValueSignalResponseInput = {
  symbol: SignalSymbol | "ALL";
  checkedAt: string;
  sourceType: FairValueSignalResponse["sourceType"];
  providerHealth: FairValueSignalResponse["providerHealth"];
  markets: BoundEventMarket[];
  candlesBySymbol: Partial<Record<SignalSymbol, Candle[]>>;
  currentPriceBySymbol: Partial<Record<SignalSymbol, number | null>>;
  horizonSeconds?: number | undefined;
  feesBps?: number | undefined;
  slippageBps?: number | undefined;
  minEdgeBps?: number | undefined;
  maxSpread?: number | undefined;
  minLiquidityStatus?: PolymarketLiquidityStatus | undefined;
  warnings?: string[] | undefined;
};

export type { FairProbabilitySnapshot, FairValueMarketEligibility, FairValueSignalMarker };
