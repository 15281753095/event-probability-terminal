import type {
  EventSignalConsoleResponse,
  ResearchSignalSourceMode,
  SignalDirection,
  SignalHorizon,
  SignalProfileName,
  SignalSymbol
} from "@ept/shared-types";

export type SignalObservationStatus = "pending" | "hit" | "miss" | "no_signal" | "invalidated";

export type SignalObservation = {
  id: string;
  createdAt: string;
  symbol: SignalSymbol;
  horizon: SignalHorizon;
  sourceMode: ResearchSignalSourceMode;
  direction: SignalDirection;
  score: number;
  confidence: number;
  profileName: SignalProfileName;
  entryPrice: number | null;
  entryCandleTime: string | null;
  expectedResolveAt: string | null;
  status: SignalObservationStatus;
  resolvePrice: number | null;
  resolvedAt: string | null;
  movePct: number | null;
  reasonSummary: string;
  caveats: string[];
};

export type ObservationBucketSummary = {
  totalDirectionalSignals: number;
  resolvedCount: number;
  pendingCount: number;
  invalidatedCount: number;
  directionalMatchRate: number | null;
};

export type ObservationSummary = ObservationBucketSummary & {
  byHorizon: Record<SignalHorizon, ObservationBucketSummary>;
  byDirection: Record<"LONG" | "SHORT", ObservationBucketSummary>;
  byProfile: Record<SignalProfileName, ObservationBucketSummary>;
  recentMissReasons: string[];
  suggestedAdjustments: string[];
};

export const SIGNAL_OBSERVATION_STORAGE_KEY = "ept.signalObservations.v1";
export const MAX_STORED_OBSERVATIONS = 100;
export const MAX_DISPLAYED_OBSERVATIONS = 20;
export const MAX_OBSERVATION_MARKERS = 20;

export function createSignalObservation(payload: EventSignalConsoleResponse): SignalObservation {
  const candidate = payload.observationCandidate;
  const status =
    candidate.direction === "NO_SIGNAL"
      ? "no_signal"
      : candidate.canObserve && candidate.entryPrice !== null && candidate.entryCandleTime && candidate.expectedResolveAt
        ? "pending"
        : "invalidated";
  return {
    id: observationId(candidate.createdAt, candidate.symbol, candidate.horizon, candidate.sourceMode, candidate.direction, candidate.profileName),
    createdAt: candidate.createdAt,
    symbol: candidate.symbol,
    horizon: candidate.horizon,
    sourceMode: candidate.sourceMode,
    direction: candidate.direction,
    score: candidate.score,
    confidence: candidate.confidence,
    profileName: candidate.profileName,
    entryPrice: candidate.entryPrice,
    entryCandleTime: candidate.entryCandleTime,
    expectedResolveAt: candidate.expectedResolveAt,
    status,
    resolvePrice: null,
    resolvedAt: null,
    movePct: null,
    reasonSummary: candidate.reasonSummary,
    caveats: candidate.caveats
  };
}

export function mergeObservationSnapshot(
  observations: SignalObservation[],
  payload: EventSignalConsoleResponse
): SignalObservation[] {
  const resolved = resolvePendingObservations(observations, payload);
  const next = createSignalObservation(payload);
  const withNext = shouldRecordObservation(resolved, next) ? [next, ...resolved] : resolved;
  return pruneObservations(withNext);
}

