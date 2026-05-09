import type {
  Candle,
  MarketDataKlinesResponse,
  MarketDataRange,
  OhlcvInterval,
  ProviderHealth,
  SignalSymbol,
  StoredDataSourceType
} from "@ept/shared-types";
import { underlyingCandleFromCandle } from "../store/index.js";
import type { ResearchDataStore, UnderlyingCandleRecord } from "../store/types.js";
import { fetchBinanceHistoricalKlines, type BinanceHistoricalKlinesOptions } from "./binance-history.js";
import {
  BINANCE_SPOT_PUBLIC_PROVIDER,
  BINANCE_SPOT_PUBLIC_SOURCE,
  BINANCE_SPOT_PUBLIC_BASE_URL,
  binanceSpotIntervalSeconds,
  buildBinanceSpotSymbol
} from "./binance-spot.js";
import { aggregateCandlesToInterval, intervalMsForOhlcv } from "./aggregate.js";

export type MarketDataKlinesRequest = {
  symbol: SignalSymbol;
  interval: OhlcvInterval;
  range: MarketDataRange;
  source?: "live" | "stored" | "mock" | undefined;
  limit?: number | undefined;
  requestedAt: string;
  store?: ResearchDataStore | undefined;
};

type RangeResolution = {
  startTime: string;
  endTime: string;
  appliedRange: MarketDataRange;
  warnings: string[];
  isTruncated: boolean;
};

const MAX_LIMIT = 4_000;

export async function loadMarketDataKlines(
  request: MarketDataKlinesRequest,
  options: BinanceHistoricalKlinesOptions = {}
): Promise<MarketDataKlinesResponse> {
  const checkedAt = request.requestedAt;
  const displaySymbol = buildBinanceSpotSymbol(request.symbol);
  const rangeResolution = resolveRangeForInterval(request.interval, request.range, checkedAt);
  const baseInterval = request.interval === "10m" ? "1m" : request.interval;
  const warnings = [...rangeResolution.warnings];

  if (request.source === "mock") {
    const mockNative = buildMockCandles({
      symbol: request.symbol,
      interval: baseInterval,
      startTime: rangeResolution.startTime,
      endTime: rangeResolution.endTime
    });
    const finalized = finalizeCandles({
      symbol: request.symbol,
      interval: request.interval,
      baseInterval,
      sourceType: "mock",
      checkedAt,
      candles: mockNative,
      warnings,
      appliedRange: rangeResolution.appliedRange,
      isTruncated: rangeResolution.isTruncated,
      limit: request.limit
    });
    return finalized;
  }

  const stored = request.store
    ? await request.store.getUnderlyingCandles({
      symbol: displaySymbol,
      interval: baseInterval,
      startTime: rangeResolution.startTime,
      endTime: rangeResolution.endTime,
      provider: "binance-spot-public"
    })
    : [];
  const storedCoverage = coverageSummary(stored, rangeResolution.startTime, rangeResolution.endTime, baseInterval);

  if (request.source === "stored") {
    warnings.push(
      stored.length
        ? "Historical candles loaded from local cache only."
        : "No local cache candles matched the requested range."
    );
    return finalizeCandles({
      symbol: request.symbol,
      interval: request.interval,
      baseInterval,
      sourceType: "stored",
      checkedAt,
      candles: candlesFromRecords(stored, request.symbol, baseInterval),
      warnings,
      appliedRange: rangeResolution.appliedRange,
      isTruncated: rangeResolution.isTruncated,
      limit: request.limit
    });
  }

  if (!request.source && storedCoverage.sufficient) {
    warnings.push("Historical candles served from local cache.");
    return finalizeCandles({
      symbol: request.symbol,
      interval: request.interval,
      baseInterval,
      sourceType: "stored",
      checkedAt,
      candles: candlesFromRecords(stored, request.symbol, baseInterval),
      warnings,
      appliedRange: rangeResolution.appliedRange,
      isTruncated: rangeResolution.isTruncated,
      limit: request.limit
    });
  }

  if (stored.length > 0 && !storedCoverage.sufficient) {
    warnings.push("Local cache coverage was incomplete; missing history was refreshed from Binance public market data.");
  }

  const live = await fetchBinanceHistoricalKlines({
    symbol: request.symbol,
    interval: baseInterval,
    startTime: rangeResolution.startTime,
    endTime: rangeResolution.endTime,
    requestedAt: checkedAt
  }, {
    ...options,
    baseUrl: options.baseUrl ?? BINANCE_SPOT_PUBLIC_BASE_URL
  });
  warnings.push(...live.warnings, ...live.failClosedReasons);
  if (live.candles.length > 0 && request.store) {
    await request.store.insertUnderlyingCandles(live.candles.map(underlyingCandleFromCandle));
    warnings.push(stored.length > 0 ? "Part of the requested history came from live fetch and was written to local cache." : "Historical candles came from live fetch and were written to local cache.");
  }
  return finalizeCandles({
    symbol: request.symbol,
    interval: request.interval,
    baseInterval,
    sourceType: "live",
    checkedAt,
    candles: live.candles,
    providerHealthOverride: live.providerHealth,
    warnings,
    appliedRange: rangeResolution.appliedRange,
    isTruncated: rangeResolution.isTruncated,
    limit: request.limit
  });
}

