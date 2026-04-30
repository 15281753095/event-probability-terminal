import {
  API_CONTRACT_VERSION,
  type ResearchSignal,
  type ResearchSignalModelVersion,
  type ResearchSignalSourceMode,
  type ResearchSignalsResponse,
  type SignalContextSnapshot,
  type SignalDirection,
  type SignalFeatureSnapshot,
  type SignalHorizon,
  type SignalSymbol,
  type OhlcvSource,
  type OHLCVFreshness,
  type OHLCVFetchRequest,
  type OHLCVFetchResult,
  type OhlcvCandle
} from "@ept/shared-types";
import { emptyFailClosedOHLCVResult, fetchCoinbaseExchangeCandles } from "./ohlcv/coinbase-exchange.js";
import { buildFeatureSnapshot } from "./indicators.js";
import { findResearchSignalFixture, researchSignalFixtures, type ResearchSignalFixture } from "./fixtures.js";
import { evaluateConfluence } from "./confluence.js";
import { getSignalProfile, type SignalProfileName } from "./profiles.js";

export const RESEARCH_SIGNAL_MODEL_VERSION: ResearchSignalModelVersion = "research-signal-engine-v0";
export const REQUIRED_CANDLE_COUNT = 35;

export type BuildSignalInput = {
  symbol: SignalSymbol;
  horizon: SignalHorizon;
  generatedAt: string;
  candles: OhlcvCandle[];
  context?: SignalContextSnapshot;
  source?: OhlcvSource;
  sourceMode?: ResearchSignalSourceMode;
  freshness?: OHLCVFreshness;
  sourceWarnings?: string[];
  sourceFailClosedReasons?: string[];
  isLive?: boolean;
  isFixtureBacked?: boolean;
  profileName?: SignalProfileName;
};

export type ListSignalsInput = {
  generatedAt: string;
  symbol?: SignalSymbol;
  horizon?: SignalHorizon;
};

export type OHLCVFetcher = (request: OHLCVFetchRequest) => Promise<OHLCVFetchResult>;

export type ListLiveSignalsInput = ListSignalsInput & {
  fetcher?: OHLCVFetcher;
};

type ScoreContribution = {
  label: string;
  value: number;
  reason: string;
};

export function listResearchSignals(input: ListSignalsInput): ResearchSignalsResponse {
  const fixtures = researchSignalFixtures.filter(
    (fixture) =>
      (!input.symbol || fixture.symbol === input.symbol) && (!input.horizon || fixture.horizon === input.horizon)
  );
  return {
    signals: fixtures.map((fixture) =>
      buildResearchSignal({
        symbol: fixture.symbol,
        horizon: fixture.horizon,
        candles: rebaseFixtureCandles(fixture.candles, input.generatedAt),
        context: fixture.context,
        generatedAt: input.generatedAt
      })
    ),
    meta: {
      contractVersion: API_CONTRACT_VERSION,
      responseKind: "research_signal",
      generatedAt: input.generatedAt,
      status: "ok",
      source: "research_signal_engine",
      mode: "fixture",
      isFixtureBacked: true,
      isReadOnly: true,
      isResearchOnly: true,
      isTradeAdvice: false,
      modelVersion: RESEARCH_SIGNAL_MODEL_VERSION,
      sourceName: "fixture",
      message:
        "Research signals are deterministic, fixture-backed, read-only directional bias outputs. They are not trade advice or order instructions."
    }
  };
}

export async function listLiveResearchSignals(input: ListLiveSignalsInput): Promise<ResearchSignalsResponse> {
  const fetcher = input.fetcher ?? fetchCoinbaseExchangeCandles;
  const signals = await Promise.all(
    signalTargets(input.symbol, input.horizon).map(async (target) => {
      const request: OHLCVFetchRequest = {
        symbol: target.symbol,
        interval: "1m",
        lookback: REQUIRED_CANDLE_COUNT,
        sourceMode: "live",
        requestedAt: input.generatedAt
      };
      let result: OHLCVFetchResult;
      try {
        result = await fetcher(request);
      } catch (error) {
        result = emptyFailClosedOHLCVResult(
          request,
          input.generatedAt,
          error instanceof Error ? error.message : "OHLCV adapter threw an unknown error."
        );
      }
      return buildResearchSignalFromOHLCV({
        symbol: target.symbol,
        horizon: target.horizon,
        generatedAt: input.generatedAt,
        result
      });
    })
  );

  return {
    signals,
    meta: {
      contractVersion: API_CONTRACT_VERSION,
      responseKind: "research_signal",
      generatedAt: input.generatedAt,
      status: "ok",
      source: "research_signal_engine",
      mode: "live",
      sourceName: "coinbase_exchange",
      isFixtureBacked: false,
      isReadOnly: true,
      isResearchOnly: true,
      isTradeAdvice: false,
      modelVersion: RESEARCH_SIGNAL_MODEL_VERSION,
      message:
        "Live research signals use Coinbase Exchange public OHLCV candles when explicitly requested. They are not trade advice or order instructions."
    }
  };
}

