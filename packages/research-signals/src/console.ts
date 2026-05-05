import {
  API_CONTRACT_VERSION,
  type BacktestPreview,
  type EventSignalConsoleResponse,
  type EventWindow,
  type LiveMarketDataResponse,
  type LiveMarketDataSource,
  type MarketDataProvenance,
  type OHLCVFetchRequest,
  type OHLCVFetchResult,
  type OhlcvCandle,
  type OhlcvSource,
  type ObservationPreview,
  type ProviderHealth,
  type ResearchSignal,
  type ResearchSignalSourceMode,
  type SignalObservationCandidate,
  type SignalContextSnapshot,
  type SignalHorizon,
  type SignalMarker,
  type SignalProfileName,
  type SignalSymbol
} from "@ept/shared-types";
import { buildFeatureSnapshot } from "./indicators.js";
import {
  REQUIRED_CANDLE_COUNT,
  RESEARCH_SIGNAL_MODEL_VERSION,
  buildResearchSignal,
  rebaseFixtureCandles,
  type OHLCVFetcher
} from "./engine.js";
import { findResearchSignalFixture } from "./fixtures.js";
import {
  emptyFailClosedBinanceOHLCVResult,
  fetchBinanceSpotCandles,
  fetchBinanceSpotMarketData
} from "./ohlcv/binance-spot.js";
import {
  emptyFailClosedOHLCVResult,
  fetchCoinbaseExchangeMarketData
} from "./ohlcv/coinbase-exchange.js";
import type { LiveMarketDataFetcher } from "./ohlcv/types.js";
import { evaluateConfluence } from "./confluence.js";

export const CONSOLE_CANDLE_LOOKBACK = 80;
export const RECENT_CANDLE_LIMIT = 60;
export const RECENT_MARKER_LIMIT = 10;

export type BuildEventSignalConsoleInput = {
  symbol: SignalSymbol;
  horizon: SignalHorizon;
  generatedAt: string;
  includeObservationPreview?: boolean;
  includeBacktest?: boolean;
  profileName?: SignalProfileName;
};

export type BuildLiveEventSignalConsoleInput = BuildEventSignalConsoleInput & {
  fetcher?: OHLCVFetcher;
  liveMarketDataFetcher?: LiveMarketDataFetcher;
  provider?: LiveMarketDataSource;
};

export function buildFixtureEventSignalConsole(input: BuildEventSignalConsoleInput): EventSignalConsoleResponse {
  const fixture = findResearchSignalFixture(input.symbol, input.horizon);
  if (!fixture) {
    const emptySignal = buildResearchSignal({
      symbol: input.symbol,
      horizon: input.horizon,
      generatedAt: input.generatedAt,
      candles: [],
      sourceMode: "fixture",
      source: "fixture",
      isFixtureBacked: true,
      ...(input.profileName ? { profileName: input.profileName } : {})
    });
    return buildConsoleResponse({
      signal: emptySignal,
      candles: [],
      generatedAt: input.generatedAt,
      currentPrice: null,
      dataProvenance: fixtureDataProvenance(input.symbol, input.generatedAt, 0, null),
      providerHealth: fixtureProviderHealth(input.generatedAt, 0, null),
      includeObservationPreview: input.includeObservationPreview ?? input.includeBacktest ?? false
    });
  }

  const candles = rebaseFixtureCandles(fixture.candles, input.generatedAt);
  const signal = buildResearchSignal({
    symbol: fixture.symbol,
    horizon: fixture.horizon,
    candles,
    context: fixture.context,
    generatedAt: input.generatedAt,
    sourceMode: "fixture",
    source: "fixture",
    isFixtureBacked: true,
    ...(input.profileName ? { profileName: input.profileName } : {})
  });
  return buildConsoleResponse({
    signal,
    candles,
    generatedAt: input.generatedAt,
    currentPrice: candles.at(-1)?.close ?? null,
    dataProvenance: fixtureDataProvenance(input.symbol, input.generatedAt, candles.length, candles.at(-1)?.timestamp ?? null),
    providerHealth: fixtureProviderHealth(input.generatedAt, candles.length, candles.at(-1)?.timestamp ?? null),
    includeObservationPreview: input.includeObservationPreview ?? input.includeBacktest ?? false
  });
}