export function resolveRangeForInterval(
  interval: OhlcvInterval,
  requestedRange: MarketDataRange,
  checkedAt: string
): RangeResolution {
  const nowMs = Date.parse(checkedAt);
  const warnings: string[] = [];
  const maxAllowed = maxRangeForInterval(interval);
  const appliedRange = rangeOrderIndex(requestedRange) > rangeOrderIndex(maxAllowed) ? maxAllowed : requestedRange;
  const isTruncated = appliedRange !== requestedRange;
  if (isTruncated) {
    warnings.push(`Requested range ${requestedRange} was limited to ${appliedRange} for interval ${interval} to keep the chart responsive.`);
  }

  const durationMs = rangeDurationMs(appliedRange, nowMs);
  return {
    startTime: new Date(nowMs - durationMs).toISOString(),
    endTime: checkedAt,
    appliedRange,
    warnings,
    isTruncated
  };
}

function finalizeCandles(input: {
  symbol: SignalSymbol;
  interval: OhlcvInterval;
  baseInterval: OhlcvInterval;
  sourceType: StoredDataSourceType;
  checkedAt: string;
  candles: Candle[];
  warnings: string[];
  appliedRange: MarketDataRange;
  isTruncated: boolean;
  limit?: number | undefined;
  providerHealthOverride?: ProviderHealth | undefined;
}): MarketDataKlinesResponse {
  const derived = input.interval === "10m";
  const aggregation = derived
    ? aggregateCandlesToInterval({ candles: input.candles, targetInterval: "10m" })
    : { candles: input.candles, warnings: [] };
  const warnings = unique([...input.warnings, ...aggregation.warnings]);
  const limited = applyLimit(aggregation.candles, input.interval, input.limit);
  const sourceType = input.sourceType;
  const providerHealth = input.providerHealthOverride ?? storedProviderHealth({
    checkedAt: input.checkedAt,
    sourceType,
    candles: limited.candles
  });
  return {
    symbol: input.symbol,
    displaySymbol: buildBinanceSpotSymbol(input.symbol),
    interval: input.interval,
    intervalSource: derived ? "derived" : "native",
    ...(derived ? { derivedFrom: input.baseInterval as Exclude<OhlcvInterval, "10m"> } : {}),
    range: input.appliedRange,
    candles: limited.candles,
    candleCount: limited.candles.length,
    providerHealth: {
      ...providerHealth,
      candleCount: limited.candles.length,
      lastCandleTime: limited.candles.at(-1)?.timestamp ?? providerHealth.lastCandleTime
    },
    sourceType,
    warnings: unique([
      ...warnings,
      ...limited.warnings
    ]),
    ...(input.isTruncated ? { maxRangeApplied: input.appliedRange } : {}),
    isTruncated: input.isTruncated || limited.isTruncated,
    checkedAt: input.checkedAt
  };
}

function storedProviderHealth(input: {
  checkedAt: string;
  sourceType: StoredDataSourceType;
  candles: Candle[];
}): ProviderHealth {
  return {
    requestedProvider: input.sourceType === "mock" ? "mock" : "binance",
    resolvedProvider: input.sourceType === "mock" ? "mock" : BINANCE_SPOT_PUBLIC_PROVIDER,
    sourceType: input.sourceType === "mock" ? "mock" : "live",
    status: input.candles.length > 0 ? "ok" : "degraded",
    latencyMs: null,
    candleCount: input.candles.length,
    expectedMinCandles: 1,
    lastCandleTime: input.candles.at(-1)?.timestamp ?? null,
    isFixtureBacked: false,
    fallbackUsed: false,
    fallbackReason: null,
    failClosedReasons: input.candles.length > 0 ? [] : ["No cached candles were available for the requested range."],
    checkedAt: input.checkedAt
  };
}

function candlesFromRecords(records: UnderlyingCandleRecord[], symbol: SignalSymbol, interval: OhlcvInterval): Candle[] {
  return records.map((record) => ({
    source: BINANCE_SPOT_PUBLIC_SOURCE,
    sourceType: record.sourceType,
    provider: record.provider === "mock" ? "binance-spot-public" : record.provider,
    symbol,
    interval,
    granularity: binanceSpotIntervalSeconds(interval),
    productId: record.symbol,
    displaySymbol: record.symbol,
    openTime: record.openTime,
    startTime: record.openTime,
    timestamp: record.openTime,
    open: record.open,
    high: record.high,
    low: record.low,
    close: record.close,
    volume: record.volume,
    isLive: record.sourceType === "live",
    isMock: record.sourceType === "mock",
    isFixtureBacked: record.sourceType === "fixture",
    isClosed: true
  }));
}

