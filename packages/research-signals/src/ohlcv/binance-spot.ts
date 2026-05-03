import type {
  Candle,
  DataSourceType,
  LiveMarketDataResponse,
  MarketDataProvenance,
  OHLCVFetchRequest,
  OHLCVFetchResult,
  OHLCVFreshness,
  OhlcvInterval,
  SignalSymbol
} from "@ept/shared-types";
import type { FetchLike, LiveMarketDataFetchRequest } from "./types.js";

export const BINANCE_SPOT_PUBLIC_BASE_URL = "https://data-api.binance.vision";
export const BINANCE_SPOT_PUBLIC_SOURCE = "binance_spot_public" as const;
export const BINANCE_SPOT_PUBLIC_PROVIDER = "binance-spot-public" as const;

export type BinanceSpotOptions = {
  baseUrl?: string;
  fetcher?: FetchLike;
  timeoutMs?: number;
  extraLookbackCandles?: number;
};

type BinanceTickerResult = Pick<
  LiveMarketDataResponse,
  | "productId"
  | "displaySymbol"
  | "latestPrice"
  | "bid"
  | "ask"
  | "tickerTime"
  | "tickerFreshnessSeconds"
  | "tickerVolume"
  | "warnings"
  | "failClosedReasons"
>;

const symbolByAsset = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT"
} satisfies Record<SignalSymbol, string>;

const intervalSecondsByInterval = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600
} satisfies Record<OhlcvInterval, number>;