export async function buildLiveEventSignalConsole(
  input: BuildLiveEventSignalConsoleInput
): Promise<EventSignalConsoleResponse> {
  if (input.liveMarketDataFetcher || !input.fetcher) {
    return buildLiveEventSignalConsoleFromMarketData(input);
  }

  const fetcher = input.fetcher ?? fetchBinanceSpotCandles;
  const request: OHLCVFetchRequest = {
    symbol: input.symbol,
    interval: "1m",
    lookback: CONSOLE_CANDLE_LOOKBACK,
    sourceMode: "live",
    requestedAt: input.generatedAt
  };
  let result: OHLCVFetchResult;
  try {
    result = await fetcher(request);
  } catch (error) {
      result = emptyFailClosedBinanceOHLCVResult(
        request,
        input.generatedAt,
      error instanceof Error ? error.message : "OHLCV adapter threw an unknown error."
    );
  }
  const signal = buildResearchSignal({
    symbol: input.symbol,
    horizon: input.horizon,
    generatedAt: input.generatedAt,
    candles: result.candles,
    source: result.source,
    sourceType: result.sourceType,
    sourceMode: "live",
    freshness: result.freshness,
    sourceWarnings: result.warnings,
    sourceFailClosedReasons: result.failClosedReasons,
    isLive: result.isLive,
    isFixtureBacked: false,
    ...(input.profileName ? { profileName: input.profileName } : {})
  });
  return buildConsoleResponse({
    signal,
    candles: result.candles,
    generatedAt: input.generatedAt,
    currentPrice: result.candles.at(-1)?.close ?? null,
    dataProvenance: ohlcvDataProvenance(result, input.generatedAt),
    providerHealth: ohlcvProviderHealth(result, input.generatedAt, CONSOLE_CANDLE_LOOKBACK),
    includeObservationPreview: input.includeObservationPreview ?? input.includeBacktest ?? false
  });
}

async function buildLiveEventSignalConsoleFromMarketData(
  input: BuildLiveEventSignalConsoleInput
): Promise<EventSignalConsoleResponse> {
  const provider = input.provider ?? "binance-spot-public";
  const liveMarketDataFetcher =
    input.liveMarketDataFetcher ??
    (provider === "coinbase-exchange" ? fetchCoinbaseExchangeMarketData : fetchBinanceSpotMarketData);
  try {
    const marketData = await liveMarketDataFetcher({
      symbol: input.symbol,
      interval: "1m",
      lookback: CONSOLE_CANDLE_LOOKBACK,
      sourceMode: "live",
      provider,
      requestedAt: input.generatedAt
    });
    const signal = buildResearchSignal({
      symbol: input.symbol,
      horizon: input.horizon,
      generatedAt: input.generatedAt,
      candles: marketData.candles,
      source: ohlcvSourceForProvider(marketData.provider),
      sourceType: marketData.sourceType,
      sourceMode: "live",
      sourceWarnings: marketData.warnings,
      sourceFailClosedReasons: marketData.failClosedReasons,
      isLive: marketData.isLive,
      isFixtureBacked: false,
      ...(input.profileName ? { profileName: input.profileName } : {})
    });
    return buildConsoleResponse({
      signal,
      candles: marketData.candles,
      generatedAt: input.generatedAt,
      currentPrice: marketData.latestPrice,
      dataProvenance: liveMarketDataProvenance(marketData),
      providerHealth: marketData.providerHealth,
      includeObservationPreview: input.includeObservationPreview ?? input.includeBacktest ?? false
    });
  } catch (error) {
    const reason =
      error instanceof Error
        ? `Live data unavailable: ${provider} market-data adapter failed: ${error.message}`
        : `Live data unavailable: ${provider} market-data adapter failed with an unknown error.`;
    const request: OHLCVFetchRequest = {
      symbol: input.symbol,
      interval: "1m",
      lookback: CONSOLE_CANDLE_LOOKBACK,
      sourceMode: "live",
      requestedAt: input.generatedAt
    };
    const result = emptyFailClosedOHLCVForProvider(provider, request, input.generatedAt, reason);
    const signal = buildResearchSignal({
      symbol: input.symbol,
      horizon: input.horizon,
      generatedAt: input.generatedAt,
      candles: result.candles,
      source: result.source,
      sourceType: result.sourceType,
      sourceMode: "live",
      freshness: result.freshness,
      sourceWarnings: result.warnings,
      sourceFailClosedReasons: result.failClosedReasons,
      isLive: true,
      isFixtureBacked: false,
      ...(input.profileName ? { profileName: input.profileName } : {})
    });
    return buildConsoleResponse({
      signal,
      candles: result.candles,
      generatedAt: input.generatedAt,
      currentPrice: null,
      dataProvenance: ohlcvDataProvenance(result, input.generatedAt),
      providerHealth: ohlcvProviderHealth(result, input.generatedAt, CONSOLE_CANDLE_LOOKBACK),
      includeObservationPreview: input.includeObservationPreview ?? input.includeBacktest ?? false
    });
  }
}