function buildMockCandles(input: {
  symbol: SignalSymbol;
  interval: OhlcvInterval;
  startTime: string;
  endTime: string;
}): Candle[] {
  const intervalMs = intervalMsForOhlcv(input.interval);
  const startMs = Date.parse(input.startTime);
  const endMs = Date.parse(input.endTime);
  const count = Math.max(1, Math.floor((endMs - startMs) / intervalMs));
  const base = input.symbol === "BTC" ? 79_500 : 2_250;
  return Array.from({ length: count }, (_, index) => {
    const openMs = startMs + index * intervalMs;
    const drift = index * (input.symbol === "BTC" ? 6.5 : 0.42);
    const wave = Math.sin(index / 6) * (input.symbol === "BTC" ? 45 : 4.5);
    const open = round(base + drift + wave);
    const close = round(open + Math.cos(index / 4) * (input.symbol === "BTC" ? 18 : 1.8));
    const high = round(Math.max(open, close) + (input.symbol === "BTC" ? 14 : 1.4));
    const low = round(Math.min(open, close) - (input.symbol === "BTC" ? 14 : 1.4));
    const timestamp = new Date(openMs).toISOString();
    return {
      source: BINANCE_SPOT_PUBLIC_SOURCE,
      sourceType: "mock",
      provider: "binance-spot-public",
      symbol: input.symbol,
      interval: input.interval,
      granularity: Math.round(intervalMs / 1000),
      productId: buildBinanceSpotSymbol(input.symbol),
      displaySymbol: buildBinanceSpotSymbol(input.symbol),
      openTime: timestamp,
      startTime: timestamp,
      timestamp,
      open,
      high,
      low,
      close,
      volume: round(120 + index * 0.8),
      isLive: false,
      isMock: true,
      isFixtureBacked: false,
      isClosed: true
    };
  });
}

function coverageSummary(records: UnderlyingCandleRecord[], startTime: string, endTime: string, interval: OhlcvInterval): {
  sufficient: boolean;
} {
  if (records.length === 0) {
    return { sufficient: false };
  }
  const intervalMs = intervalMsForOhlcv(interval);
  const startMs = Date.parse(startTime);
  const endMs = Date.parse(endTime);
  const sorted = [...records].sort((left, right) => Date.parse(left.openTime) - Date.parse(right.openTime));
  const firstMs = Date.parse(sorted[0]!.openTime);
  const lastMs = Date.parse(sorted[sorted.length - 1]!.openTime);
  const expected = Math.max(1, Math.floor((endMs - startMs) / intervalMs));
  const hasGap = sorted.some((record, index) => {
    if (index === 0) {
      return false;
    }
    return Date.parse(record.openTime) - Date.parse(sorted[index - 1]!.openTime) > intervalMs;
  });
  return {
    sufficient:
      firstMs <= startMs + intervalMs &&
      lastMs >= endMs - intervalMs * 2 &&
      sorted.length >= Math.max(1, Math.floor(expected * 0.8)) &&
      !hasGap
  };
}

function maxRangeForInterval(interval: OhlcvInterval): MarketDataRange {
  switch (interval) {
    case "1m":
      return "1M";
    case "5m":
    case "10m":
    case "15m":
      return "3M";
    case "30m":
      return "1Y";
    case "1h":
    case "4h":
      return "1Y";
    case "1d":
    case "1w":
    case "1M":
      return "ALL";
  }
}

function rangeDurationMs(range: MarketDataRange, nowMs: number): number {
  switch (range) {
    case "1D":
      return 24 * 60 * 60 * 1000;
    case "3D":
      return 3 * 24 * 60 * 60 * 1000;
    case "1W":
      return 7 * 24 * 60 * 60 * 1000;
    case "1M":
      return 30 * 24 * 60 * 60 * 1000;
    case "3M":
      return 90 * 24 * 60 * 60 * 1000;
    case "1Y":
      return 365 * 24 * 60 * 60 * 1000;
    case "ALL":
      return nowMs - Date.parse("2017-01-01T00:00:00.000Z");
  }
}

function rangeOrderIndex(range: MarketDataRange): number {
  switch (range) {
    case "1D":
      return 0;
    case "3D":
      return 1;
    case "1W":
      return 2;
    case "1M":
      return 3;
    case "3M":
      return 4;
    case "1Y":
      return 5;
    case "ALL":
      return 6;
  }
}

function applyLimit(candles: Candle[], interval: OhlcvInterval, limit: number | undefined): {
  candles: Candle[];
  warnings: string[];
  isTruncated: boolean;
} {
  const resolvedLimit = Math.max(120, Math.min(MAX_LIMIT, Math.floor(limit ?? defaultLimit(interval))));
  if (candles.length <= resolvedLimit) {
    return { candles, warnings: [], isTruncated: false };
  }
  return {
    candles: candles.slice(-resolvedLimit),
    warnings: [`Returned the most recent ${resolvedLimit} candles to keep chart rendering responsive.`],
    isTruncated: true
  };
}

function defaultLimit(interval: OhlcvInterval): number {
  switch (interval) {
    case "1m":
      return 1_440;
    case "5m":
    case "10m":
    case "15m":
      return 2_016;
    case "30m":
    case "1h":
      return 2_000;
    case "4h":
      return 1_500;
    case "1d":
      return 3_650;
    case "1w":
      return 1_040;
    case "1M":
      return 240;
  }
}

function round(value: number): number {
  return Number(value.toFixed(8));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
