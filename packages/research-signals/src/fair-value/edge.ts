import type {
  FairProbabilitySnapshot,
  FairValueRejectedMarket,
  FairValueSignalMarker,
  FairValueSignalResponse,
  FairValueSignalSide,
  SignalSymbol
} from "@ept/shared-types";
import { evaluateMarketEligibility } from "./market-eligibility.js";
import { estimateTerminalAboveProbability } from "./probability.js";
import type { BuildFairValueSignalResponseInput, FairValueEvaluation, FairValueInput } from "./types.js";

export function buildFairValueSignalResponse(
  input: BuildFairValueSignalResponseInput
): FairValueSignalResponse {
  const horizonSeconds = input.horizonSeconds ?? 5 * 60;
  const feesBps = input.feesBps ?? 0;
  const slippageBps = input.slippageBps ?? 0;
  const minEdgeBps = input.minEdgeBps ?? 250;
  const maxSpread = input.maxSpread ?? 0.08;
  const minLiquidityStatus = input.minLiquidityStatus ?? "ok";
  const evaluations: FairValueEvaluation[] = [];
  const rejectedMarkets: FairValueRejectedMarket[] = [];

  for (const market of input.markets) {
    const symbol = market.symbol;
    const evaluation = evaluateFairValueMarket({
      symbol,
      underlyingSymbol: market.underlyingSymbol,
      currentPrice: input.currentPriceBySymbol[symbol] ?? market.realtimeUnderlyingPrice,
      candles: input.candlesBySymbol[symbol] ?? [],
      market,
      odds: market.odds,
      now: input.checkedAt,
      horizonSeconds,
      feesBps,
      slippageBps,
      minEdgeBps,
      maxSpread,
      minLiquidityStatus
    });
    if (evaluation.eligibility.eligible && evaluation.snapshot.rejectReasons.length === 0) {
      evaluations.push(evaluation);
    } else {
      rejectedMarkets.push({
        symbol,
        marketId: market.market.marketId,
        question: market.market.question,
        rejectReasons: unique([...evaluation.eligibility.rejectReasons, ...evaluation.snapshot.rejectReasons]),
        eligibility: evaluation.eligibility
      });
      evaluations.push(evaluation);
    }
  }

  return {
    symbol: input.symbol,
    checkedAt: input.checkedAt,
    sourceType: input.sourceType,
    providerHealth: input.providerHealth,
    snapshots: evaluations
      .filter((item) => item.eligibility.eligible && item.snapshot.rejectReasons.length === 0)
      .map((item) => item.snapshot),
    markers: evaluations.map((item) => item.marker),
    rejectedMarkets,
    warnings: unique([
      ...(input.warnings ?? []),
      "Research only. Not trading advice. No auto execution.",
      ...(rejectedMarkets.length ? ["Rejected markets failed closed before fair value calculation."] : [])
    ]),
    isResearchOnly: true
  };
}

