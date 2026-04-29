import type {
  ConfluenceScore,
  ResearchSignal,
  RiskFilterSummary,
  SignalContextSnapshot,
  SignalFeatureSnapshot,
  SignalHorizon,
  SignalDirection
} from "@ept/shared-types";
import { getSignalProfile, type SignalProfileName } from "./profiles.js";

export type ConfluenceEvaluation = {
  confluence: ConfluenceScore;
  riskFilters: RiskFilterSummary;
};

export type EvaluateConfluenceInput = {
  horizon: SignalHorizon;
  features: SignalFeatureSnapshot;
  dataQuality: ResearchSignal["dataQuality"];
  context: SignalContextSnapshot;
  failClosedReasons?: string[];
  profileName?: SignalProfileName;
};

type ModuleScore = {
  score: number;
  reasons: string[];
};

export function evaluateConfluence(input: EvaluateConfluenceInput): ConfluenceEvaluation {
  const profile = getSignalProfile(input.profileName);
  const threshold = profile.horizons[input.horizon];
  const trend = trendModule(input.features);
  const momentum = momentumModule(input.features);
  const volatility = volatilityModule(input.features, trend.score, momentum.score);
  const volume = volumeModule(input.features);
  const reversalRisk = meanReversionRisk(input.features, trend.score, momentum.score);
  const chopRisk = chopRiskScore(input.features, trend.score, momentum.score);
  const failClosedReasons = input.failClosedReasons ?? [];
  const vetoReasons = unique([
    ...failClosedReasons,
    ...filterVetoReasons(input, trend.score, momentum.score, volatility.score, volume.score, reversalRisk, chopRisk, threshold)
  ]);
  if (Math.abs(trend.score) < threshold.minTrendAbs && Math.abs(momentum.score) >= 0.55) {
    vetoReasons.push(`${input.horizon} horizon requires trend alignment before directional bias can be emitted.`);
  }

  const baseScore =
    trend.score * 0.36 +
    momentum.score * 0.3 +
    volatility.score * 0.14 +
    volume.score * threshold.volumeConfirmWeight +
    contextScore(input.context);
  const rawDirection = baseScore > 0 ? 1 : baseScore < 0 ? -1 : 0;
  const riskPenalty = rawDirection === 0 ? 0 : rawDirection * (reversalRisk * 0.12 + chopRisk * 0.16);
  const totalScore = round(clamp(baseScore - riskPenalty, -1, 1));
  const absScore = Math.abs(totalScore);
  const direction =
    vetoReasons.length > 0
      ? "NO_SIGNAL"
      : totalScore >= threshold.longThreshold
        ? "LONG"
        : totalScore <= threshold.shortThreshold
          ? "SHORT"
          : "NO_SIGNAL";
  const riskFilters = buildRiskFilters(input, volatility.score, volume.score, reversalRisk, chopRisk, vetoReasons, threshold);
  const rawConfidence = round(
    clamp(
      absScore * 0.76 +
        (input.dataQuality.status === "ok" ? 0.12 : 0) -
        reversalRisk * 0.16 -
        chopRisk * 0.18 -
        volumePenalty(volume.score) -
        (input.features.volatility.regime === "high" ? 0.08 : 0),
      0,
      0.9
    )
  );
  const confidence = direction === "NO_SIGNAL" || rawConfidence < threshold.minConfidence ? 0 : rawConfidence;
  const finalDirection = confidence === 0 ? "NO_SIGNAL" : direction;
  const confluence: ConfluenceScore = {
    profileName: profile.name,
    trendScore: round(trend.score),
    momentumScore: round(momentum.score),
    volatilityScore: round(volatility.score),
    volumeScore: round(volume.score),
    reversalRisk: round(reversalRisk),
    chopRisk: round(chopRisk),
    totalScore,
    direction: finalDirection,
    confidence,
    reasons: confluenceReasons(
      finalDirection,
      trend,
      momentum,
      volatility,
      volume,
      reversalRisk,
      chopRisk,
      input.horizon,
      Math.abs(threshold.longThreshold),
      profile.name
    ),
    vetoReasons
  };

  return {
    confluence,
    riskFilters
  };
}