export async function fetchBinanceSpotCandles(
  request: OHLCVFetchRequest,
  options: BinanceSpotOptions = {}
): Promise<OHLCVFetchResult> {
  const fetchedAt = request.requestedAt;
  if (request.sourceMode !== "live") {
    return emptyFailClosedBinanceOHLCVResult(request, fetchedAt, "Binance Spot public adapter only supports sourceMode=live.");
  }

  const fetcher = options.fetcher ?? (globalThis.fetch as FetchLike | undefined);
  if (!fetcher) {
    return emptyFailClosedBinanceOHLCVResult(request, fetchedAt, "Global fetch is unavailable for Binance Spot public OHLCV adapter.");
  }

  const timeoutMs = options.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(buildKlinesUrl(request, options), {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      return emptyFailClosedBinanceOHLCVResult(
        request,
        fetchedAt,
        `Binance Spot public klines request failed with HTTP ${response.status} ${response.statusText}.`
      );
    }

    const body = await response.json();
    return parseBinanceKlines(body, request, fetchedAt);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Binance Spot public klines request timed out after ${timeoutMs}ms.`
        : error instanceof Error
          ? `Binance Spot public klines request failed: ${error.message}`
          : "Binance Spot public klines request failed with an unknown error.";
    return emptyFailClosedBinanceOHLCVResult(request, fetchedAt, message);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchBinanceSpotMarketData(
  request: LiveMarketDataFetchRequest,
  options: BinanceSpotOptions = {}
): Promise<LiveMarketDataResponse> {
  const interval = request.interval ?? "1m";
  const lookback = request.lookback ?? 80;
  const sourceMode = request.sourceMode ?? "live";
  if (sourceMode !== "live") {
    return emptyFailClosedBinanceMarketData(
      request,
      "Binance Spot public live market-data adapter only supports sourceMode=live."
    );
  }

  const candleRequest: OHLCVFetchRequest = {
    symbol: request.symbol,
    interval,
    lookback,
    sourceMode,
    requestedAt: request.requestedAt
  };
  const [ticker, candleResult] = await Promise.all([
    fetchBinanceSpotTicker(request, options),
    fetchBinanceSpotCandles(candleRequest, options)
  ]);

  const latestCandleTime = candleResult.freshness.latestClosedAt ?? candleResult.candles.at(-1)?.timestamp ?? null;
  const candleFreshnessSeconds =
    candleResult.freshness.ageMs === null ? null : Math.max(0, Math.round(candleResult.freshness.ageMs / 1000));

  return withMarketDataProvenance({
    symbol: request.symbol,
    source: BINANCE_SPOT_PUBLIC_PROVIDER,
    sourceType: "live",
    provider: BINANCE_SPOT_PUBLIC_PROVIDER,
    productId: ticker.productId,
    displaySymbol: ticker.displaySymbol,
    fetchedAt: request.requestedAt,
    latestPrice: ticker.latestPrice,
    bid: ticker.bid,
    ask: ticker.ask,
    tickerTime: ticker.tickerTime,
    tickerFreshnessSeconds: ticker.tickerFreshnessSeconds,
    tickerVolume: ticker.tickerVolume,
    candles: candleResult.candles,
    candleInterval: interval,
    candleGranularity: binanceSpotIntervalSeconds(interval),
    candleCount: candleResult.candles.length,
    latestCandleTime,
    lastCandleTime: latestCandleTime,
    candleFreshnessSeconds,
    isLive: true,
    isMock: false,
    isFixtureBacked: false,
    warnings: unique([...ticker.warnings, ...candleResult.warnings]),
    failClosedReasons: unique([...ticker.failClosedReasons, ...candleResult.failClosedReasons])
  });
}

export function buildBinanceSpotSymbol(symbol: SignalSymbol): string {
  return symbolByAsset[symbol];
}

export function binanceSpotInterval(interval: OhlcvInterval): OhlcvInterval {
  return interval;
}

export function binanceSpotIntervalSeconds(interval: OhlcvInterval): number {
  return intervalSecondsByInterval[interval];
}

export function emptyFailClosedBinanceMarketData(
  request: Pick<LiveMarketDataFetchRequest, "symbol" | "requestedAt"> & Partial<LiveMarketDataFetchRequest>,
  reason: string
): LiveMarketDataResponse {
  const interval = request.interval ?? "1m";
  return withMarketDataProvenance({
    symbol: request.symbol,
    source: BINANCE_SPOT_PUBLIC_PROVIDER,
    sourceType: "live",
    provider: BINANCE_SPOT_PUBLIC_PROVIDER,
    productId: buildBinanceSpotSymbol(request.symbol),
    displaySymbol: buildBinanceSpotSymbol(request.symbol),
    fetchedAt: request.requestedAt,
    latestPrice: null,
    bid: null,
    ask: null,
    tickerTime: null,
    tickerFreshnessSeconds: null,
    tickerVolume: null,
    candles: [],
    candleInterval: interval,
    candleGranularity: binanceSpotIntervalSeconds(interval),
    candleCount: 0,
    latestCandleTime: null,
    lastCandleTime: null,
    candleFreshnessSeconds: null,
    isLive: true,
    isMock: false,
    isFixtureBacked: false,
    warnings: [reason],
    failClosedReasons: [reason]
  });
}

export function emptyFailClosedBinanceOHLCVResult(
  request: OHLCVFetchRequest,
  fetchedAt: string,
  reason: string
): OHLCVFetchResult {
  const sourceType: DataSourceType = request.sourceMode === "live" ? "live" : "fixture";
  return {
    candles: [],
    source: BINANCE_SPOT_PUBLIC_SOURCE,
    sourceType,
    provider: BINANCE_SPOT_PUBLIC_PROVIDER,
    productId: buildBinanceSpotSymbol(request.symbol),
    displaySymbol: buildBinanceSpotSymbol(request.symbol),
    candleGranularity: binanceSpotIntervalSeconds(request.interval),
    candleCount: 0,
    lastCandleTime: null,
    fetchedAt,
    freshness: emptyFreshness(request),
    warnings: [reason],
    failClosedReasons: [reason],
    isLive: request.sourceMode === "live",
    isMock: false,
    isFixtureBacked: false
  };
}

function buildKlinesUrl(request: OHLCVFetchRequest, options: BinanceSpotOptions): string {
  const baseUrl = options.baseUrl ?? BINANCE_SPOT_PUBLIC_BASE_URL;
  const extraLookbackCandles = options.extraLookbackCandles ?? 5;
  const url = new URL("/api/v3/klines", baseUrl);
  url.searchParams.set("symbol", buildBinanceSpotSymbol(request.symbol));
  url.searchParams.set("interval", binanceSpotInterval(request.interval));
  url.searchParams.set("limit", String(Math.min(1000, request.lookback + extraLookbackCandles)));
  return url.toString();
}

function buildTickerUrl(request: LiveMarketDataFetchRequest, options: BinanceSpotOptions): string {
  const baseUrl = options.baseUrl ?? BINANCE_SPOT_PUBLIC_BASE_URL;
  const url = new URL("/api/v3/ticker/24hr", baseUrl);
  url.searchParams.set("symbol", buildBinanceSpotSymbol(request.symbol));
  return url.toString();
}

async function fetchBinanceSpotTicker(
  request: LiveMarketDataFetchRequest,
  options: BinanceSpotOptions
): Promise<BinanceTickerResult> {
  const productId = buildBinanceSpotSymbol(request.symbol);
  const fetcher = options.fetcher ?? (globalThis.fetch as FetchLike | undefined);
  if (!fetcher) {
    return emptyTickerResult(productId, "Live data unavailable: global fetch is unavailable for Binance Spot public ticker adapter.");
  }

  const timeoutMs = options.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(buildTickerUrl(request, options), {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      return emptyTickerResult(
        productId,
        `Live data unavailable: Binance Spot public ticker request failed with HTTP ${response.status} ${response.statusText}.`
      );
    }

    const body = await response.json();
    return parseBinanceTicker(body, request, productId);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Live data unavailable: Binance Spot public ticker request timed out after ${timeoutMs}ms.`
        : error instanceof Error
          ? `Live data unavailable: Binance Spot public ticker request failed: ${error.message}`
          : "Live data unavailable: Binance Spot public ticker request failed with an unknown error.";
    return emptyTickerResult(productId, message);
  } finally {
    clearTimeout(timeout);
  }
}

