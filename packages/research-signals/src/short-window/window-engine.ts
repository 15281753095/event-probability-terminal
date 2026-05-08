import type { Candle, RealTimePriceTick, ShortWindowEvent, ShortWindowEventStatus } from "@ept/shared-types";
import { shortWindowIntervalMs } from "./rule-templates.js";
import type { BuildCurrentShortWindowEventInput } from "./types.js";

const FORMING_SECONDS = 30;
const DECISION_ZONE_START_SECONDS = 120;
const NO_ENTRY_ZONE_SECONDS = 20;

export function buildCurrentShortWindowEvent(input: BuildCurrentShortWindowEventInput): ShortWindowEvent {
  const nowMs = Date.parse(input.now);
  const intervalMs = shortWindowIntervalMs(input.interval);
  const startMs = Math.floor(nowMs / intervalMs) * intervalMs;
  const endMs = startMs + intervalMs;
  const startTime = new Date(startMs).toISOString();
  const endTime = new Date(endMs).toISOString();
  const secondsRemaining = Math.max(0, Math.ceil((endMs - nowMs) / 1000));
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const startReferencePrice = resolveStartReferencePrice({
    candles: input.candles ?? [],
    priceTicks: input.priceTicks ?? [],
    startTime,
    now: input.now,
    rule: input.rule
  });
  const currentPrice = resolveCurrentPrice(input.priceTicks ?? [], input.candles ?? [], input.now);
  const distanceFromStart =
    startReferencePrice !== null && currentPrice !== null ? roundPrice(currentPrice - startReferencePrice) : null;
  const distanceBps =
    startReferencePrice !== null && currentPrice !== null && startReferencePrice !== 0
      ? roundBps(((currentPrice - startReferencePrice) / startReferencePrice) * 10_000)
      : null;
  const status = eventStatus({
    nowMs,
    startMs,
    endMs,
    secondsRemaining,
    elapsedSeconds,
    hasStartReference: startReferencePrice !== null
  });
  const sourceType = resolveSourceType(input.priceTicks ?? [], input.candles ?? [], input.venue);

  return {
    id: `${input.venue}:${input.symbol}:${input.interval}:${startTime}`,
    venue: input.venue,
    symbol: input.symbol,
    interval: input.interval,
    startTime,
    endTime,
    status,
    startReferencePrice,
    currentPrice,
    distanceFromStart,
    distanceBps,
    secondsRemaining,
    rule: input.rule,
    sourceType,
    isResearchOnly: true
  };
}

export function resolveShortWindowPhase(input: {
  now: string;
  startTime: string;
  endTime: string;
  hasStartReference?: boolean | undefined;
}): ShortWindowEventStatus {
  const nowMs = Date.parse(input.now);
  const startMs = Date.parse(input.startTime);
  const endMs = Date.parse(input.endTime);
  return eventStatus({
    nowMs,
    startMs,
    endMs,
    secondsRemaining: Math.max(0, Math.ceil((endMs - nowMs) / 1000)),
    elapsedSeconds: Math.max(0, Math.floor((nowMs - startMs) / 1000)),
    hasStartReference: input.hasStartReference ?? true
  });
}

