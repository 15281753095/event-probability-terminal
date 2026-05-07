import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  BoundEventMarket,
  Candle,
  DataSourceType,
  EventMarketOdds,
  ProviderHealth,
  ReplaySignal,
  ReplayTradeLikeResult,
  SignalMarker,
  SignalReplayResponse,
  SignalSymbol
} from "@ept/shared-types";
import { evaluateFairValueMarket } from "../fair-value/edge.js";
import { evaluateMarketEligibility } from "../fair-value/market-eligibility.js";
import { fetchBinanceHistoricalKlines } from "../ohlcv/binance-history.js";
import { binanceSpotIntervalSeconds } from "../ohlcv/binance-spot.js";
import { bindMarketToUnderlying } from "../polymarket/market-mapper.js";
import { fetchClosedPolymarketMarkets, findCryptoEventMarkets, type ClosedPolymarketMarket } from "../polymarket/gamma.js";
import { fetchPolymarketPriceHistory, priceAtOrBeforeHistory } from "../polymarket/price-history.js";
import { buildReplayTradeLikeResult, labelReplayOutcome } from "./outcome-labeler.js";
import { computeReplayMetrics } from "./metrics.js";
import type { MockReplayFixture, RunSignalReplayInput } from "./types.js";
import { intervalMsForReplay, resolveReplayWindow } from "./window.js";

const btcFixtureUrl = new URL("../../fixtures/replay/mock-replay-btc-1w.json", import.meta.url);
const ethFixtureUrl = new URL("../../fixtures/replay/mock-replay-eth-1w.json", import.meta.url);
const FAIR_VALUE_STRATEGY_ID = "fair-value-v1";

export async function runSignalReplay(input: RunSignalReplayInput): Promise<SignalReplayResponse> {
  const checkedAt = input.now?.() ?? new Date().toISOString();
  const interval = input.interval ?? "1m";
  if (input.strategyId && input.strategyId !== FAIR_VALUE_STRATEGY_ID) {
    throw new Error("Signal replay currently supports strategy=fair-value-v1 only.");
  }
  if (input.useMock) {
    return runMockSignalReplay(input, checkedAt);
  }

  const window = resolveReplayWindow(input.window, checkedAt);
  const symbols = symbolsFor(input.symbol);
  const warnings: string[] = [
    "Research only. Not trading advice. No auto execution.",
    "Theoretical PnL is a replay assumption, not actual trading profit."
  ];
  const results: ReplayTradeLikeResult[] = [];
  const providerHealths: ProviderHealth[] = [];

  for (const symbol of symbols) {
    const prewarmMs = Math.max(120 * intervalMsForReplay(interval), 2 * 60 * 60 * 1000);
    const candleResult = await fetchBinanceHistoricalKlines({
      symbol,
      interval,
      lookback: window.id,
      startTime: new Date(Date.parse(window.startTime) - prewarmMs).toISOString(),
      endTime: window.endTime,
      requestedAt: checkedAt
    }, {
      fetcher: input.fetcher,
      timeoutMs: input.timeoutMs
    });
    warnings.push(...candleResult.warnings, ...candleResult.failClosedReasons);
    providerHealths.push(candleResult.providerHealth);
    const replayCandles = candleResult.candles;
    const latestPrice = priceAtOrBefore(replayCandles, window.endTime);

    const [activeMarkets, closedMarkets] = await Promise.all([
      findCryptoEventMarkets({
        symbol,
        limit: 20,
        now: () => checkedAt,
        realtimeUnderlyingPrice: { [symbol]: latestPrice },
        ...(input.fetcher ? { fetcher: input.fetcher } : {}),
        ...(input.gammaBaseUrl ? { gammaBaseUrl: input.gammaBaseUrl } : {}),
        ...(input.clobBaseUrl ? { clobBaseUrl: input.clobBaseUrl } : {}),
        ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
        useMock: false
      }).catch((error) => {
        warnings.push(error instanceof Error ? `Polymarket active market replay fetch failed: ${error.message}` : "Polymarket active market replay fetch failed.");
        return null;
      }),
      fetchClosedPolymarketMarkets({
        symbol,
        limit: 80,
        startTime: window.startTime,
        endTime: window.endTime,
        ...(input.fetcher ? { fetcher: input.fetcher } : {}),
        ...(input.gammaBaseUrl ? { gammaBaseUrl: input.gammaBaseUrl } : {}),
        ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {})
      }).catch((error) => {
        warnings.push(error instanceof Error ? `Polymarket closed market replay fetch failed: ${error.message}` : "Polymarket closed market replay fetch failed.");
        return [];
      })
    ]);

    if (activeMarkets) {
      providerHealths.push(activeMarkets.providerHealth);
      warnings.push(...activeMarkets.warnings, ...activeMarkets.failClosedReasons);
      for (const market of activeMarkets.markets) {
        results.push(buildReplayResultFromBoundMarket({
          market,
          signalTime: window.endTime,
          candles: replayCandles,
          now: checkedAt
        }));
      }
    }

    for (const closedMarket of closedMarkets) {
      const result = await buildClosedMarketReplayResult({
        closedMarket,
        candles: replayCandles,
        signalWindowStart: window.startTime,
        signalWindowEnd: window.endTime,
        intervalMs: intervalMsForReplay(interval),
        checkedAt,
        fetcher: input.fetcher,
        clobBaseUrl: input.clobBaseUrl,
        timeoutMs: input.timeoutMs
      });
      warnings.push(...result.warnings);
      if (result.providerHealth) {
        providerHealths.push(result.providerHealth);
      }
      results.push(result.result);
    }
  }

  const visibleResults = results.filter((result) => Date.parse(result.signal.signalTime) >= Date.parse(window.startTime));
  if (visibleResults.length === 0) {
    warnings.push("No eligible markets or replayable signals were found in the selected window.");
  }
  const metrics = computeReplayMetrics({
    symbol: input.symbol,
    window,
    results: visibleResults,
    checkedAt,
    warnings
  });
  return {
    symbol: input.symbol,
    window,
    checkedAt,
    sourceType: "live",
    providerHealth: combineProviderHealth(providerHealths, checkedAt, "live"),
    metrics,
    signals: visibleResults.map((result) => result.signal),
    results: visibleResults,
    markers: visibleResults.map(toSignalMarker),
    warnings: unique([...warnings, ...metrics.warnings]),
    isResearchOnly: true
  };
}

