import type { BacktestResult, OhlcvCandle } from "@ept/shared-types";
import type { ResearchStrategyCandidate } from "../strategies/types.js";

export type BacktestSample = {
  entryTime: string;
  outcomeTime: string;
  entryPrice: number;
  outcomePrice: number;
  candles: OhlcvCandle[];
};

export type RunBacktestInput = {
  strategy: ResearchStrategyCandidate;
  samples: BacktestSample[];
  feesAssumption?: string;
  slippageAssumption?: string;
  spreadAssumption?: string;
  minSampleCount?: number;
};

export type { BacktestResult };