export function evaluateFairValueMarket(input: FairValueInput): FairValueEvaluation {
  const eligibility = evaluateMarketEligibility(input.market, {
    maxSpread: input.maxSpread,
    minLiquidityStatus: input.minLiquidityStatus,
    now: input.now
  });
  const marketYesPrice = firstNumber(input.odds.yesMidpoint, input.odds.yesPrice);
  const marketNoPrice = firstNumber(input.odds.noMidpoint, input.odds.noPrice);
  const baseSnapshot = {
    symbol: input.symbol,
    marketId: input.market.market.marketId,
    question: input.market.market.question,
    marketProbabilityYes: marketYesPrice,
    fairYesPrice: null,
    fairNoPrice: null,
    marketYesPrice,
    marketNoPrice,
    spread: input.odds.spread,
    method: "realized-vol-terminal-probability-v1" as const,
    assumptions: [
      "Uses recent closed-candle realized volatility as the only distribution input.",
      "Estimates terminal price probability at the stated horizon; it is not risk-neutral pricing.",
      "Ignores jump risk, funding, venue outages, and resolution disputes.",
      "Ignores market-book impact beyond the explicit fee/slippage/spread buffers.",
      "Research only; not trade advice and not a guarantee of profit."
    ],
    checkedAt: input.now,
    isResearchOnly: true as const
  };

  if (!eligibility.eligible) {
    const snapshot: FairProbabilitySnapshot = {
      ...baseSnapshot,
      modelProbabilityYes: null,
      edgeYes: null,
      edgeNo: null,
      confidence: 0,
      warnings: [],
      rejectReasons: eligibility.rejectReasons
    };
    return {
      snapshot,
      marker: markerFromSnapshot(snapshot, input, "REJECTED", eligibility.rejectReasons[0] ?? "Rejected by eligibility gate."),
      eligibility
    };
  }

  const thresholdPrice = eligibility.extracted.thresholdPrice;
  const comparator = eligibility.extracted.comparator;
  if (thresholdPrice === undefined || !comparator) {
    const rejectReasons = ["Eligibility extraction unexpectedly omitted threshold or comparator."];
    const snapshot: FairProbabilitySnapshot = {
      ...baseSnapshot,
      modelProbabilityYes: null,
      edgeYes: null,
      edgeNo: null,
      confidence: 0,
      warnings: [],
      rejectReasons
    };
    return {
      snapshot,
      marker: markerFromSnapshot(snapshot, input, "REJECTED", rejectReasons[0] ?? "Rejected by fair value engine."),
      eligibility
    };
  }

  const probability = estimateTerminalAboveProbability({
    currentPrice: input.currentPrice ?? Number.NaN,
    thresholdPrice,
    candles: input.candles,
    horizonSeconds: input.horizonSeconds,
    now: input.now
  });
  const modelProbabilityYes =
    probability.probabilityAbove === null
      ? null
      : comparator === "BELOW"
        ? round(1 - probability.probabilityAbove)
        : probability.probabilityAbove;
  const marketProbabilityYes = marketYesPrice;
  const marketProbabilityNo = marketNoPrice ?? (marketProbabilityYes === null ? null : round(1 - marketProbabilityYes));
  const costBuffer = (input.feesBps + input.slippageBps) / 10_000;
  const edgeYes =
    modelProbabilityYes !== null && marketProbabilityYes !== null
      ? round(modelProbabilityYes - marketProbabilityYes - costBuffer)
      : null;
  const edgeNo =
    modelProbabilityYes !== null && marketProbabilityNo !== null
      ? round((1 - modelProbabilityYes) - marketProbabilityNo - costBuffer)
      : null;
  const rejectReasons = probability.rejectReasons;
  const confidence = rejectReasons.length
    ? 0
    : round(Math.min(0.82, Math.max(0.12, probability.usableReturnCount / 120)) * (probability.warnings.length ? 0.75 : 1));
  const snapshot: FairProbabilitySnapshot = {
    ...baseSnapshot,
    modelProbabilityYes,
    marketProbabilityYes,
    edgeYes,
    edgeNo,
    fairYesPrice: modelProbabilityYes,
    fairNoPrice: modelProbabilityYes === null ? null : round(1 - modelProbabilityYes),
    confidence,
    assumptions: probability.assumptions,
    warnings: probability.warnings,
    rejectReasons
  };
  const side = sideFromEdges({
    rejectReasons,
    edgeYes,
    edgeNo,
    minEdge: input.minEdgeBps / 10_000
  });
  return {
    snapshot,
    marker: markerFromSnapshot(snapshot, input, side, markerReason(snapshot, side)),
    eligibility
  };
}

function sideFromEdges(input: {
  rejectReasons: string[];
  edgeYes: number | null;
  edgeNo: number | null;
  minEdge: number;
}): FairValueSignalSide {
  if (input.rejectReasons.length) {
    return "REJECTED";
  }
  if (input.edgeYes !== null && input.edgeYes >= input.minEdge) {
    return "LONG_YES";
  }
  if (input.edgeNo !== null && input.edgeNo >= input.minEdge) {
    return "LONG_NO";
  }
  return "NO_SIGNAL";
}

function markerFromSnapshot(
  snapshot: FairProbabilitySnapshot,
  input: FairValueInput,
  side: FairValueSignalSide,
  reason: string
): FairValueSignalMarker {
  const edge = side === "LONG_YES" ? snapshot.edgeYes : side === "LONG_NO" ? snapshot.edgeNo : null;
  return {
    id: `fair-value:${snapshot.marketId}:${side}:${snapshot.checkedAt}`,
    symbol: input.symbol,
    marketId: snapshot.marketId,
    time: input.candles.at(-1)?.timestamp ?? input.now,
    price: input.currentPrice ?? input.candles.at(-1)?.close ?? 0,
    side,
    label: labelFor(side, edge, reason),
    reason,
    confidence: snapshot.confidence,
    modelProbabilityYes: snapshot.modelProbabilityYes,
    marketProbabilityYes: snapshot.marketProbabilityYes,
    edge,
    isResearchOnly: true
  };
}

function markerReason(snapshot: FairProbabilitySnapshot, side: FairValueSignalSide): string {
  if (side === "LONG_YES") {
    return `YES edge ${formatEdge(snapshot.edgeYes)} after fee/slippage buffer.`;
  }
  if (side === "LONG_NO") {
    return `NO edge ${formatEdge(snapshot.edgeNo)} after fee/slippage buffer.`;
  }
  if (side === "REJECTED") {
    return snapshot.rejectReasons[0] ?? "Rejected by fair value engine.";
  }
  return "Model-vs-market edge is below the research signal threshold.";
}

function labelFor(side: FairValueSignalSide, edge: number | null, reason: string): string {
  if (side === "LONG_YES") {
    return `YES ${formatEdge(edge)}`;
  }
  if (side === "LONG_NO") {
    return `NO ${formatEdge(edge)}`;
  }
  if (side === "REJECTED") {
    return `Rejected: ${shortReason(reason)}`;
  }
  return "No signal";
}

function shortReason(reason: string): string {
  return reason.length > 36 ? `${reason.slice(0, 33)}...` : reason;
}

function formatEdge(value: number | null): string {
  return value === null ? "n/a" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function firstNumber(...values: Array<number | null | undefined>): number | null {
  const value = values.find((item) => item !== null && item !== undefined && Number.isFinite(item));
  return value === undefined ? null : value;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