function trendModule(features: SignalFeatureSnapshot): ModuleScore {
  const emaGap = ratio(features.ema.fast - features.ema.slow, features.lastClose);
  const emaSlope = ratio(features.ema.slope, features.lastClose);
  const priceVsSlowEma = ratio(features.lastClose - features.ema.slow, features.lastClose);

  if (emaGap > 0.00035 && emaSlope > 0.00004 && priceVsSlowEma > 0.0002) {
    return {
      score: clamp((emaGap / 0.0028 + emaSlope / 0.0008 + priceVsSlowEma / 0.003) / 3, 0.35, 1),
      reasons: ["Trend module: fast EMA is above slow EMA, slope is positive, and price is above slow EMA."]
    };
  }
  if (emaGap < -0.00035 && emaSlope < -0.00004 && priceVsSlowEma < -0.0002) {
    return {
      score: -clamp((Math.abs(emaGap) / 0.0028 + Math.abs(emaSlope) / 0.0008 + Math.abs(priceVsSlowEma) / 0.003) / 3, 0.35, 1),
      reasons: ["Trend module: fast EMA is below slow EMA, slope is negative, and price is below slow EMA."]
    };
  }
  return {
    score: 0,
    reasons: ["Trend module: EMA alignment is flat or mixed."]
  };
}

function momentumModule(features: SignalFeatureSnapshot): ModuleScore {
  const oneMinute = features.returns.oneMinute ?? 0;
  const threeMinute = features.returns.threeMinute ?? 0;
  const fiveMinute = features.returns.fiveMinute ?? 0;
  const returnScore = clamp((oneMinute / 0.0012 + threeMinute / 0.003 + fiveMinute / 0.005) / 3, -1, 1);
  let macdScore = 0;
  if (features.macd.histogram > 0 && features.macd.histogramSlope > 0) {
    macdScore = 1;
  } else if (features.macd.histogram < 0 && features.macd.histogramSlope < 0) {
    macdScore = -1;
  } else if (Math.abs(features.macd.histogram) > 0) {
    macdScore = Math.sign(features.macd.histogram) * 0.25;
  }
  const score = clamp(returnScore * 0.62 + macdScore * 0.38, -1, 1);
  const directionLabel = score > 0.2 ? "upward" : score < -0.2 ? "downward" : "mixed";
  return {
    score,
    reasons: [`Momentum module: short-horizon returns and MACD histogram are ${directionLabel}.`]
  };
}

function volatilityModule(features: SignalFeatureSnapshot, trendScore: number, momentumScore: number): ModuleScore {
  if (features.volatility.regime === "low" || features.bollinger.squeeze) {
    return {
      score: 0,
      reasons: ["Volatility module: low-volatility or Bollinger squeeze state blocks directional upgrade."]
    };
  }

  const dominantDirection = Math.abs(momentumScore) >= Math.abs(trendScore) ? Math.sign(momentumScore) : Math.sign(trendScore);
  let bandScore = 0;
  if (features.bollinger.bandPosition > 0.68 && features.bollinger.expansion) {
    bandScore = 0.65;
  } else if (features.bollinger.bandPosition < 0.32 && features.bollinger.expansion) {
    bandScore = -0.65;
  } else if (dominantDirection !== 0 && features.volatility.regime === "normal") {
    bandScore = dominantDirection * 0.35;
  } else if (dominantDirection !== 0 && features.volatility.regime === "high") {
    bandScore = dominantDirection * 0.18;
  }

  return {
    score: clamp(bandScore, -1, 1),
    reasons: [`Volatility module: regime=${features.volatility.regime}, Bollinger bandwidth=${round(features.bollinger.bandwidth)}.`]
  };
}

function volumeModule(features: SignalFeatureSnapshot): ModuleScore {
  const fiveMinute = features.returns.fiveMinute ?? 0;
  if (features.volume.abnormal && fiveMinute > 0) {
    return {
      score: clamp(0.55 + Math.min(features.volume.zScore, 3) * 0.12, 0.55, 0.9),
      reasons: ["Volume module: abnormal volume confirms upward short-horizon move."]
    };
  }
  if (features.volume.abnormal && fiveMinute < 0) {
    return {
      score: -clamp(0.55 + Math.min(Math.abs(features.volume.zScore), 3) * 0.12, 0.55, 0.9),
      reasons: ["Volume module: abnormal volume confirms downward short-horizon move."]
    };
  }
  if (features.volume.zScore > 0.4 && fiveMinute > 0) {
    return {
      score: 0.24,
      reasons: ["Volume module: volume is mildly supportive but not abnormal."]
    };
  }
  if (features.volume.zScore > 0.4 && fiveMinute < 0) {
    return {
      score: -0.24,
      reasons: ["Volume module: volume is mildly supportive but not abnormal."]
    };
  }
  return {
    score: 0,
    reasons: ["Volume module: no volume confirmation; confidence is reduced."]
  };
}