function runMockSignalReplay(input: RunSignalReplayInput, checkedAt: string): SignalReplayResponse {
  const fixtures = symbolsFor(input.symbol).map(loadMockReplayFixture);
  const resolvedWindow = typeof input.window === "string"
    ? resolveReplayWindow(input.window, fixtures[0]?.checkedAt ?? checkedAt)
    : resolveReplayWindow(input.window);
  const results = fixtures.flatMap((fixture) =>
    fixture.results.filter((result) => inWindow(result.signal.signalTime, resolvedWindow.startTime, resolvedWindow.endTime))
  );
  const warnings = unique([
    "DEV ONLY deterministic mock replay fixture. Not live performance.",
    "Research only. Not trading advice. No auto execution.",
    ...fixtures.flatMap((fixture) => fixture.warnings)
  ]);
  const metrics = computeReplayMetrics({
    symbol: input.symbol,
    window: resolvedWindow,
    results,
    checkedAt: fixtures[0]?.checkedAt ?? checkedAt,
    warnings
  });
  const responseCheckedAt = fixtures[0]?.checkedAt ?? checkedAt;
  return {
    symbol: input.symbol,
    window: resolvedWindow,
    checkedAt: responseCheckedAt,
    sourceType: "mock",
    providerHealth: combineProviderHealth([], responseCheckedAt, "mock"),
    metrics,
    signals: results.map((result) => result.signal),
    results,
    markers: results.map(toSignalMarker),
    warnings: unique([...warnings, ...metrics.warnings]),
    isResearchOnly: true
  };
}

function buildReplayResultFromBoundMarket(input: {
  market: BoundEventMarket;
  signalTime: string;
  candles: Candle[];
  now: string;
}): ReplayTradeLikeResult {
  const signal = evaluateMarketToReplaySignal(input.market, input.signalTime, input.candles);
  const eligibility = evaluateMarketEligibility(input.market, { now: input.signalTime });
  const outcome = labelReplayOutcome({
    signal,
    market: input.market.market,
    eligibility,
    historicalCandles: input.candles,
    now: input.now
  });
  return buildReplayTradeLikeResult({
    signal,
    outcome,
    marketNoPrice: input.market.odds.noMidpoint ?? input.market.odds.noPrice
  });
}

