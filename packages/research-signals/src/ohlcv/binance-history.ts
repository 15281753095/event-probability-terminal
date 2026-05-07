import type { Candle, OhlcvInterval, ProviderHealth, SignalSymbol } from "@ept/shared-types";
import type { FetchLike } from "./types.js";
import {
  BINANCE_SPOT_PUBLIC_BASE_URL,
  BINANCE_SPOT_PUBLIC_PROVIDER,
  BINANCE_SPOT_PUBLIC_SOURCE,
  binanceSpotInterval,
  binanceSpotIntervalSeconds,
  buildBinanceSpotSymbol
} from "./binance-spot.js";

export type BinanceHistoryLookback = "1d" | "3d" | "1w" | "1m" | "custom";

export type BinanceHistoricalKlinesRequest = {
  symbol: SignalSymbol;
  interval: OhlcvInterval;
  lookback?: BinanceHistoryLookback | undefined;
  startTime: string;
  endTime: string;
  requestedAt: string;
};

export type BinanceHistoricalKlinesOptions = {
  baseUrl?: string | undefined;
  fetcher?: FetchLike | undefined;
  timeoutMs?: number | undefined;
  limit?: number | undefined;
  maxPages?: number | undefined;
};

export type BinanceHistoricalKlinesResult = {
  symbol: SignalSymbol;
  productId: string;
  interval: OhlcvInterval;
  startTime: string;
  endTime: string;
  candleCount: number;
  candles: Candle[];
  providerHealth: ProviderHealth;
  warnings: string[];
  failClosedReasons: string[];
};

const DEFAULT_LIMIT = 1000;

export async function fetchBinanceHistoricalKlines(
  request: BinanceHistoricalKlinesRequest,
  options: BinanceHistoricalKlinesOptions = {}
): Promise<BinanceHistoricalKlinesResult> {
  const productId = buildBinanceSpotSymbol(request.symbol);
  const startMs = Date.parse(request.startTime);
  const endMs = Date.parse(request.endTime);
  const requestedAtMs = Date.parse(request.requestedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    return emptyResult(request, productId, "Binance historical klines require a valid startTime earlier than endTime.");
  }
  const fetcher = options.fetcher ?? (globalThis.fetch as FetchLike | undefined);
  if (!fetcher) {
    return emptyResult(request, productId, "Global fetch is unavailable for Binance Spot public historical kline adapter.");
  }

  const limit = Math.max(1, Math.min(DEFAULT_LIMIT, options.limit ?? DEFAULT_LIMIT));
  const intervalMs = binanceSpotIntervalSeconds(request.interval) * 1000;
  const maxPages = options.maxPages ?? 80;
  const warnings: string[] = [];
  const failClosedReasons: string[] = [];
  const byStart = new Map<string, Candle>();
  let cursor = startMs;

  for (let page = 0; page < maxPages && cursor <= endMs; page += 1) {
    const pageResult = await fetchKlinePage({
      request,
      options,
      productId,
      startMs: cursor,
      endMs,
      limit,
      requestedAtMs,
      fetcher
    });
    warnings.push(...pageResult.warnings);
    if (pageResult.failClosedReasons.length) {
      failClosedReasons.push(...pageResult.failClosedReasons);
      break;
    }
    if (pageResult.candles.length === 0) {
      break;
    }
    for (const candle of pageResult.candles) {
      byStart.set(candle.startTime, candle);
    }
    const lastOpen = Math.max(...pageResult.candles.map((candle) => Date.parse(candle.startTime)));
    const nextCursor = lastOpen + intervalMs;
    if (nextCursor <= cursor) {
      failClosedReasons.push("Binance historical pagination did not advance.");
      break;
    }
    cursor = nextCursor;
  }

  if (cursor <= endMs && !failClosedReasons.length) {
    warnings.push("Binance historical kline pagination stopped before requested endTime.");
  }

  const candles = [...byStart.values()]
    .filter((candle) => Date.parse(candle.timestamp) >= startMs && Date.parse(candle.timestamp) <= endMs)
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  if (candles.length === 0 && failClosedReasons.length === 0) {
    failClosedReasons.push("Binance Spot public historical klines returned no closed candles.");
  }

  return {
    symbol: request.symbol,
    productId,
    interval: request.interval,
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
    candleCount: candles.length,
    candles,
    providerHealth: providerHealth(request, productId, candles, failClosedReasons),
    warnings: unique(warnings),
    failClosedReasons: unique(failClosedReasons)
  };
}