function fixtureDataProvenance(
  symbol: SignalSymbol,
  fetchedAt: string,
  candleCount: number,
  lastCandleTime: string | null
): MarketDataProvenance {
  return {
    source: "fixture",
    sourceType: "fixture",
    provider: "fixture",
    productId: null,
    displaySymbol: `${symbol}-fixture`,
    sourceMode: "fixture",
    isLive: false,
    isMock: false,
    isFixtureBacked: true,
    fetchedAt,
    candleInterval: "1m",
    candleGranularity: 60,
    candleCount,
    lastCandleTime
  };
}

function liveMarketDataProvenance(marketData: LiveMarketDataResponse): MarketDataProvenance {
  return {
    source: marketData.source,
    sourceType: marketData.sourceType,
    provider: marketData.provider,
    productId: marketData.productId,
    displaySymbol: marketData.displaySymbol,
    sourceMode: "live",
    isLive: marketData.isLive,
    isMock: marketData.isMock,
    isFixtureBacked: marketData.isFixtureBacked,
    fetchedAt: marketData.fetchedAt,
    candleInterval: marketData.candleInterval,
    candleGranularity: marketData.candleGranularity,
    candleCount: marketData.candleCount,
    lastCandleTime: marketData.lastCandleTime
  };
}

function ohlcvDataProvenance(result: OHLCVFetchResult, fetchedAt: string): MarketDataProvenance {
  return {
    source: result.provider,
    sourceType: result.sourceType,
    provider: result.provider,
    productId: result.productId,
    displaySymbol: result.displaySymbol,
    sourceMode: result.isFixtureBacked ? "fixture" : "live",
    isLive: result.isLive,
    isMock: result.isMock,
    isFixtureBacked: result.isFixtureBacked,
    fetchedAt,
    candleInterval: result.candles.at(-1)?.interval ?? "1m",
    candleGranularity: result.candleGranularity,
    candleCount: result.candleCount,
    lastCandleTime: result.lastCandleTime
  };
}

function fixtureProviderHealth(
  checkedAt: string,
  candleCount: number,
  lastCandleTime: string | null
): ProviderHealth {
  return {
    requestedProvider: "mock",
    resolvedProvider: "mock",
    sourceType: "fixture",
    status: candleCount > 0 ? "ok" : "failed",
    latencyMs: null,
    candleCount,
    expectedMinCandles: CONSOLE_CANDLE_LOOKBACK,
    lastCandleTime,
    isFixtureBacked: true,
    fallbackUsed: false,
    fallbackReason: null,
    failClosedReasons: candleCount > 0 ? [] : ["Fixture candles unavailable for requested signal console scope."],
    checkedAt
  };
}

function ohlcvProviderHealth(
  result: OHLCVFetchResult,
  checkedAt: string,
  expectedMinCandles: number
): ProviderHealth {
  const failed = result.failClosedReasons.length > 0 || result.candleCount === 0;
  return {
    requestedProvider: result.provider === "coinbase-exchange" ? "coinbase" : "binance",
    resolvedProvider: result.provider,
    sourceType: result.sourceType,
    status: failed ? "failed" : result.candleCount < expectedMinCandles ? "degraded" : "ok",
    latencyMs: null,
    candleCount: result.candleCount,
    expectedMinCandles,
    lastCandleTime: result.lastCandleTime,
    isFixtureBacked: result.isFixtureBacked,
    fallbackUsed: false,
    fallbackReason: null,
    failClosedReasons: result.failClosedReasons,
    checkedAt
  };
}