export function buildResearchSignalFromOHLCV(input: {
  symbol: SignalSymbol;
  horizon: SignalHorizon;
  generatedAt: string;
  result: OHLCVFetchResult;
  context?: SignalContextSnapshot;
}): ResearchSignal {
  return buildResearchSignal({
    symbol: input.symbol,
    horizon: input.horizon,
    generatedAt: input.generatedAt,
    candles: input.result.candles,
    ...(input.context ? { context: input.context } : {}),
    source: input.result.source,
    sourceMode: input.result.isLive ? "live" : "fixture",
    freshness: input.result.freshness,
    sourceWarnings: input.result.warnings,
    sourceFailClosedReasons: input.result.failClosedReasons,
    isLive: input.result.isLive,
    isFixtureBacked: input.result.isFixtureBacked
  });
}

export function rebaseFixtureCandles(candles: OhlcvCandle[], generatedAt: string): OhlcvCandle[] {
  const end = Date.parse(generatedAt) - 60_000;
  const first = end - (candles.length - 1) * 60_000;
  return candles.map((candle, index) => ({
    ...candle,
    timestamp: new Date(first + index * 60_000).toISOString()
  }));
}

export function getResearchSignalFixture(
  symbol: SignalSymbol,
  horizon: SignalHorizon
): ResearchSignalFixture | undefined {
  return findResearchSignalFixture(symbol, horizon);
}

export function buildResearchSignal(input: BuildSignalInput): ResearchSignal {
  const profile = getSignalProfile(input.profileName);
  const context = input.context ?? emptyContext();
  const source = input.source ?? "fixture";
  const sourceMode = input.sourceMode ?? "fixture";
  const isLive = input.isLive ?? sourceMode === "live";
  const isFixtureBacked = input.isFixtureBacked ?? sourceMode === "fixture";
  const dataQuality = assessDataQuality(input.candles, input.generatedAt, {
    source,
    ...(input.freshness ? { freshness: input.freshness } : {}),
    sourceWarnings: input.sourceWarnings ?? [],
    isLive,
    isFixtureBacked
  });
  const features =
    input.candles.length >= REQUIRED_CANDLE_COUNT
      ? buildFeatureSnapshot(input.candles)
      : emptyFeatureSnapshot(input.candles);
  const failClosedReasons = [...(input.sourceFailClosedReasons ?? []), ...failClosed(dataQuality, context)];
  const { confluence, riskFilters } = evaluateConfluence({
    horizon: input.horizon,
    features,
    dataQuality,
    context,
    failClosedReasons,
    profileName: profile.name
  });
  const direction = confluence.direction;
  const score = confluence.totalScore;
  const confidence = confluence.confidence;

  return {
    symbol: input.symbol,
    horizon: input.horizon,
    generatedAt: input.generatedAt,
    direction,
    confidence,
    score,
    reasons: reasons(direction, confluence, context, failClosedReasons),
    features,
    context,
    dataQuality,
    source,
    sourceMode,
    isResearchOnly: true,
    isTradeAdvice: false,
    modelVersion: RESEARCH_SIGNAL_MODEL_VERSION,
    profileName: profile.name,
    invalidation: [
      "Signal invalidates when fixture candles are stale relative to generatedAt.",
      "Signal invalidates when fast/slow EMA, MACD histogram, and momentum contributions materially diverge.",
      "Signal invalidates if future live adapters cannot prove source freshness and context provenance."
    ],
    failClosedReasons,
    confluence,
    riskFilters
  };
}

