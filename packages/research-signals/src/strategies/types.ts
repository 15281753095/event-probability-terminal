import type { BaselineSignalResult, OhlcvCandle, StrategyCandidate } from "@ept/shared-types";

export type ResearchStrategyInput = {
  candles: OhlcvCandle[];
  entryTime: string;
  outcomeTime: string;
};

export type ResearchStrategyCandidate = StrategyCandidate<ResearchStrategyInput>;

export type { BaselineSignalResult };