function buildConsoleResponse(input: {
  signal: ResearchSignal;
  candles: OhlcvCandle[];
  generatedAt: string;
  currentPrice: number | null;
  dataProvenance: MarketDataProvenance;
  providerHealth: ProviderHealth;
  includeObservationPreview: boolean;
}): EventSignalConsoleResponse {
  const recentCandles = input.candles.slice(-RECENT_CANDLE_LIMIT);
  const eventWindow = buildEventWindow(input.signal, input.candles, input.currentPrice, input.dataProvenance);
  const recentMarkers = buildRecentSignalMarkers({
    signal: input.signal,
    candles: input.candles,
    maxMarkers: RECENT_MARKER_LIMIT
  });
  const observationPreview = input.includeObservationPreview
    ? runObservationPreview(input.signal, input.candles)
    : disabledObservationPreview();
  const backtestPreview = toLegacyBacktestPreview(observationPreview);
  const warnings = unique([
    ...input.signal.dataQuality.warnings,
    ...input.signal.confluence.vetoReasons,
    ...input.signal.failClosedReasons,
    ...eventWindow.warnings,
    "Research only. Not trade advice. No auto trading."
  ]);

  return {
    meta: {
      contractVersion: API_CONTRACT_VERSION,
      responseKind: "event_signal_console",
      generatedAt: input.generatedAt,
      status: "ok",
      source: "research_signal_engine",
      mode: input.signal.sourceMode,
      sourceName: input.signal.source,
      sourceType: input.dataProvenance.sourceType,
      isFixtureBacked: input.dataProvenance.isFixtureBacked,
      isReadOnly: true,
      isResearchOnly: true,
      isTradeAdvice: false,
      modelVersion: RESEARCH_SIGNAL_MODEL_VERSION,
      message:
        "Event Signal Console is read-only research output. It emits LONG bias, SHORT bias, or NO_SIGNAL only; it is not trade advice and does not automate orders."
    },
    profileName: input.signal.profileName,
    symbol: input.signal.symbol,
    horizon: input.signal.horizon,
    sourceMode: input.signal.sourceMode,
    dataProvenance: input.dataProvenance,
    providerHealth: input.providerHealth,
    eventWindow,
    observationCandidate: buildObservationCandidate(input.signal, eventWindow, input.generatedAt),
    currentSignal: input.signal,
    confluence: input.signal.confluence,
    riskFilters: input.signal.riskFilters,
    recentCandles,
    recentMarkers,
    observationPreview,
    backtestPreview,
    warnings
  };
}

function buildRecentSignalMarkers(input: {
  signal: ResearchSignal;
  candles: OhlcvCandle[];
  maxMarkers: number;
}): SignalMarker[] {
  const markers: SignalMarker[] = [];
  const lastStart = input.candles.length - REQUIRED_CANDLE_COUNT;
  const firstStart = Math.max(0, lastStart - 36);
  for (let startIndex = firstStart; startIndex <= lastStart; startIndex += 1) {
    const window = input.candles.slice(startIndex, startIndex + REQUIRED_CANDLE_COUNT);
    const marker = markerFromWindow({
      window,
      symbol: input.signal.symbol,
      horizon: input.signal.horizon,
      context: input.signal.context,
      source: input.signal.source,
      sourceType: input.signal.sourceType,
      sourceMode: input.signal.sourceMode,
      isLive: input.signal.dataQuality.isLive,
      isFixtureBacked: input.signal.dataQuality.isFixtureBacked,
      profileName: input.signal.profileName
    });
    if (marker && marker.direction !== "NO_SIGNAL") {
      markers.push(marker);
    }
  }

  return markers.slice(-input.maxMarkers);
}

