import { readFileSync } from "node:fs";
import type {
  Candle,
  ProviderHealth,
  ShortWindowEvent,
  ShortWindowMarker,
  ShortWindowReplayResponse,
  ShortWindowReplayResult,
  ShortWindowSignal,
  ShortWindowSignalSide
} from "@ept/shared-types";
import { fetchBinanceHistoricalKlines } from "../ohlcv/binance-history.js";
import { buildCurrentShortWindowEvent } from "./window-engine.js";
import { generateShortWindowSignal } from "./signal-engine.js";
import {
  buildShortWindowRuleTemplate,
  evaluateShortWindowRuleOutcome,
  shortWindowIntervalMs
} from "./rule-templates.js";
import { computeShortWindowMetrics } from "./metrics.js";
import type {
  CombinedShortWindowProviderHealthInput,
  RunShortWindowReplayInput,
  ShortWindowFixture
} from "./types.js";

const MOCK_FIXTURE_PATHS = {
  "BTC:5m": new URL("../../fixtures/short-window/mock-btc-5m.json", import.meta.url),
  "ETH:10m": new URL("../../fixtures/short-window/mock-eth-10m.json", import.meta.url)
} as const;

export async function runShortWindowReplay(input: RunShortWindowReplayInput): Promise<ShortWindowReplayResponse> {
  if (input.useStored) {
    return runShortWindowReplay({ ...input, useStored: false });
  }
  if (input.useMock || input.venue === "mock") {
    return runMockShortWindowReplay(input);
  }

  const checkedAt = input.now?.() ?? new Date().toISOString();
  const window = resolveShortWindowMetricsWindow(input.window, checkedAt);
  const rule = buildShortWindowRuleTemplate({
    venue: input.venue,
    symbol: input.symbol,
    interval: input.interval
  });
  const warnings = [
    "Research only. Not trading advice. No automated execution.",
    "Replay uses Binance Spot public candles as a configurable proxy, not a verified venue settlement feed."
  ];
  const prewarmMs = Math.max(shortWindowIntervalMs(input.interval) * 3, 30 * 60 * 1000);
  const historical = await fetchBinanceHistoricalKlines({
    symbol: input.symbol,
    interval: "1m",
    lookback: input.window,
    startTime: new Date(Date.parse(window.startTime) - prewarmMs).toISOString(),
    endTime: window.endTime,
    requestedAt: checkedAt
  }, {
    fetcher: input.fetcher,
    timeoutMs: input.timeoutMs
  });
  warnings.push(...historical.warnings, ...historical.failClosedReasons);

  const results = historical.failClosedReasons.length
    ? []
    : replayCandles({
      candles: historical.candles,
      windowStart: window.startTime,
      windowEnd: window.endTime,
      checkedAt,
      rule
    });
  const metrics = computeShortWindowMetrics({
    symbol: input.symbol,
    interval: input.interval,
    window: input.window,
    results,
    warnings
  });

  return {
    metrics,
    signals: results.map((result) => result.signal),
    results,
    markers: results.map(toShortWindowMarker),
    warnings: unique([...warnings, ...metrics.warnings]),
    proxyBacktest: !rule.isVerifiedRule,
    sourceType: "live",
    rule,
    isResearchOnly: true
  };
}