export function resolvePendingObservations(
  observations: SignalObservation[],
  payload: EventSignalConsoleResponse
): SignalObservation[] {
  const latest = payload.recentCandles.at(-1);
  const latestTime = latest ? Date.parse(latest.timestamp) : Number.NaN;
  const generatedAt = Date.parse(payload.meta.generatedAt);
  return observations.map((observation) => {
    if (observation.status !== "pending") {
      return observation;
    }
    if (
      observation.symbol !== payload.symbol ||
      observation.horizon !== payload.horizon ||
      observation.sourceMode !== payload.sourceMode
    ) {
      return observation;
    }
    if (!observation.expectedResolveAt || observation.entryPrice === null || observation.entryPrice === 0) {
      return invalidateObservation(observation, payload.meta.generatedAt, "Missing reference price or resolve time.");
    }
    const expectedResolveAt = Date.parse(observation.expectedResolveAt);
    if (Number.isNaN(expectedResolveAt)) {
      return invalidateObservation(observation, payload.meta.generatedAt, "Invalid resolve time.");
    }
    if (!latest || Number.isNaN(latestTime)) {
      return generatedAt >= expectedResolveAt
        ? invalidateObservation(observation, payload.meta.generatedAt, "Missing current candle for resolution.")
        : observation;
    }
    if (latestTime < expectedResolveAt) {
      return observation;
    }
    const movePct = (latest.close - observation.entryPrice) / observation.entryPrice;
    const hit =
      observation.direction === "LONG"
        ? latest.close > observation.entryPrice
        : observation.direction === "SHORT"
          ? latest.close < observation.entryPrice
          : false;
    return {
      ...observation,
      status: hit ? "hit" : "miss",
      resolvePrice: latest.close,
      resolvedAt: latest.timestamp,
      movePct: round(movePct)
    };
  });
}

export function shouldRecordObservation(observations: SignalObservation[], next: SignalObservation): boolean {
  const latestComparable = observations.find(
    (item) =>
      item.symbol === next.symbol &&
      item.horizon === next.horizon &&
      item.sourceMode === next.sourceMode &&
      item.profileName === next.profileName
  );
  if (!latestComparable) {
    return true;
  }
  if (latestComparable.direction !== next.direction) {
    return true;
  }
  const cooldownMs = cooldownSeconds(next.horizon) * 1000;
  const ageMs = Date.parse(next.createdAt) - Date.parse(latestComparable.createdAt);
  if (Number.isFinite(ageMs) && ageMs >= cooldownMs) {
    return Math.abs(next.score - latestComparable.score) >= 0.08 || next.status !== "no_signal";
  }
  if (next.status === "no_signal") {
    return false;
  }
  return Math.abs(next.score - latestComparable.score) >= 0.08;
}

export function pruneObservations(observations: SignalObservation[]): SignalObservation[] {
  return observations.slice(0, MAX_STORED_OBSERVATIONS);
}

export function displayedObservations(observations: SignalObservation[]): SignalObservation[] {
  return observations.slice(0, MAX_DISPLAYED_OBSERVATIONS);
}

export function observationMarkerCount(observations: SignalObservation[]): number {
  return observations
    .filter((observation) => observation.status === "pending" || observation.status === "hit" || observation.status === "miss")
    .slice(0, MAX_OBSERVATION_MARKERS).length;
}

export function buildObservationSummary(observations: SignalObservation[]): ObservationSummary {
  const byHorizon = {
    "5m": bucketSummary(observations.filter((observation) => observation.horizon === "5m")),
    "10m": bucketSummary(observations.filter((observation) => observation.horizon === "10m"))
  };
  const byDirection = {
    LONG: bucketSummary(observations.filter((observation) => observation.direction === "LONG")),
    SHORT: bucketSummary(observations.filter((observation) => observation.direction === "SHORT"))
  };
  const byProfile = {
    balanced: bucketSummary(observations.filter((observation) => observation.profileName === "balanced")),
    conservative: bucketSummary(observations.filter((observation) => observation.profileName === "conservative")),
    aggressive: bucketSummary(observations.filter((observation) => observation.profileName === "aggressive"))
  };
  const recentMissReasons = observations
    .filter((observation) => observation.status === "miss")
    .slice(0, 5)
    .map((observation) => observation.reasonSummary);
  const summary = bucketSummary(observations);
  return {
    ...summary,
    byHorizon,
    byDirection,
    byProfile,
    recentMissReasons,
    suggestedAdjustments: suggestedAdjustments(observations, summary, byHorizon, byDirection, byProfile)
  };
}

