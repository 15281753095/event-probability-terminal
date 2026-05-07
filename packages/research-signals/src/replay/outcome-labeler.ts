import type { ReplayOutcome, ReplayResolvedOutcome, ReplayTradeLikeResult } from "@ept/shared-types";
import type { BuildReplayResultInput, LabelReplayOutcomeInput } from "./types.js";

const FEES_ASSUMPTION = "0 fee assumption for research replay; no real venue fees were charged.";
const SLIPPAGE_ASSUMPTION = "No realized slippage; replay uses theoretical signal-time probability only.";
const SPREAD_ASSUMPTION = "Observed spread is treated as research context, not executable liquidity.";

export function labelReplayOutcome(input: LabelReplayOutcomeInput): ReplayOutcome {
  const { signal } = input;
  if (signal.side === "NO_SIGNAL") {
    return baseOutcome(signal, "NO_SIGNAL", "unknown", ["NO_SIGNAL is not counted in realized win rate."]);
  }
  if (signal.side === "REJECTED") {
    return baseOutcome(signal, "REJECTED", "unknown", ["Rejected signals are not counted in realized win rate."]);
  }

  const expiryMs = Date.parse(signal.expiryTime);
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(expiryMs)) {
    return baseOutcome(signal, "UNRESOLVED", "unknown", ["Signal expiryTime is invalid."]);
  }
  if (Number.isFinite(nowMs) && nowMs < expiryMs) {
    return baseOutcome(signal, "PENDING", "unknown", ["Market has not reached expiry at replay check time."]);
  }

  const explicitOutcome = input.closedMarketData?.resolvedOutcome;
  if (explicitOutcome) {
    return outcomeFromResolved(signal, explicitOutcome, {
      source: input.closedMarketData?.outcomeSource ?? "polymarket-closed-market",
      resolvedAt: input.closedMarketData?.resolvedAt,
      notes: input.closedMarketData?.resolutionNotes ?? ["Resolved outcome provided by closed-market data."]
    });
  }

  const comparator = input.eligibility?.extracted.comparator ?? input.closedMarketData?.eligibility?.extracted.comparator;
  const thresholdPrice = input.eligibility?.extracted.thresholdPrice ?? input.closedMarketData?.eligibility?.extracted.thresholdPrice;
  if (comparator === "HIT") {
    return baseOutcome(signal, "UNRESOLVED", "unknown", [
      "Path-dependent HIT/reach market cannot be reconstructed from terminal expiry price only."
    ]);
  }
  if ((comparator === "ABOVE" || comparator === "BELOW") && thresholdPrice !== undefined) {
    const priceAtExpiry = priceAtOrBefore(input.historicalCandles, signal.expiryTime);
    if (priceAtExpiry === null) {
      return baseOutcome(signal, "UNRESOLVED", "unknown", [
        "No Binance historical candle was available at expiry for threshold reconstruction."
      ]);
    }
    if (priceAtExpiry === thresholdPrice) {
      return {
        ...baseOutcome(signal, "UNRESOLVED", "binance-threshold-reconstruction", [
          "Expiry price equals threshold; tie resolution rule is not confirmed, so replay does not guess."
        ]),
        priceAtExpiry
      };
    }
    const resolvedOutcome: ReplayResolvedOutcome =
      comparator === "ABOVE"
        ? priceAtExpiry > thresholdPrice ? "YES" : "NO"
        : priceAtExpiry < thresholdPrice ? "YES" : "NO";
    return outcomeFromResolved(signal, resolvedOutcome, {
      source: "binance-threshold-reconstruction",
      resolvedAt: signal.expiryTime,
      priceAtExpiry,
      notes: [
        `Terminal ${comparator} threshold reconstructed from Binance public candle close at expiry.`,
        "Resolution source is research reconstruction, not Polymarket settlement proof."
      ]
    });
  }

  return baseOutcome(signal, "UNRESOLVED", "unknown", [
    "Closed market did not expose an explicit outcome and threshold reconstruction was not eligible."
  ]);
}

export function buildReplayTradeLikeResult(input: BuildReplayResultInput): ReplayTradeLikeResult {
  const signal = input.signal;
  const actionable = signal.side === "LONG_YES" || signal.side === "LONG_NO";
  const countedInWinRate = input.outcome.status === "WIN" || input.outcome.status === "LOSS";
  const theoreticalEntryPrice = actionable
    ? signal.side === "LONG_YES"
      ? signal.marketProbabilityYes
      : input.marketNoPrice ?? (signal.marketProbabilityYes === null ? null : round(1 - signal.marketProbabilityYes))
    : null;
  const theoreticalExitValue = countedInWinRate ? input.outcome.status === "WIN" ? 1 : 0 : null;
  const theoreticalPnl =
    theoreticalEntryPrice !== null && theoreticalExitValue !== null
      ? round(theoreticalExitValue - theoreticalEntryPrice)
      : null;

  return {
    signal,
    outcome: input.outcome,
    theoreticalEntryPrice,
    theoreticalExitValue,
    theoreticalPnl,
    feesAssumption: FEES_ASSUMPTION,
    slippageAssumption: SLIPPAGE_ASSUMPTION,
    spreadAssumption: SPREAD_ASSUMPTION,
    countedInWinRate
  };
}

function outcomeFromResolved(
  signal: LabelReplayOutcomeInput["signal"],
  resolvedOutcome: ReplayResolvedOutcome,
  metadata: {
    source: ReplayOutcome["outcomeSource"];
    resolvedAt?: string | undefined;
    priceAtExpiry?: number | undefined;
    notes: string[];
  }
): ReplayOutcome {
  const won =
    (signal.side === "LONG_YES" && resolvedOutcome === "YES") ||
    (signal.side === "LONG_NO" && resolvedOutcome === "NO");
  return {
    signalId: signal.id,
    marketId: signal.marketId,
    status: won ? "WIN" : "LOSS",
    resolvedOutcome,
    outcomeSource: metadata.source,
    ...(metadata.resolvedAt ? { resolvedAt: metadata.resolvedAt } : {}),
    ...(metadata.priceAtExpiry !== undefined ? { priceAtExpiry: metadata.priceAtExpiry } : {}),
    notes: metadata.notes
  };
}

function baseOutcome(
  signal: LabelReplayOutcomeInput["signal"],
  status: ReplayOutcome["status"],
  outcomeSource: ReplayOutcome["outcomeSource"],
  notes: string[]
): ReplayOutcome {
  return {
    signalId: signal.id,
    marketId: signal.marketId,
    status,
    outcomeSource,
    notes
  };
}

function priceAtOrBefore(candles: LabelReplayOutcomeInput["historicalCandles"], isoTime: string): number | null {
  const target = Date.parse(isoTime);
  if (!Number.isFinite(target)) {
    return null;
  }
  const candidate = [...candles]
    .filter((candle) => Date.parse(candle.timestamp) <= target)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
  return candidate && Number.isFinite(candidate.close) ? candidate.close : null;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
