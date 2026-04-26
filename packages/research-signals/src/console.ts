import {
  API_CONTRACT_VERSION,
  type BacktestPreview,
  type EventSignalConsoleResponse,
  type OHLCVFetchRequest,
  type OHLCVFetchResult,
  type OhlcvCandle,
  type OhlcvSource,
  type ResearchSignal,
  type ResearchSignalSourceMode,
  type SignalContextSnapshot,
  type SignalHorizon,
  type SignalMarker,
  type SignalSymbol
} from "@ept/shared-types";
import { buildFeatureSnapshot } from "./indicators.js";
import {
  REQUIRED_CANDLE_COUNT,
  RESEARCH_SIGNAL_MODEL_VERSION,
  buildResearchSignal,
  buildResearchSignalFromOHLCV,
  rebaseFixtureCandles,
  type OHLCVFetcher
} from "./engine.js";
import { findResearchSignalFixture } from "./fixtures.js";
import { emptyFailClosedOHLCVResult, fetchCoinbaseExchangeCandles } from "./ohlcv/coinbase-exchange.js";
import { evaluateConfluence } from "./confluence.js";

export const CONSOLE_CANDLE_LOOKBACK = 80;
export const RECENT_CANDLE_LIMIT = 60;
export const RECENT_MARKER_LIMIT = 20;

export type BuildEventSignalConsoleInput = {
  symbol: SignalSymbol;
  horizon: SignalHorizon;
  generatedAt: string;
  includeBacktest?: boolean;
};

export type BuildLiveEventSignalConsoleInput = BuildEventSignalConsoleInput & {
  fetcher?: OHLCVFetcher;
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
      isFixtureBacked: true
    });
    return buildConsoleResponse({
      signal: emptySignal,
      candles: [],
      generatedAt: input.generatedAt,
      includeBacktest: input.includeBacktest ?? false
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
    isFixtureBacked: true
  });
  return buildConsoleResponse({
    signal,
    candles,
    generatedAt: input.generatedAt,
    includeBacktest: input.includeBacktest ?? false
  });
}

export async function buildLiveEventSignalConsole(
  input: BuildLiveEventSignalConsoleInput
): Promise<EventSignalConsoleResponse> {
  const fetcher = input.fetcher ?? fetchCoinbaseExchangeCandles;
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
    result = emptyFailClosedOHLCVResult(
      request,
      input.generatedAt,
      error instanceof Error ? error.message : "OHLCV adapter threw an unknown error."
    );
  }
  const signal = buildResearchSignalFromOHLCV({
    symbol: input.symbol,
    horizon: input.horizon,
    generatedAt: input.generatedAt,
    result
  });
  return buildConsoleResponse({
    signal,
    candles: result.candles,
    generatedAt: input.generatedAt,
    includeBacktest: input.includeBacktest ?? false
  });
}