function assessDataQuality(
  candles: OhlcvCandle[],
  generatedAt: string,
  input: {
    source: OhlcvSource;
    freshness?: OHLCVFreshness;
    sourceWarnings: string[];
    isLive: boolean;
    isFixtureBacked: boolean;
  }
) {
  const missingFields = candles.flatMap((candle, index) =>
    ["open", "high", "low", "close", "volume"].flatMap((field) => {
      const value = candle[field as keyof OhlcvCandle];
      return typeof value === "number" && Number.isFinite(value) ? [] : [`candles[${index}].${field}`];
    })
  );
  const latest = candles.at(-1);
  const rawFreshnessAgeMs = latest
    ? Date.parse(generatedAt) - Date.parse(latest.timestamp)
    : Number.POSITIVE_INFINITY;
  const freshness =
    input.freshness ??
    ({
      status: latest && rawFreshnessAgeMs <= 3 * 60_000 ? "fresh" : latest ? "stale" : "unknown",
      latestStartTime: latest?.timestamp ?? null,
      latestClosedAt: latest ? new Date(Date.parse(latest.timestamp) + 60_000).toISOString() : null,
      ageMs: Number.isFinite(rawFreshnessAgeMs) ? rawFreshnessAgeMs : null,
      maxAgeMs: 3 * 60_000
    } satisfies OHLCVFreshness);
  const freshnessAgeMs = freshness.ageMs ?? rawFreshnessAgeMs;
  const maxFreshnessMs = freshness.maxAgeMs;
  const warnings: string[] = [...input.sourceWarnings];
  if (freshnessAgeMs > maxFreshnessMs) {
    warnings.push("Latest OHLCV candle is stale for short-horizon research signal generation.");
  }
  if (missingFields.length) {
    warnings.push("OHLCV fixture is missing required numeric fields.");
  }

  return {
    status:
      candles.length < REQUIRED_CANDLE_COUNT || missingFields.length
        ? "insufficient"
        : freshness.status === "stale" || freshnessAgeMs > maxFreshnessMs
          ? "stale"
          : "ok",
    source: input.source,
    candleCount: candles.length,
    requiredCandleCount: REQUIRED_CANDLE_COUNT,
    freshnessAgeMs,
    maxFreshnessMs,
    freshness,
    missingFields,
    warnings,
    isLive: input.isLive,
    isFixtureBacked: input.isFixtureBacked
  } as ResearchSignal["dataQuality"];
}

function failClosed(dataQuality: ResearchSignal["dataQuality"], context: SignalContextSnapshot): string[] {
  const reasons: string[] = [];
  if (dataQuality.status === "insufficient") {
    reasons.push("Insufficient OHLCV feature history or missing required candle fields.");
  }
  if (dataQuality.status === "stale") {
    reasons.push("Latest OHLCV candle is too stale for 5m/10m research signal output.");
  }
  if (context.marketEventRiskFlag) {
    reasons.push("Manual context fixture flags event risk; research signal fails closed.");
  }
  return reasons;
}

function scoreContributions(features: SignalFeatureSnapshot, context: SignalContextSnapshot): ScoreContribution[] {
  const contributions: ScoreContribution[] = [];
  const emaGap = (features.ema.fast - features.ema.slow) / features.lastClose;
  if (emaGap > 0.0004 && features.ema.slope > 0) {
    contributions.push({ label: "ema", value: 0.24, reason: "Fast EMA is above slow EMA and rising." });
  } else if (emaGap < -0.0004 && features.ema.slope < 0) {
    contributions.push({ label: "ema", value: -0.24, reason: "Fast EMA is below slow EMA and falling." });
  } else {
    contributions.push({ label: "ema", value: 0, reason: "EMA trend is not decisive." });
  }

  const fiveMinuteReturn = features.returns.fiveMinute ?? 0;
  const threeMinuteReturn = features.returns.threeMinute ?? 0;
  if (fiveMinuteReturn > 0.006 && threeMinuteReturn > 0.003) {
    contributions.push({ label: "momentum", value: 0.2, reason: "1m/3m/5m momentum cluster leans upward." });
  } else if (fiveMinuteReturn < -0.006 && threeMinuteReturn < -0.003) {
    contributions.push({ label: "momentum", value: -0.2, reason: "1m/3m/5m momentum cluster leans downward." });
  } else {
    contributions.push({ label: "momentum", value: 0, reason: "Momentum is mixed or too small." });
  }

  if (features.macd.histogram > 0 && features.macd.histogramSlope > 0) {
    contributions.push({ label: "macd", value: 0.18, reason: "MACD histogram is positive and expanding." });
  } else if (features.macd.histogram < 0 && features.macd.histogramSlope < 0) {
    contributions.push({ label: "macd", value: -0.18, reason: "MACD histogram is negative and weakening further." });
  } else {
    contributions.push({ label: "macd", value: 0, reason: "MACD does not confirm direction." });
  }

  if (features.rsi.value < 35) {
    contributions.push({ label: "rsi", value: 0.06, reason: "RSI is low; treated only as a weak upside mean-reversion input." });
  } else if (features.rsi.value > 65) {
    contributions.push({ label: "rsi", value: -0.06, reason: "RSI is elevated; treated only as a weak downside risk input." });
  } else {
    contributions.push({ label: "rsi", value: 0, reason: "RSI is neutral." });
  }

  if (features.bollinger.bandPosition > 0.72 && features.bollinger.expansion) {
    contributions.push({ label: "bollinger", value: 0.08, reason: "Price is high in the Bollinger channel with band expansion." });
  } else if (features.bollinger.bandPosition < 0.28 && features.bollinger.expansion) {
    contributions.push({ label: "bollinger", value: -0.08, reason: "Price is low in the Bollinger channel with band expansion." });
  } else if (features.bollinger.squeeze) {
    contributions.push({ label: "bollinger", value: 0, reason: "Bollinger bandwidth is compressed; direction is not upgraded." });
  }

  if (features.volume.abnormal && fiveMinuteReturn > 0) {
    contributions.push({ label: "volume", value: 0.07, reason: "Abnormal volume confirms positive short-horizon momentum." });
  } else if (features.volume.abnormal && fiveMinuteReturn < 0) {
    contributions.push({ label: "volume", value: -0.07, reason: "Abnormal volume confirms negative short-horizon momentum." });
  }

  if (features.volatility.regime === "high") {
    contributions.push({ label: "volatility", value: 0, reason: "High volatility regime caps confidence rather than setting direction." });
  }

  const contextScore = (context.newsScore ?? 0) * 0.35 + (context.xSignalScore ?? 0) * 0.25;
  const macroScore = context.macroRiskState === "risk_on" ? 0.04 : context.macroRiskState === "risk_off" ? -0.04 : 0;
  const contextualValue = clamp(contextScore + macroScore, -0.1, 0.1);
  if (contextualValue !== 0) {
    contributions.push({
      label: "context",
      value: contextualValue,
      reason: "Manual fixture context modifies score within a capped research-only range."
    });
  }

  return contributions;
}