async function buildClosedMarketReplayResult(input: {
  closedMarket: ClosedPolymarketMarket;
  candles: Candle[];
  signalWindowStart: string;
  signalWindowEnd: string;
  intervalMs: number;
  checkedAt: string;
  fetcher?: RunSignalReplayInput["fetcher"];
  clobBaseUrl?: string | undefined;
  timeoutMs?: number | undefined;
}): Promise<{ result: ReplayTradeLikeResult; warnings: string[]; providerHealth?: ProviderHealth | undefined }> {
  const warnings: string[] = [];
  const candidate = input.closedMarket.candidate;
  const expiryTime = candidate.endDate ?? input.signalWindowEnd;
  const expiryMs = Date.parse(expiryTime);
  const signalMs = Number.isFinite(expiryMs)
    ? Math.max(Date.parse(input.signalWindowStart), expiryMs - Math.max(5 * 60_000, input.intervalMs))
    : Date.parse(input.signalWindowStart);
  const signalTime = new Date(Math.min(signalMs, Date.parse(input.signalWindowEnd))).toISOString();
  const tokenIdYes = candidate.clobTokenIds[0] ?? null;
  const priceHistory = await fetchPolymarketPriceHistory({
    tokenId: tokenIdYes,
    startTs: Math.floor(Date.parse(input.signalWindowStart) / 1000),
    endTs: Math.floor(Date.parse(signalTime) / 1000),
    requestedAt: input.checkedAt
  }, {
    fetcher: input.fetcher,
    clobBaseUrl: input.clobBaseUrl,
    timeoutMs: input.timeoutMs
  });
  warnings.push(...priceHistory.warnings, ...priceHistory.failClosedReasons);
  const yesAtSignal = priceAtOrBeforeHistory(priceHistory.history, signalTime);
  const odds = oddsFromHistoricalPrice(candidate, yesAtSignal, priceHistory.failClosedReasons, signalTime);
  if (yesAtSignal !== null) {
    warnings.push("Polymarket historical price was used only at or before signalTime; future prices are not used for entry signal generation.");
    warnings.push("Historical spread is unavailable from prices-history, so eligibility may reject instead of inferring liquidity.");
  }
  const market = bindMarketToUnderlying({
    candidate,
    odds,
    realtimeUnderlyingPrice: {
      [inferSignalSymbol(candidate.question, candidate.slug)]: priceAtOrBefore(input.candles, signalTime)
    }
  });
  const signal = evaluateMarketToReplaySignal(market, signalTime, input.candles);
  const eligibility = evaluateMarketEligibility(market, { now: signalTime });
  const outcome = labelReplayOutcome({
    signal,
    market: candidate,
    eligibility,
    historicalCandles: input.candles,
    closedMarketData: {
      market: candidate,
      eligibility,
      resolvedOutcome: input.closedMarket.resolvedOutcome,
      outcomeSource: input.closedMarket.resolvedOutcome ? "polymarket-closed-market" : undefined,
      resolvedAt: candidate.endDate,
      resolutionNotes: input.closedMarket.resolutionNotes
    },
    now: input.checkedAt
  });
  return {
    result: buildReplayTradeLikeResult({
      signal,
      outcome,
      marketNoPrice: odds.noMidpoint ?? odds.noPrice
    }),
    warnings,
    providerHealth: priceHistory.providerHealth
  };
}

function evaluateMarketToReplaySignal(
  market: BoundEventMarket,
  signalTime: string,
  candles: Candle[]
): ReplaySignal {
  const preSignalCandles = candles
    .filter((candle) => Date.parse(candle.timestamp) <= Date.parse(signalTime))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const currentPrice = priceAtOrBefore(preSignalCandles, signalTime) ?? market.realtimeUnderlyingPrice;
  const eligibility = evaluateMarketEligibility(market, { now: signalTime });
  const expiryTime = eligibility.extracted.expiryTime ?? market.market.endDate ?? signalTime;
  const horizonSeconds = Math.max(60, Math.round((Date.parse(expiryTime) - Date.parse(signalTime)) / 1000));
  const evaluation = evaluateFairValueMarket({
    symbol: market.symbol,
    underlyingSymbol: market.underlyingSymbol,
    currentPrice,
    candles: preSignalCandles,
    market,
    odds: market.odds,
    now: signalTime,
    horizonSeconds,
    feesBps: 0,
    slippageBps: 25,
    minEdgeBps: 250,
    maxSpread: 0.08,
    minLiquidityStatus: "ok"
  });
  const edge = evaluation.marker.side === "LONG_YES"
    ? evaluation.snapshot.edgeYes
    : evaluation.marker.side === "LONG_NO"
      ? evaluation.snapshot.edgeNo
      : evaluation.marker.edge;
  return {
    id: `replay:${market.market.marketId}:${evaluation.marker.side}:${signalTime}`,
    symbol: market.symbol,
    underlyingSymbol: market.underlyingSymbol,
    marketId: market.market.marketId,
    question: market.market.question,
    signalTime,
    expiryTime,
    priceAtSignal: currentPrice ?? preSignalCandles.at(-1)?.close ?? 0,
    side: evaluation.marker.side,
    modelProbabilityYes: evaluation.snapshot.modelProbabilityYes,
    marketProbabilityYes: evaluation.snapshot.marketProbabilityYes,
    edge,
    confidence: evaluation.snapshot.confidence,
    reason: evaluation.marker.reason,
    rejectReasons: unique([...evaluation.eligibility.rejectReasons, ...evaluation.snapshot.rejectReasons]),
    assumptions: evaluation.snapshot.assumptions,
    isResearchOnly: true
  };
}