export function resolveStartReferencePrice(input: {
  candles: Candle[];
  priceTicks: RealTimePriceTick[];
  startTime: string;
  now: string;
  rule: BuildCurrentShortWindowEventInput["rule"];
}): number | null {
  if (input.rule.ruleType === "UNKNOWN_MANUAL_REFERENCE") {
    return null;
  }
  if (input.rule.ruleType === "END_AVG_GTE_START_AVG") {
    return averageReference(input.candles, input.priceTicks, input.startTime, input.rule.startAverageSeconds ?? 60, input.now);
  }
  const startMs = Date.parse(input.startTime);
  const nowMs = Date.parse(input.now);
  const firstTick = [...input.priceTicks]
    .filter((tick) => tickMs(tick) >= startMs && tickMs(tick) <= nowMs && Number.isFinite(tick.price))
    .sort((a, b) => tickMs(a) - tickMs(b))[0];
  if (firstTick) {
    return roundPrice(firstTick.price);
  }
  const exactOrFirstCandle = [...input.candles]
    .filter((candle) => Date.parse(candle.timestamp) >= startMs && Date.parse(candle.timestamp) <= nowMs)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))[0];
  if (exactOrFirstCandle) {
    return roundPrice(exactOrFirstCandle.open);
  }
  const coveringCandle = [...input.candles]
    .filter((candle) => {
      const candleStart = Date.parse(candle.timestamp);
      return candleStart <= startMs && candleStart + candle.granularity * 1000 > startMs;
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
  return coveringCandle ? roundPrice(coveringCandle.open) : null;
}

function resolveCurrentPrice(ticks: RealTimePriceTick[], candles: Candle[], now: string): number | null {
  const nowMs = Date.parse(now);
  const latestTick = [...ticks]
    .filter((tick) => tickMs(tick) <= nowMs && Number.isFinite(tick.price))
    .sort((a, b) => tickMs(b) - tickMs(a))[0];
  if (latestTick) {
    return roundPrice(latestTick.price);
  }
  const latestCandle = [...candles]
    .filter((candle) => Date.parse(candle.timestamp) <= nowMs && Number.isFinite(candle.close))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
  return latestCandle ? roundPrice(latestCandle.close) : null;
}

function averageReference(
  candles: Candle[],
  ticks: RealTimePriceTick[],
  startTime: string,
  seconds: number,
  now: string
): number | null {
  const startMs = Date.parse(startTime);
  const endMs = Math.min(startMs + seconds * 1000, Date.parse(now));
  const tickValues = ticks
    .filter((tick) => tickMs(tick) >= startMs && tickMs(tick) <= endMs && Number.isFinite(tick.price))
    .map((tick) => tick.price);
  if (tickValues.length) {
    return roundPrice(tickValues.reduce((sum, value) => sum + value, 0) / tickValues.length);
  }
  const candleValues = candles
    .filter((candle) => {
      const candleStart = Date.parse(candle.timestamp);
      const candleEnd = candleStart + candle.granularity * 1000;
      return candleStart < endMs && candleEnd > startMs;
    })
    .map((candle) => candle.close)
    .filter((value) => Number.isFinite(value));
  if (!candleValues.length) {
    return null;
  }
  return roundPrice(candleValues.reduce((sum, value) => sum + value, 0) / candleValues.length);
}

function eventStatus(input: {
  nowMs: number;
  startMs: number;
  endMs: number;
  secondsRemaining: number;
  elapsedSeconds: number;
  hasStartReference: boolean;
}): ShortWindowEventStatus {
  if (input.nowMs >= input.endMs) {
    return "closed";
  }
  if (input.nowMs < input.startMs || input.elapsedSeconds < FORMING_SECONDS || !input.hasStartReference) {
    return "forming";
  }
  if (input.secondsRemaining <= NO_ENTRY_ZONE_SECONDS) {
    return "no_entry_zone";
  }
  if (input.secondsRemaining <= DECISION_ZONE_START_SECONDS) {
    return "decision_zone";
  }
  return "open";
}

function resolveSourceType(
  ticks: RealTimePriceTick[],
  candles: Candle[],
  venue: BuildCurrentShortWindowEventInput["venue"]
): ShortWindowEvent["sourceType"] {
  if (venue === "mock" || ticks.some((tick) => tick.sourceType === "mock") || candles.some((candle) => candle.sourceType === "mock")) {
    return "mock";
  }
  return "live";
}

function tickMs(tick: RealTimePriceTick): number {
  return Date.parse(tick.eventTime || tick.receivedAt);
}

function roundPrice(value: number): number {
  return Number(value.toFixed(8));
}

function roundBps(value: number): number {
  return Number(value.toFixed(4));
}