export function readStoredObservations(): SignalObservation[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(SIGNAL_OBSERVATION_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SignalObservation[];
    return Array.isArray(parsed) ? pruneObservations(parsed.filter(isObservationLike)) : [];
  } catch {
    return [];
  }
}

export function writeStoredObservations(observations: SignalObservation[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SIGNAL_OBSERVATION_STORAGE_KEY, JSON.stringify(pruneObservations(observations)));
}

function bucketSummary(observations: SignalObservation[]): ObservationBucketSummary {
  const directional = observations.filter((observation) => observation.direction !== "NO_SIGNAL");
  const resolved = directional.filter((observation) => observation.status === "hit" || observation.status === "miss");
  const hits = resolved.filter((observation) => observation.status === "hit").length;
  return {
    totalDirectionalSignals: directional.length,
    resolvedCount: resolved.length,
    pendingCount: directional.filter((observation) => observation.status === "pending").length,
    invalidatedCount: directional.filter((observation) => observation.status === "invalidated").length,
    directionalMatchRate: resolved.length ? round(hits / resolved.length) : null
  };
}

function suggestedAdjustments(
  observations: SignalObservation[],
  summary: ObservationBucketSummary,
  byHorizon: ObservationSummary["byHorizon"],
  byDirection: ObservationSummary["byDirection"],
  byProfile: ObservationSummary["byProfile"]
): string[] {
  const suggestions: string[] = [];
  if (summary.resolvedCount >= 3 && (summary.directionalMatchRate ?? 1) < 0.45) {
    suggestions.push("Recent directional matches are weak; consider testing conservative profile locally.");
  }
  if (byHorizon["5m"].resolvedCount >= 2 && (byHorizon["5m"].directionalMatchRate ?? 1) < 0.5) {
    suggestions.push("5m misses increased; consider stricter chop and volume confirmation.");
  }
  if (byDirection.SHORT.resolvedCount >= 2 && (byDirection.SHORT.directionalMatchRate ?? 1) < 0.5) {
    suggestions.push("SHORT misses under recent conditions; consider requiring stronger volume confirmation.");
  }
  if (byHorizon["10m"].resolvedCount >= 2 && (byHorizon["10m"].directionalMatchRate ?? 0) > 0.65) {
    suggestions.push("10m directional checks are stronger in the local sample; profile comparisons may focus there.");
  }
  if (byProfile.aggressive.totalDirectionalSignals >= 5 && byProfile.aggressive.resolvedCount < 2) {
    suggestions.push("Aggressive profile is producing many unresolved observations; keep it in fixture or local observation mode.");
  }
  if (observations.filter((observation) => observation.status === "no_signal").length >= 8 && summary.totalDirectionalSignals <= 2) {
    suggestions.push("Many NO_SIGNAL observations under normal data quality; aggressive profile may be tested in fixture mode.");
  }
  return suggestions.length
    ? suggestions
    : ["Sample is small; keep observing before changing research parameters."];
}

function cooldownSeconds(horizon: SignalHorizon): number {
  return horizon === "5m" ? 120 : 180;
}

function invalidateObservation(observation: SignalObservation, resolvedAt: string, caveat: string): SignalObservation {
  return {
    ...observation,
    status: "invalidated",
    resolvedAt,
    caveats: [...observation.caveats, caveat]
  };
}

function observationId(
  createdAt: string,
  symbol: SignalSymbol,
  horizon: SignalHorizon,
  sourceMode: ResearchSignalSourceMode,
  direction: SignalDirection,
  profileName: SignalProfileName
) {
  return `${createdAt}-${symbol}-${horizon}-${sourceMode}-${direction}-${profileName}`;
}

function isObservationLike(value: unknown): value is SignalObservation {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "createdAt" in value &&
      "symbol" in value &&
      "horizon" in value &&
      "status" in value
  );
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