export function replayCandles(input: {
  candles: Candle[];
  windowStart: string;
  windowEnd: string;
  checkedAt: string;
  rule: ShortWindowReplayResult["event"]["rule"];
}): ShortWindowReplayResult[] {
  const intervalMs = shortWindowIntervalMs(input.rule.interval);
  const startMs = Math.ceil(Date.parse(input.windowStart) / intervalMs) * intervalMs;
  const endMs = Date.parse(input.windowEnd);
  const results: ShortWindowReplayResult[] = [];
  for (let cursor = startMs; cursor + intervalMs <= endMs; cursor += intervalMs) {
    const eventStart = new Date(cursor).toISOString();
    const eventEnd = new Date(cursor + intervalMs).toISOString();
    const signalTime = new Date(cursor + intervalMs - 60_000).toISOString();
    const preSignalCandles = input.candles.filter((candle) => candleCloseMs(candle) <= Date.parse(signalTime));
    const currentPrice = priceAtOrBefore(preSignalCandles, signalTime);
    const event = buildCurrentShortWindowEvent({
      symbol: input.rule.symbol,
      interval: input.rule.interval,
      venue: input.rule.venue,
      now: signalTime,
      priceTicks: currentPrice === null ? [] : [syntheticTick(input.rule, signalTime, currentPrice)],
      candles: preSignalCandles,
      rule: input.rule
    });
    const signal = generateShortWindowSignal(event, {
      candles: preSignalCandles,
      priceTick: currentPrice === null ? undefined : syntheticTick(input.rule, signalTime, currentPrice),
      bid: currentPrice === null ? null : currentPrice - currentPrice * 0.00001,
      ask: currentPrice === null ? null : currentPrice + currentPrice * 0.00001,
      latencyMs: 5,
      now: signalTime,
      staleAfterMs: 3 * 60_000
    });
    results.push(resolveReplayResult({
      event: { ...event, startTime: eventStart, endTime: eventEnd },
      signal,
      candles: input.candles,
      checkedAt: input.checkedAt
    }));
  }
  return results;
}

export function resolveShortWindowMetricsWindow(window: RunShortWindowReplayInput["window"], checkedAt: string) {
  const durationMs = window === "1d"
    ? 24 * 60 * 60 * 1000
    : window === "3d"
      ? 3 * 24 * 60 * 60 * 1000
      : window === "1w"
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
  return {
    id: window,
    startTime: new Date(Date.parse(checkedAt) - durationMs).toISOString(),
    endTime: checkedAt,
    label: `Past ${window}`
  };
}

export function combineShortWindowProviderHealth(input: CombinedShortWindowProviderHealthInput): ProviderHealth {
  const failed = input.providerHealths.some((health) => health.status === "failed") || input.warnings.some((warning) => warning.includes("failed"));
  const degraded = failed || input.providerHealths.some((health) => health.status === "degraded") || input.warnings.length > 0;
  return {
    requestedProvider: input.sourceType === "mock" ? "mock" : "binance",
    resolvedProvider: input.sourceType === "mock" ? "mock" : "binance-spot-public",
    sourceType: input.sourceType === "stored" ? "live" : input.sourceType,
    status: failed ? "failed" : degraded ? "degraded" : "ok",
    latencyMs: firstFinite(input.providerHealths.map((health) => health.latencyMs)),
    candleCount: input.candleCount,
    expectedMinCandles: 1,
    lastCandleTime: firstText(input.providerHealths.map((health) => health.lastCandleTime)),
    isFixtureBacked: false,
    fallbackUsed: false,
    fallbackReason: null,
    failClosedReasons: input.warnings.filter((warning) => warning.includes("failed") || warning.includes("unavailable")),
    checkedAt: input.checkedAt
  };
}