function buildConsoleResponse(input: {
  signal: ResearchSignal;
  candles: OhlcvCandle[];
  generatedAt: string;
  includeBacktest: boolean;
}): EventSignalConsoleResponse {
  const recentCandles = input.candles.slice(-RECENT_CANDLE_LIMIT);
  const recentMarkers = buildRecentSignalMarkers({
    signal: input.signal,
    candles: input.candles,
    maxMarkers: RECENT_MARKER_LIMIT
  });
  const backtestPreview = input.includeBacktest
    ? runLightweightBacktest(input.signal, input.candles)
    : disabledBacktestPreview();
  const warnings = unique([
    ...input.signal.dataQuality.warnings,
    ...input.signal.confluence.vetoReasons,
    ...input.signal.failClosedReasons,
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
      isFixtureBacked: input.signal.sourceMode === "fixture",
      isReadOnly: true,
      isResearchOnly: true,
      isTradeAdvice: false,
      modelVersion: RESEARCH_SIGNAL_MODEL_VERSION,
      message:
        "Event Signal Console is read-only research output. It emits LONG bias, SHORT bias, or NO_SIGNAL only; it is not trade advice and does not automate orders."
    },
    symbol: input.signal.symbol,
    horizon: input.signal.horizon,
    sourceMode: input.signal.sourceMode,
    currentSignal: input.signal,
    confluence: input.signal.confluence,
    riskFilters: input.signal.riskFilters,
    recentCandles,
    recentMarkers,
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
      sourceMode: input.signal.sourceMode,
      isLive: input.signal.sourceMode === "live",
      isFixtureBacked: input.signal.sourceMode === "fixture"
    });
    if (marker && marker.direction !== "NO_SIGNAL") {
      markers.push(marker);
    }
  }

  const latest = input.candles.at(-1);
  if (latest && markers.length === 0) {
    markers.push({
      time: latest.timestamp,
      price: latest.close,
      direction: "NO_SIGNAL",
      score: input.signal.score,
      confidence: input.signal.confidence,
      reasonSummary: input.signal.confluence.vetoReasons[0] ?? input.signal.reasons[0] ?? "No recent directional confluence.",
      isRecentOnly: true
    });
  }

  return markers.slice(-input.maxMarkers);
}

function markerFromWindow(input: {
  window: OhlcvCandle[];
  symbol: SignalSymbol;
  horizon: SignalHorizon;
  context: SignalContextSnapshot;
  source: OhlcvSource;
  sourceMode: ResearchSignalSourceMode;
  isLive: boolean;
  isFixtureBacked: boolean;
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
    sourceMode: input.sourceMode,
    isLive: input.isLive,
    isFixtureBacked: input.isFixtureBacked
  });
  return {
    time: latest.timestamp,
    price: latest.close,
    direction: signal.direction,
    score: signal.score,
    confidence: signal.confidence,
    reasonSummary: signal.confluence.vetoReasons[0] ?? signal.confluence.reasons[0] ?? signal.reasons[0] ?? "Confluence evaluated.",
    isRecentOnly: true
  };
}

function runLightweightBacktest(signal: ResearchSignal, candles: OhlcvCandle[]): BacktestPreview {
  const horizonSteps = signal.horizon === "5m" ? 5 : 10;
  const records: number[] = [];
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
        : []
    });
    const direction = evaluation.confluence.direction;
    if (direction === "NO_SIGNAL") {
      continue;
    }
    const rawMove = latest.close === 0 ? 0 : (future.close - latest.close) / latest.close;
    records.push(direction === "LONG" ? rawMove : -rawMove);
  }

  if (records.length === 0) {
    return {
      enabled: true,
      status: "insufficient",
      sampleSize: 0,
      winRate: null,
      averageReturn: null,
      maxDrawdownProxy: null,
      caveats: backtestCaveats()
    };
  }

  return {
    enabled: true,
    status: "ready",
    sampleSize: records.length,
    winRate: round(records.filter((value) => value > 0).length / records.length),
    averageReturn: round(records.reduce((sum, value) => sum + value, 0) / records.length),
    maxDrawdownProxy: round(maxDrawdownProxy(records)),
    caveats: backtestCaveats()
  };
}

function disabledBacktestPreview(): BacktestPreview {
  return {
    enabled: false,
    status: "not_loaded",
    sampleSize: 0,
    winRate: null,
    averageReturn: null,
    maxDrawdownProxy: null,
    caveats: [
      "Backtest preview is disabled by default and loads only after user action.",
      "Research only; not predictive guarantee and not real trading performance."
    ]
  };
}

function backtestCaveats(): string[] {
  return [
    "Small local candle sample only; not a predictive guarantee.",
    "No fees, slippage, fills, order book queue, funding, or real event-contract settlement is modeled.",
    "Research only; not trade advice, not paper trading, and not real trading performance."
  ];
}

function maxDrawdownProxy(returns: number[]): number {
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const value of returns) {
    equity += value;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
  }
  return maxDrawdown;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