function signalDirection(score: number, conflicts: number): SignalDirection {
  if (conflicts >= 3 && Math.abs(score) < 0.5) {
    return "NO_SIGNAL";
  }
  if (score >= 0.32) {
    return "LONG";
  }
  if (score <= -0.32) {
    return "SHORT";
  }
  return "NO_SIGNAL";
}

function confidenceScore(absScore: number, conflicts: number, status: ResearchSignal["dataQuality"]["status"], eventRisk: boolean): number {
  const qualityBonus = status === "ok" ? 0.16 : 0;
  const conflictPenalty = Math.min(conflicts * 0.08, 0.32);
  const eventPenalty = eventRisk ? 0.25 : 0;
  return round(clamp(absScore * 0.72 + qualityBonus - conflictPenalty - eventPenalty, 0, 0.9));
}

function reasons(
  direction: SignalDirection,
  confluence: ResearchSignal["confluence"],
  context: SignalContextSnapshot,
  failClosedReasons: string[]
): string[] {
  if (failClosedReasons.length) {
    return [
      "NO_SIGNAL because fail-closed conditions are present.",
      ...failClosedReasons,
      "No execution instruction or automated trading action is produced."
    ];
  }
  return [
    `${direction} research bias from multi-strategy confluence inputs.`,
    ...confluence.reasons.slice(0, 6),
    ...confluence.vetoReasons.slice(0, 4),
    context.sourceMode === "manual_fixture"
      ? "News/X/macro context is manual fixture input, not verified live external data."
      : "News/X/macro context is not configured.",
    "No execution instruction or automated trading action is produced."
  ];
}

function conflictCount(contributions: ScoreContribution[]): number {
  const positive = contributions.filter((item) => item.value > 0.04).length;
  const negative = contributions.filter((item) => item.value < -0.04).length;
  return Math.min(positive, negative);
}

function signalTargets(symbol?: SignalSymbol, horizon?: SignalHorizon): Array<{ symbol: SignalSymbol; horizon: SignalHorizon }> {
  const symbols: SignalSymbol[] = symbol ? [symbol] : ["BTC", "ETH"];
  const horizons: SignalHorizon[] = horizon ? [horizon] : ["5m", "10m"];
  return symbols.flatMap((itemSymbol) =>
    horizons.map((itemHorizon) => ({ symbol: itemSymbol, horizon: itemHorizon }))
  );
}

function emptyContext(): SignalContextSnapshot {
  return {
    sourceMode: "not_configured",
    newsScore: null,
    xSignalScore: null,
    macroRiskState: "unknown",
    marketEventRiskFlag: false,
    notes: ["No news, X, or macro context adapter is configured."]
  };
}

function emptyFeatureSnapshot(candles: OhlcvCandle[]): SignalFeatureSnapshot {
  const latest = candles.at(-1)?.close ?? 0;
  return {
    lastClose: latest,
    returns: { oneMinute: null, threeMinute: null, fiveMinute: null },
    ema: { fast: latest, slow: latest, slope: 0 },
    rsi: { value: 50, period: 14 },
    macd: { line: 0, signal: 0, histogram: 0, histogramSlope: 0 },
    bollinger: { middle: latest, upper: latest, lower: latest, bandwidth: 0, bandPosition: 0.5, squeeze: true, expansion: false },
    volatility: { atr: 0, realizedVolatility: 0, regime: "low" },
    volume: { latest: candles.at(-1)?.volume ?? 0, mean: 0, zScore: 0, abnormal: false }
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