function meanReversionRisk(features: SignalFeatureSnapshot, trendScore: number, momentumScore: number): number {
  const direction = Math.sign(trendScore * 0.55 + momentumScore * 0.45);
  if (direction > 0) {
    return clamp(
      (features.rsi.value > 72 ? 0.45 : features.rsi.value > 66 ? 0.24 : 0) +
        (features.bollinger.bandPosition > 0.92 ? 0.35 : features.bollinger.bandPosition > 0.82 ? 0.18 : 0),
      0,
      1
    );
  }
  if (direction < 0) {
    return clamp(
      (features.rsi.value < 28 ? 0.45 : features.rsi.value < 34 ? 0.24 : 0) +
        (features.bollinger.bandPosition < 0.08 ? 0.35 : features.bollinger.bandPosition < 0.18 ? 0.18 : 0),
      0,
      1
    );
  }
  return features.rsi.value > 70 || features.rsi.value < 30 ? 0.25 : 0;
}

function chopRiskScore(features: SignalFeatureSnapshot, trendScore: number, momentumScore: number): number {
  const oneMinute = features.returns.oneMinute ?? 0;
  const threeMinute = features.returns.threeMinute ?? 0;
  const fiveMinute = features.returns.fiveMinute ?? 0;
  const directionConflict =
    Math.sign(oneMinute) !== 0 &&
    Math.sign(fiveMinute) !== 0 &&
    Math.sign(oneMinute) !== Math.sign(fiveMinute)
      ? 0.28
      : 0;
  const trendMomentumConflict =
    Math.sign(trendScore) !== 0 && Math.sign(momentumScore) !== 0 && Math.sign(trendScore) !== Math.sign(momentumScore)
      ? 0.34
      : 0;
  const emaFlat = Math.abs(ratio(features.ema.slope, features.lastClose)) < 0.00004 ? 0.2 : 0;
  const macdFlat = Math.abs(ratio(features.macd.histogramSlope, features.lastClose)) < 0.00003 ? 0.16 : 0;
  const lowRange = features.bollinger.bandwidth < 0.006 || features.volatility.regime === "low" ? 0.28 : 0;
  const returnConflict =
    Math.sign(threeMinute) !== 0 && Math.sign(fiveMinute) !== 0 && Math.sign(threeMinute) !== Math.sign(fiveMinute)
      ? 0.18
      : 0;
  return clamp(directionConflict + trendMomentumConflict + emaFlat + macdFlat + lowRange + returnConflict, 0, 1);
}

function filterVetoReasons(
  input: EvaluateConfluenceInput,
  trendScore: number,
  momentumScore: number,
  volatilityScore: number,
  volumeScore: number,
  reversalRisk: number,
  chopRisk: number,
  threshold: ReturnType<typeof getSignalProfile>["horizons"][SignalHorizon]
): string[] {
  const reasons: string[] = [];
  if (input.dataQuality.status === "stale") {
    reasons.push("Data freshness veto: latest OHLCV candle is stale.");
  }
  if (input.dataQuality.status === "insufficient") {
    reasons.push("Data quality veto: insufficient OHLCV history or required fields.");
  }
  if (input.context.marketEventRiskFlag) {
    reasons.push("Context veto: manual event-risk flag is active.");
  }
  const emaSlopeRatio = Math.abs(ratio(input.features.ema.slope, input.features.lastClose));
  const macdAtrRatio = Math.abs(ratio(input.features.macd.histogram, input.features.volatility.atr || input.features.lastClose));
  const macdPriceRatio = Math.abs(ratio(input.features.macd.histogram, input.features.lastClose));
  if (emaSlopeRatio < threshold.minEmaSlopeRatio && Math.abs(momentumScore) < 0.72) {
    reasons.push("Trend veto: EMA slope is too flat for a short-horizon directional bias.");
  }
  if ((macdAtrRatio < threshold.minMacdHistogramAtrRatio || macdPriceRatio < threshold.minMacdHistogramAtrRatio) && Math.abs(momentumScore) < 0.72) {
    reasons.push("Momentum veto: MACD histogram is too flat for directional confirmation.");
  }
  if (input.features.volatility.regime === "low" || input.features.bollinger.squeeze || input.features.bollinger.bandwidth < threshold.minVolatilityBandwidth) {
    reasons.push("Volatility veto: too-low volatility or Bollinger squeeze for short-horizon signal.");
  }
  if (input.features.bollinger.bandwidth > threshold.maxExtremeVolatilityBandwidth || ratio(input.features.volatility.atr, input.features.lastClose) > threshold.maxExtremeAtrRatio) {
    reasons.push("Volatility veto: extreme short-horizon volatility regime.");
  }
  if (reversalRisk >= 0.45 && Math.sign(trendScore) !== 0 && Math.sign(momentumScore) !== Math.sign(trendScore)) {
    reasons.push("Reversal veto: RSI extreme is not confirmed by trend and momentum alignment.");
  }
  if (chopRisk >= threshold.maxChopRisk) {
    reasons.push("Chop veto: short-term direction conflict or range-bound conditions are too high.");
  }
  if (Math.sign(trendScore) !== 0 && Math.sign(momentumScore) !== 0 && Math.sign(trendScore) !== Math.sign(momentumScore)) {
    reasons.push("Conflict veto: trend and momentum modules disagree.");
  }
  if (Math.abs(volatilityScore) > 0.1 && Math.sign(volatilityScore) !== Math.sign(trendScore || momentumScore)) {
    reasons.push("Conflict veto: volatility breakout direction disagrees with trend or momentum.");
  }
  if (
    Math.sign(trendScore) !== 0 &&
    Math.sign(momentumScore) !== 0 &&
    Math.sign(volumeScore) !== 0 &&
    new Set([Math.sign(trendScore), Math.sign(momentumScore), Math.sign(volumeScore)]).size > 1
  ) {
    reasons.push("Conflict veto: trend, momentum, and volume modules are not aligned.");
  }
  if (Math.abs(volumeScore) < 0.1 && Math.abs(momentumScore) < 0.72) {
    reasons.push("Confirmation veto: no abnormal volume confirmation for a moderate momentum setup.");
  }
  return reasons;
}