function markerFromWindow(input: {
  window: OhlcvCandle[];
  symbol: SignalSymbol;
  horizon: SignalHorizon;
  context: SignalContextSnapshot;
  source: OhlcvSource;
  sourceType: "live" | "mock" | "fixture";
  sourceMode: ResearchSignalSourceMode;
  isLive: boolean;
  isFixtureBacked: boolean;
  profileName: SignalProfileName;
}): SignalMarker | undefined {
  const latest = input.window.at(-1);
  if (!latest || input.window.length < REQUIRED_CANDLE_COUNT) {
    return undefined;
  }
  const generatedAt = new Date(Date.parse(latest.timestamp) + 60_000).toISOString();
  const signal = buildResearchSignal({
    symbol: input.symbol,
    horizon: input.horizon,
    candles: input.window,
    context: input.context,
    generatedAt,
    source: input.source,
    sourceType: input.sourceType,
    sourceMode: input.sourceMode,
    isLive: input.isLive,
    isFixtureBacked: input.isFixtureBacked,
    profileName: input.profileName
  });
  return {
    time: latest.timestamp,
    price: latest.close,
    direction: signal.direction,
    score: signal.score,
    confidence: signal.confidence,
    reasonSummary: signal.confluence.vetoReasons[0] ?? signal.confluence.reasons[0] ?? signal.reasons[0] ?? "Confluence evaluated.",
    isRecentOnly: true,
    markerType: "signal"
  };
}

function runObservationPreview(signal: ResearchSignal, candles: OhlcvCandle[]): ObservationPreview {
  const horizonSteps = signal.horizon === "5m" ? 5 : 10;
  const records: boolean[] = [];
  for (let endIndex = REQUIRED_CANDLE_COUNT - 1; endIndex + horizonSteps < candles.length; endIndex += 1) {
    const window = candles.slice(endIndex - REQUIRED_CANDLE_COUNT + 1, endIndex + 1);
    const latest = window.at(-1);
    const future = candles[endIndex + horizonSteps];
    if (!latest || !future) {
      continue;
    }
    const features = buildFeatureSnapshot(window);
    const generatedAt = new Date(Date.parse(latest.timestamp) + 60_000).toISOString();
    const evaluation = evaluateConfluence({
      horizon: signal.horizon,
      features,
      dataQuality: {
        ...signal.dataQuality,
        status: "ok",
        candleCount: window.length,
        freshnessAgeMs: 60_000,
        freshness: {
          status: "fresh",
          latestStartTime: latest.timestamp,
          latestClosedAt: generatedAt,
          ageMs: 0,
          maxAgeMs: 180_000
        },
        warnings: []
      },
      context: signal.context,
      failClosedReasons: signal.context.marketEventRiskFlag
        ? ["Context veto: manual event-risk flag is active."]
        : [],
      profileName: signal.profileName
    });
    const direction = evaluation.confluence.direction;
    if (direction === "NO_SIGNAL") {
      continue;
    }
    const rawMove = latest.close === 0 ? 0 : (future.close - latest.close) / latest.close;
    records.push(direction === "LONG" ? rawMove > 0 : rawMove < 0);
  }

  if (records.length === 0) {
    return {
      enabled: true,
      status: "insufficient",
      sampleSize: 0,
      directionalMatchRate: null,
      pendingCount: 0,
      invalidatedCount: 0,
      caveats: observationPreviewCaveats()
    };
  }

  return {
    enabled: true,
    status: "ready",
    sampleSize: records.length,
    directionalMatchRate: round(records.filter(Boolean).length / records.length),
    pendingCount: 0,
    invalidatedCount: 0,
    caveats: observationPreviewCaveats()
  };
}

function disabledObservationPreview(): ObservationPreview {
  return {
    enabled: false,
    status: "not_loaded",
    sampleSize: 0,
    directionalMatchRate: null,
    pendingCount: 0,
    invalidatedCount: 0,
    caveats: [
      "Observation Preview is collapsed by default and loads only after user action.",
      "Local directional check only; not a backtest, not trading performance, and not a predictive guarantee."
    ]
  };
}