function parseBinanceTicker(
  body: unknown,
  request: LiveMarketDataFetchRequest,
  productId: string
): BinanceTickerResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return emptyTickerResult(productId, "Live data unavailable: Binance Spot public ticker response was not an object.");
  }
  const record = body as Record<string, unknown>;
  if (record.symbol !== productId) {
    return emptyTickerResult(productId, "Live data unavailable: Binance Spot public ticker symbol did not match the request.");
  }
  const latestPrice = toFiniteNumber(record.lastPrice);
  if (latestPrice === undefined) {
    return emptyTickerResult(productId, "Live data unavailable: Binance Spot public ticker lastPrice was missing or non-numeric.");
  }

  const warnings: string[] = [];
  const bid = optionalNumeric(record.bidPrice, "bidPrice", warnings);
  const ask = optionalNumeric(record.askPrice, "askPrice", warnings);
  const tickerVolume = optionalNumeric(record.volume, "volume", warnings);
  const closeTime = toFiniteNumber(record.closeTime);
  const tickerTime =
    closeTime === undefined ? request.requestedAt : new Date(closeTime).toISOString();
  if (closeTime === undefined) {
    warnings.push("ticker_time_unavailable: Binance 24hr ticker closeTime was missing; using fetchedAt.");
  }
  const tickerFreshnessSeconds = Math.max(0, Math.round((Date.parse(request.requestedAt) - Date.parse(tickerTime)) / 1000));

  return {
    productId,
    displaySymbol: productId,
    latestPrice,
    bid,
    ask,
    tickerTime,
    tickerFreshnessSeconds,
    tickerVolume,
    warnings,
    failClosedReasons: []
  };
}

function emptyTickerResult(productId: string, reason: string): BinanceTickerResult {
  return {
    productId,
    displaySymbol: productId,
    latestPrice: null,
    bid: null,
    ask: null,
    tickerTime: null,
    tickerFreshnessSeconds: null,
    tickerVolume: null,
    warnings: [reason],
    failClosedReasons: [reason]
  };
}