function oddsFromHistoricalPrice(
  candidate: ClosedPolymarketMarket["candidate"],
  yesPrice: number | null,
  failClosedReasons: string[],
  checkedAt: string
): EventMarketOdds {
  const noPrice = yesPrice === null ? null : round(1 - yesPrice);
  return {
    marketId: candidate.marketId,
    question: candidate.question,
    tokenIdYes: candidate.clobTokenIds[0] ?? null,
    tokenIdNo: candidate.clobTokenIds[1] ?? null,
    yesPrice,
    noPrice,
    yesMidpoint: yesPrice,
    noMidpoint: noPrice,
    spread: null,
    impliedProbabilityYes: yesPrice,
    impliedProbabilityNo: noPrice,
    liquidityStatus: "unknown",
    sourceType: "live",
    provider: "polymarket-clob-public",
    checkedAt,
    failClosedReasons: unique([
      ...failClosedReasons,
      ...(yesPrice === null ? ["No Polymarket historical YES price was available at signalTime."] : [])
    ])
  };
}

function loadMockReplayFixture(symbol: SignalSymbol): MockReplayFixture {
  const fixtureUrl = symbol === "ETH" ? ethFixtureUrl : btcFixtureUrl;
  return JSON.parse(readFileSync(fileURLToPath(fixtureUrl), "utf8")) as MockReplayFixture;
}

function symbolsFor(symbol: SignalSymbol | "ALL"): SignalSymbol[] {
  return symbol === "ALL" ? ["BTC", "ETH"] : [symbol];
}

function toSignalMarker(result: ReplayTradeLikeResult): SignalMarker {
  return {
    time: result.signal.signalTime,
    price: result.signal.priceAtSignal,
    direction: result.signal.side === "LONG_YES" ? "LONG" : result.signal.side === "LONG_NO" ? "SHORT" : "NO_SIGNAL",
    score: result.signal.edge ?? 0,
    confidence: result.signal.confidence,
    reasonSummary: `${result.signal.side} ${result.outcome.status}: ${result.signal.reason}`,
    isRecentOnly: true,
    markerType: "signal"
  };
}

function combineProviderHealth(
  healths: ProviderHealth[],
  checkedAt: string,
  sourceType: DataSourceType
): ProviderHealth {
  const failClosedReasons = unique(healths.flatMap((health) => health.failClosedReasons));
  return {
    requestedProvider: sourceType === "mock" ? "mock" : "polymarket",
    resolvedProvider: sourceType === "mock" ? "mock" : "polymarket-gamma",
    sourceType,
    status: failClosedReasons.length ? "degraded" : "ok",
    latencyMs: null,
    candleCount: healths.reduce((sum, health) => sum + health.candleCount, 0),
    expectedMinCandles: 0,
    lastCandleTime: healths.map((health) => health.lastCandleTime).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
    isFixtureBacked: false,
    fallbackUsed: false,
    fallbackReason: null,
    failClosedReasons,
    checkedAt
  };
}

function priceAtOrBefore(candles: Candle[], isoTime: string): number | null {
  const target = Date.parse(isoTime);
  const candle = [...candles]
    .filter((item) => Date.parse(item.timestamp) <= target)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
  return candle?.close ?? null;
}

function inferSignalSymbol(question: string, slug: string): SignalSymbol {
  const text = `${question} ${slug}`.toLowerCase();
  return /\b(ethereum|eth)\b/.test(text) ? "ETH" : "BTC";
}

function inWindow(value: string, startTime: string, endTime: string): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= Date.parse(startTime) && time <= Date.parse(endTime);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