function runMockShortWindowReplay(input: RunShortWindowReplayInput): ShortWindowReplayResponse {
  const fixture = loadShortWindowFixture(input.symbol, input.interval);
  const checkedAt = fixture.checkedAt;
  const rule = buildShortWindowRuleTemplate({
    venue: "mock",
    symbol: fixture.symbol,
    interval: fixture.interval
  });
  const results = fixture.scenarios.map((scenario) => {
    const preSignalCandles = fixture.candles.filter((candle) => candleCloseMs(candle) <= Date.parse(scenario.signalTime));
    const price = priceAtOrBefore(preSignalCandles, scenario.signalTime) ?? fixture.candles[0]?.open ?? 0;
    const event = buildCurrentShortWindowEvent({
      symbol: fixture.symbol,
      interval: fixture.interval,
      venue: "mock",
      now: scenario.signalTime,
      priceTicks: [syntheticTick(rule, scenario.signalTime, price, "mock")],
      candles: preSignalCandles,
      rule
    });
    const generated = generateShortWindowSignal(event, {
      candles: preSignalCandles,
      priceTick: syntheticTick(rule, scenario.signalTime, price, "mock"),
      bid: price - price * 0.00001,
      ask: price + price * 0.00001,
      latencyMs: 1,
      now: scenario.signalTime,
      staleAfterMs: 3 * 60_000,
      minConfidence: 0.25
    });
    const signal: ShortWindowSignal = {
      ...generated,
      side: scenario.side,
      confidence: scenario.side === "WAIT" || scenario.side === "REJECTED" ? generated.confidence : Math.max(0.42, generated.confidence),
      reasons: unique([...generated.reasons, `Deterministic mock scenario: ${scenario.note}`]),
      rejectReasons: scenario.side === "REJECTED" ? unique([...generated.rejectReasons, "MOCK_REJECTED_SCENARIO"]) : generated.rejectReasons
    };
    const resolved = resolveReplayResult({ event, signal, candles: fixture.candles, checkedAt });
    return {
      ...resolved,
      outcome: {
        ...resolved.outcome,
        status: scenario.outcomeStatus,
        countedInWinRate: scenario.outcomeStatus === "WIN" || scenario.outcomeStatus === "LOSS",
        notes: unique([...resolved.outcome.notes, scenario.note])
      }
    } satisfies ShortWindowReplayResult;
  });
  const warnings = [
    "DEV ONLY deterministic mock short-window fixture. Not live performance.",
    "Research only. Not trading advice. No automated execution."
  ];
  const metrics = computeShortWindowMetrics({
    symbol: fixture.symbol,
    interval: fixture.interval,
    window: input.window,
    results,
    warnings
  });
  return {
    metrics,
    signals: results.map((result) => result.signal),
    results,
    markers: results.map(toShortWindowMarker),
    warnings: unique([...warnings, ...metrics.warnings]),
    proxyBacktest: false,
    sourceType: "mock",
    rule,
    isResearchOnly: true
  };
}

function resolveReplayResult(input: {
  event: ShortWindowEvent;
  signal: ShortWindowSignal;
  candles: Candle[];
  checkedAt: string;
}): ShortWindowReplayResult {
  if (input.signal.side === "WAIT") {
    return baseResult(input, "WAIT", "UNKNOWN", null, null, false, ["WAIT signals are not included in win-rate denominator."]);
  }
  if (input.signal.side === "REJECTED") {
    return baseResult(input, "REJECTED", "UNKNOWN", null, null, false, ["Rejected signals are not included in win-rate denominator."]);
  }
  if (Date.parse(input.event.endTime) > Date.parse(input.checkedAt)) {
    return baseResult(input, "PENDING", "UNKNOWN", null, null, false, ["Event window has not resolved yet."]);
  }

  const outcome = evaluateShortWindowRuleOutcome({
    rule: input.event.rule,
    event: input.event,
    candles: input.candles
  });
  if (outcome.resolvedSide === "UNKNOWN" || outcome.resolvedSide === "TIE") {
    return baseResult(input, "UNRESOLVED", outcome.resolvedSide, outcome.startReferencePrice, outcome.endReferencePrice, false, outcome.notes);
  }
  const won =
    (input.signal.side === "LONG_UP" && outcome.resolvedSide === "UP") ||
    (input.signal.side === "LONG_DOWN" && outcome.resolvedSide === "DOWN");
  return baseResult(
    input,
    won ? "WIN" : "LOSS",
    outcome.resolvedSide,
    outcome.startReferencePrice,
    outcome.endReferencePrice,
    true,
    outcome.notes
  );
}