async function fetchKlinePage(input: {
  request: BinanceHistoricalKlinesRequest;
  options: BinanceHistoricalKlinesOptions;
  productId: string;
  startMs: number;
  endMs: number;
  limit: number;
  requestedAtMs: number;
  fetcher: FetchLike;
}): Promise<{ candles: Candle[]; warnings: string[]; failClosedReasons: string[] }> {
  const timeoutMs = input.options.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await input.fetcher(buildHistoricalKlinesUrl(input), {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      return {
        candles: [],
        warnings: [],
        failClosedReasons: [`Binance Spot public historical klines failed with HTTP ${response.status} ${response.statusText}.`]
      };
    }
    const body = await response.json();
    return parseKlinesPage(body, input.request, input.requestedAtMs);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Binance Spot public historical klines timed out after ${timeoutMs}ms.`
        : error instanceof Error
          ? `Binance Spot public historical klines failed: ${error.message}`
          : "Binance Spot public historical klines failed with an unknown error.";
    return { candles: [], warnings: [], failClosedReasons: [message] };
  } finally {
    clearTimeout(timeout);
  }
}

function buildHistoricalKlinesUrl(input: {
  request: BinanceHistoricalKlinesRequest;
  options: BinanceHistoricalKlinesOptions;
  productId: string;
  startMs: number;
  endMs: number;
  limit: number;
}): string {
  const url = new URL("/api/v3/klines", input.options.baseUrl ?? BINANCE_SPOT_PUBLIC_BASE_URL);
  url.searchParams.set("symbol", input.productId);
  url.searchParams.set("interval", binanceSpotInterval(input.request.interval));
  url.searchParams.set("startTime", String(input.startMs));
  url.searchParams.set("endTime", String(input.endMs));
  url.searchParams.set("limit", String(input.limit));
  return url.toString();
}

function parseKlinesPage(
  body: unknown,
  request: BinanceHistoricalKlinesRequest,
  requestedAtMs: number
): { candles: Candle[]; warnings: string[]; failClosedReasons: string[] } {
  if (!Array.isArray(body)) {
    return {
      candles: [],
      warnings: [],
      failClosedReasons: ["Binance Spot public historical klines response was not an array."]
    };
  }
  const warnings: string[] = [];
  const candles: Candle[] = [];
  for (let index = 0; index < body.length; index += 1) {
    const parsed = parseRow(body[index], request, requestedAtMs);
    if (!parsed) {
      return {
        candles: [],
        warnings,
        failClosedReasons: [`Binance Spot public historical klines row ${index} was malformed.`]
      };
    }
    if (parsed.isClosed) {
      candles.push(parsed);
    } else {
      warnings.push("Dropped incomplete Binance historical candle.");
    }
  }
  return { candles, warnings, failClosedReasons: [] };
}

function parseRow(row: unknown, request: BinanceHistoricalKlinesRequest, requestedAtMs: number): Candle | undefined {
  if (!Array.isArray(row) || row.length < 7) {
    return undefined;
  }
  const [openTime, open, high, low, close, volume, closeTime] = row.map(toFiniteNumber);
  if (
    openTime === undefined ||
    open === undefined ||
    high === undefined ||
    low === undefined ||
    close === undefined ||
    volume === undefined ||
    closeTime === undefined
  ) {
    return undefined;
  }
  const timestamp = new Date(openTime).toISOString();
  return {
    source: BINANCE_SPOT_PUBLIC_SOURCE,
    sourceType: "live",
    provider: BINANCE_SPOT_PUBLIC_PROVIDER,
    symbol: request.symbol,
    interval: request.interval,
    granularity: binanceSpotIntervalSeconds(request.interval),
    productId: buildBinanceSpotSymbol(request.symbol),
    displaySymbol: buildBinanceSpotSymbol(request.symbol),
    openTime: timestamp,
    startTime: timestamp,
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    isLive: true,
    isMock: false,
    isFixtureBacked: false,
    isClosed: requestedAtMs > closeTime
  };
}

function emptyResult(
  request: BinanceHistoricalKlinesRequest,
  productId: string,
  reason: string
): BinanceHistoricalKlinesResult {
  return {
    symbol: request.symbol,
    productId,
    interval: request.interval,
    startTime: request.startTime,
    endTime: request.endTime,
    candleCount: 0,
    candles: [],
    providerHealth: providerHealth(request, productId, [], [reason]),
    warnings: [reason],
    failClosedReasons: [reason]
  };
}

function providerHealth(
  request: BinanceHistoricalKlinesRequest,
  productId: string,
  candles: Candle[],
  failClosedReasons: string[]
): ProviderHealth {
  return {
    requestedProvider: "binance",
    resolvedProvider: BINANCE_SPOT_PUBLIC_PROVIDER,
    sourceType: "live",
    status: failClosedReasons.length ? "failed" : candles.length ? "ok" : "degraded",
    latencyMs: null,
    candleCount: candles.length,
    expectedMinCandles: 0,
    lastCandleTime: candles.at(-1)?.timestamp ?? null,
    isFixtureBacked: false,
    fallbackUsed: false,
    fallbackReason: null,
    failClosedReasons,
    checkedAt: request.requestedAt
  };
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