function buildRiskFilters(
  input: EvaluateConfluenceInput,
  volatilityScore: number,
  volumeScore: number,
  reversalRisk: number,
  chopRisk: number,
  vetoReasons: string[],
  threshold: ReturnType<typeof getSignalProfile>["horizons"][SignalHorizon]
): RiskFilterSummary {
  const volatility =
    input.features.volatility.regime === "low" || input.features.bollinger.squeeze
      ? "veto"
      : input.features.volatility.regime === "high"
        ? "watch"
        : "pass";
  const conflict = vetoReasons.some((reason) => reason.startsWith("Conflict veto")) ? "veto" : chopRisk > 0.35 ? "watch" : "pass";
  return {
    dataFreshness: input.dataQuality.status === "ok" ? "pass" : "veto",
    volatility,
    volumeConfirmation: Math.abs(volumeScore) >= 0.5 ? "confirmed" : Math.abs(volumeScore) > 0 ? "weak" : "missing",
    chop: chopRisk >= threshold.maxChopRisk ? "veto" : chopRisk > 0.38 ? "watch" : "pass",
    conflict,
    meanReversion: reversalRisk > 0.35 ? "watch" : "pass",
    reasons: [
      `Freshness=${input.dataQuality.status}; volatility=${input.features.volatility.regime}; volume z-score=${round(input.features.volume.zScore)}.`,
      `Chop risk=${round(chopRisk)}; mean-reversion risk=${round(reversalRisk)}.`
    ],
    vetoReasons
  };
}

function confluenceReasons(
  direction: SignalDirection,
  trend: ModuleScore,
  momentum: ModuleScore,
  volatility: ModuleScore,
  volume: ModuleScore,
  reversalRisk: number,
  chopRisk: number,
  horizon: SignalHorizon,
  threshold: number,
  profileName: SignalProfileName
): string[] {
  const label =
    direction === "LONG"
      ? "LONG bias"
      : direction === "SHORT"
        ? "SHORT bias"
        : "NO_SIGNAL";
  return [
    `${label}: ${horizon} ${profileName} profile threshold is ${threshold.toFixed(2)}; RSI is auxiliary only.`,
    ...trend.reasons,
    ...momentum.reasons,
    ...volatility.reasons,
    ...volume.reasons,
    `Mean reversion risk=${round(reversalRisk)}; chop risk=${round(chopRisk)}.`
  ];
}

function contextScore(context: SignalContextSnapshot): number {
  const newsScore = context.newsScore ?? 0;
  const xScore = context.xSignalScore ?? 0;
  const macroScore =
    context.macroRiskState === "risk_on" ? 0.04 : context.macroRiskState === "risk_off" ? -0.04 : 0;
  return clamp(newsScore * 0.18 + xScore * 0.12 + macroScore, -0.08, 0.08);
}

function volumePenalty(volumeScore: number): number {
  return Math.abs(volumeScore) >= 0.5 ? 0 : Math.abs(volumeScore) > 0 ? 0.04 : 0.08;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
