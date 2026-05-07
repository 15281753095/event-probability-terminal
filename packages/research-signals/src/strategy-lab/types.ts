import type {
  OhlcvInterval,
  ParameterSweepRequest,
  ParameterSweepResult,
  ReplayMetrics,
  ReplayWindow,
  ReplayWindowId,
  SignalSymbol,
  StrategyLabReport,
  StrategyLabStrategyId,
  StrategyParameterOverfitRisk,
  StrategyParameterSet,
  WalkForwardResult,
  WalkForwardWindow
} from "@ept/shared-types";
import type { RunSignalReplayInput } from "../replay/types.js";

export type ParameterGridOptions = {
  intervals?: OhlcvInterval[] | undefined;
  minEdgeBps?: number[] | undefined;
  maxSpread?: number[] | undefined;
  volatilityLookbackCandles?: number[] | undefined;
  minConfidence?: number[] | undefined;
  feesBps?: number[] | undefined;
  slippageBps?: number[] | undefined;
  minSampleCount?: number | undefined;
  maxCombinations?: number | undefined;
};

export type ParameterGridBuildResult = {
  parameterGrid: StrategyParameterSet[];
  warnings: string[];
  rejectedValues: string[];
  requestedCombinationCount: number;
  maxCombinations: number;
  isResearchOnly: true;
};

export type RunParameterSweepInput = {
  symbol: SignalSymbol | "ALL";
  window: Exclude<ReplayWindowId, "custom"> | ReplayWindow;
  strategyId: StrategyLabStrategyId;
  parameterGrid: StrategyParameterSet[];
  maxCombinations?: number | undefined;
  useMock?: boolean | undefined;
  now?: () => string;
  replayRunner?: ((input: RunSignalReplayInput) => Promise<RunSignalReplayOutput>) | undefined;
};

export type RunSignalReplayOutput = {
  metrics: ReplayMetrics;
  sourceType: "live" | "mock" | "fixture";
  warnings: string[];
  isResearchOnly: true;
};

export type RunParameterSweepOutput = {
  request: ParameterSweepRequest;
  parameterResults: ParameterSweepResult[];
  topCandidates: ParameterSweepResult[];
  rejectedParameterSets: ParameterSweepResult[];
  warnings: string[];
  isResearchOnly: true;
};

export type RunWalkForwardValidationInput = {
  symbol: SignalSymbol | "ALL";
  totalWindow: Exclude<ReplayWindowId, "custom">;
  strategyId: StrategyLabStrategyId;
  candidateParameterSets: StrategyParameterSet[];
  trainWindowRatio?: number | undefined;
  testWindowRatio?: number | undefined;
  useMock?: boolean | undefined;
  now?: () => string;
  replayRunner?: RunParameterSweepInput["replayRunner"] | undefined;
};

export type RunWalkForwardValidationOutput = {
  walkForwardResults: WalkForwardResult[];
  warnings: string[];
  windows: WalkForwardWindow[];
  isResearchOnly: true;
};

export type BuildStrategyLabReportInput = RunParameterSweepInput & {
  totalWindow: Exclude<ReplayWindowId, "custom">;
};

export type {
  ParameterSweepRequest,
  ParameterSweepResult,
  StrategyLabReport,
  StrategyParameterOverfitRisk,
  StrategyParameterSet,
  WalkForwardResult,
  WalkForwardWindow
};