function parseBinanceKlines(
  body: unknown,
  request: OHLCVFetchRequest,
  fetchedAt: string
): OHLCVFetchResult {
  if (!Array.isArray(body)) {
    return emptyFailClosedBinanceOHLCVResult(request, fetchedAt, "Binance Spot public klines response was not an array.");
  }

  const requestedAtMs = Date.parse(request.requestedAt);
  const parsed: Candle[] = [];
  for (let index = 0; index < body.length; index += 1) {
    const candle = parseBinanceKlineRow(body[index], request, requestedAtMs);
    if (!candle) {
      return emptyFailClosedBinanceOHLCVResult(
        request,
        fetchedAt,
        `Binance Spot public klines row ${index} was malformed or contained non-numeric OHLCV fields.`
      );
    }
    parsed.push(candle);
  }

  const sorted = parsed.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  const closed = sorted.filter((candle) => candle.isClosed);
  const warnings: string[] = [];
  const droppedIncomplete = sorted.length - closed.length;
  if (droppedIncomplete > 0) {
    warnings.push(`Dropped ${droppedIncomplete} incomplete Binance Spot public candle(s).`);
  }

  const latest = closed.at(-1);
  const freshness = latest
    ? freshnessFromLatest(latest, request.requestedAt)
    : emptyFreshness(request);
  const failClosedReasons: string[] = [];
  if (closed.length < request.lookback) {
    failClosedReasons.push(
      `Binance Spot public returned ${closed.length} closed candle(s); ${request.lookback} are required.`
    );
  }
  if (freshness.status === "stale") {
    failClosedReasons.push("Latest Binance Spot public closed candle is stale for short-horizon research.");
  }
  if (closed.length === 0 && !failClosedReasons.length) {
    failClosedReasons.push("Binance Spot public returned no usable closed candles.");
  }

  const candles = closed.slice(-request.lookback);
  return {
    candles,
    source: BINANCE_SPOT_PUBLIC_SOURCE,
    sourceType: "live",
    provider: BINANCE_SPOT_PUBLIC_PROVIDER,
    productId: buildBinanceSpotSymbol(request.symbol),
    displaySymbol: buildBinanceSpotSymbol(request.symbol),
    candleGranularity: binanceSpotIntervalSeconds(request.interval),
    candleCount: candles.length,
    lastCandleTime: latest?.startTime ?? null,
    fetchedAt,
    freshness,
    warnings,
    failClosedReasons,
    isLive: true,
    isMock: false,
    isFixtureBacked: false
  };
}

function parseBinanceKlineRow(
  row: unknown,
  request: OHLCVFetchRequest,
  requestedAtMs: number
): Candle | undefined {
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
  const startTime = new Date(openTime).toISOString();
  return {
    source: BINANCE_SPOT_PUBLIC_SOURCE,
    sourceType: "live",
    provider: BINANCE_SPOT_PUBLIC_PROVIDER,
    symbol: request.symbol,
    interval: request.interval,
    granularity: binanceSpotIntervalSeconds(request.interval),
    productId: buildBinanceSpotSymbol(request.symbol),
    displaySymbol: buildBinanceSpotSymbol(request.symbol),
    openTime: startTime,
    startTime,
    timestamp: startTime,
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

function freshnessFromLatest(latest: Candle, requestedAt: string): OHLCVFreshness {
  const latestClosedAtMs = Date.parse(latest.startTime) + latest.granularity * 1000;
  const ageMs = Date.parse(requestedAt) - latestClosedAtMs;
  const maxAgeMs = latest.granularity === 60 ? 3 * 60_000 : latest.granularity * 2_000 + 60_000;
  return {
    status: ageMs <= maxAgeMs ? "fresh" : "stale",
    latestStartTime: latest.startTime,
    latestClosedAt: new Date(latestClosedAtMs).toISOString(),
    ageMs,
    maxAgeMs
  };
}

function emptyFreshness(request: OHLCVFetchRequest): OHLCVFreshness {
  const intervalMs = binanceSpotIntervalSeconds(request.interval) * 1000;
  return {
    status: "unknown",
    latestStartTime: null,
    latestClosedAt: null,
    ageMs: null,
    maxAgeMs: intervalMs === 60_000 ? 3 * 60_000 : intervalMs * 2 + 60_000
  };
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalNumeric(value: unknown, field: string, warnings: string[]): number | null {
  if (value === undefined || value === null || value === "") {
    warnings.push(`Binance Spot public ticker ${field} was unavailable.`);
    return null;
  }
  const parsed = toFiniteNumber(value);
  if (parsed === undefined) {
    warnings.push(`Binance Spot public ticker ${field} was non-numeric.`);
    return null;
  }
  return parsed;
}

function withMarketDataProvenance(
  response: Omit<LiveMarketDataResponse, "provenance">
): LiveMarketDataResponse {
  const provenance: MarketDataProvenance = {
    source: response.source,
    sourceType: response.sourceType,
    provider: response.provider,
    productId: response.productId,
    displaySymbol: response.displaySymbol,
    sourceMode: response.sourceType === "fixture" ? "fixture" : "live",
    isLive: response.isLive,
    isMock: response.isMock,
    isFixtureBacked: response.isFixtureBacked,
    fetchedAt: response.fetchedAt,
    candleInterval: response.candleInterval,
    candleGranularity: response.candleGranularity,
    candleCount: response.candleCount,
    lastCandleTime: response.lastCandleTime
  };
  return {
    ...response,
    provenance
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