function observationPreviewCaveats(): string[] {
  return [
    "Small local candle sample only; not predictive guarantee.",
    "Close-to-close directional check only; not event-contract settlement.",
    "Local observation only; not trading performance and not investment advice."
  ];
}

function toLegacyBacktestPreview(preview: ObservationPreview): BacktestPreview {
  return {
    enabled: preview.enabled,
    status: preview.status,
    sampleSize: preview.sampleSize,
    winRate: preview.directionalMatchRate,
    averageReturn: null,
    maxDrawdownProxy: null,
    caveats: preview.caveats
  };
}

function buildEventWindow(
  signal: ResearchSignal,
  candles: OhlcvCandle[],
  currentPrice: number | null,
  dataProvenance: MarketDataProvenance
): EventWindow {
  const latest = candles.at(-1);
  const horizonMs = signal.horizon === "5m" ? 5 * 60_000 : 10 * 60_000;
  if (!latest) {
    return {
      horizon: signal.horizon,
      provider: dataProvenance.provider,
      displaySymbol: dataProvenance.displaySymbol,
      expectedResolveAt: null,
      windowStart: null,
      windowEnd: null,
      referencePrice: null,
      currentPrice,
      distanceFromReferencePct: null,
      canObserve: false,
      referencePriceSource: "unavailable",
      isReferenceApproximation: true,
      warnings: ["Reference price unavailable; observation window cannot be evaluated."]
    };
  }
  const expectedResolveAt = new Date(Date.parse(latest.timestamp) + horizonMs).toISOString();
  const effectiveCurrentPrice = currentPrice ?? (signal.sourceMode === "fixture" ? latest.close : null);
  const distanceFromReferencePct =
    latest.close === 0 || effectiveCurrentPrice === null
      ? null
      : Number((((effectiveCurrentPrice - latest.close) / latest.close) * 100).toFixed(4));
  return {
    horizon: signal.horizon,
    provider: dataProvenance.provider,
    displaySymbol: dataProvenance.displaySymbol,
    expectedResolveAt,
    windowStart: latest.timestamp,
    windowEnd: expectedResolveAt,
    referencePrice: latest.close,
    currentPrice: effectiveCurrentPrice,
    distanceFromReferencePct,
    canObserve: signal.dataQuality.status === "ok",
    referencePriceSource: "latest_closed_candle",
    isReferenceApproximation: true,
    warnings: [
      signal.sourceMode === "live"
        ? "Reference price uses the latest closed candle close; current price uses latest public ticker when available."
        : "Reference price uses the latest closed candle close; this is an approximation, not official event-contract settlement."
    ]
  };
}

function buildObservationCandidate(
  signal: ResearchSignal,
  eventWindow: EventWindow,
  generatedAt: string
): SignalObservationCandidate {
  return {
    createdAt: generatedAt,
    symbol: signal.symbol,
    horizon: signal.horizon,
    sourceMode: signal.sourceMode,
    direction: signal.direction,
    score: signal.score,
    confidence: signal.confidence,
    profileName: signal.profileName,
    entryPrice: eventWindow.referencePrice,
    entryCandleTime: eventWindow.windowStart,
    expectedResolveAt: eventWindow.expectedResolveAt,
    reasonSummary: signal.confluence.vetoReasons[0] ?? signal.confluence.reasons[0] ?? "Confluence evaluated.",
    caveats: [
      "Local observation only, not trading performance.",
      "Resolution uses close-to-close direction over the selected event window.",
      ...(eventWindow.isReferenceApproximation ? eventWindow.warnings : [])
    ],
    canObserve: eventWindow.canObserve
  };
}

function emptyFailClosedOHLCVForProvider(
  provider: LiveMarketDataSource,
  request: OHLCVFetchRequest,
  fetchedAt: string,
  reason: string
): OHLCVFetchResult {
  return provider === "coinbase-exchange"
    ? emptyFailClosedOHLCVResult(request, fetchedAt, reason)
    : emptyFailClosedBinanceOHLCVResult(request, fetchedAt, reason);
}

function ohlcvSourceForProvider(provider: LiveMarketDataSource): OhlcvSource {
  return provider === "coinbase-exchange" ? "coinbase_exchange" : "binance_spot_public";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