function baseResult(
  input: { event: ShortWindowEvent; signal: ShortWindowSignal },
  status: ShortWindowReplayResult["outcome"]["status"],
  resolvedSide: ShortWindowReplayResult["outcome"]["resolvedSide"],
  startReferencePrice: number | null,
  endReferencePrice: number | null,
  countedInWinRate: boolean,
  notes: string[]
): ShortWindowReplayResult {
  return {
    event: input.event,
    signal: input.signal,
    outcome: {
      status,
      resolvedSide,
      startReferencePrice,
      endReferencePrice,
      resolvedAt: status === "WIN" || status === "LOSS" || status === "UNRESOLVED" ? input.event.endTime : null,
      countedInWinRate,
      notes
    },
    isResearchOnly: true
  };
}

function loadShortWindowFixture(
  symbol: RunShortWindowReplayInput["symbol"],
  interval: RunShortWindowReplayInput["interval"]
): Omit<ShortWindowFixture, "candles"> & { candles: Candle[] } {
  const key = `${symbol}:${interval}` as keyof typeof MOCK_FIXTURE_PATHS;
  const path = MOCK_FIXTURE_PATHS[key] ?? MOCK_FIXTURE_PATHS["BTC:5m"];
  const fixture = JSON.parse(readFileSync(path, "utf8")) as ShortWindowFixture;
  return {
    ...fixture,
    candles: normalizeFixtureCandles(fixture)
  };
}

function toShortWindowMarker(result: ShortWindowReplayResult): ShortWindowMarker {
  return {
    id: result.signal.id,
    time: result.signal.signalTime,
    price: result.signal.currentPrice,
    side: result.signal.side,
    label: `${result.signal.side} ${result.outcome.status}`,
    reason: result.signal.reasons[0] ?? "Short-window research marker.",
    outcomeStatus: result.outcome.status,
    isResearchOnly: true
  };
}

function syntheticTick(
  rule: ShortWindowReplayResult["event"]["rule"],
  time: string,
  price: number,
  sourceType: "live" | "mock" = "live"
) {
  return {
    symbol: rule.underlyingSymbol,
    displaySymbol: rule.underlyingSymbol,
    provider: sourceType === "mock" ? "mock" : "binance-spot-public",
    sourceType,
    eventType: "trade",
    price,
    bidPrice: price - price * 0.00001,
    askPrice: price + price * 0.00001,
    eventTime: time,
    receivedAt: time,
    latencyMs: sourceType === "mock" ? 1 : 5,
    sequenceId: `${sourceType}-${rule.symbol}-${time}`,
    rawProviderEventType: "synthetic-replay"
  } as const;
}

function priceAtOrBefore(candles: Candle[], time: string): number | null {
  const timeMs = Date.parse(time);
  const candle = [...candles]
    .filter((item) => candleCloseMs(item) <= timeMs)
    .sort((a, b) => candleCloseMs(b) - candleCloseMs(a))[0];
  return candle ? Number(candle.close.toFixed(8)) : null;
}

function candleCloseMs(candle: Candle): number {
  return Date.parse(candle.timestamp) + candle.granularity * 1000;
}

function firstFinite(values: Array<number | null>): number | null {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value)) ?? null;
}

function firstText(values: Array<string | null>): string | null {
  return values.find((value): value is string => typeof value === "string" && value.length > 0) ?? null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeFixtureCandles(fixture: ShortWindowFixture): Candle[] {
  const granularity = fixture.interval === "5m" || fixture.interval === "10m" || fixture.interval === "15m" ? 60 : 60;
  return fixture.candles.map((candle) => ({
    source: candle.source ?? "binance_spot_public",
    sourceType: "mock",
    provider: candle.provider ?? "binance-spot-public",
    symbol: fixture.symbol,
    interval: "1m",
    granularity,
    productId: fixture.symbol === "BTC" ? "BTCUSDT" : "ETHUSDT",
    displaySymbol: fixture.symbol === "BTC" ? "BTCUSDT" : "ETHUSDT",
    openTime: candle.openTime ?? candle.timestamp,
    startTime: candle.startTime ?? candle.timestamp,
    timestamp: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    isLive: false,
    isMock: true,
    isFixtureBacked: false,
    isClosed: true
  }));
}
