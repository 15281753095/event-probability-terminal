import type {
  Candle,
  DataSourceType,
  LiveMarketDataResponse,
  OHLCVFetchRequest,
  OHLCVFetchResult,
  OHLCVFreshness,
  OhlcvInterval,
  ResearchSignalSourceMode,
  SignalSymbol
} from "@ept/shared-types";

export const COINBASE_EXCHANGE_BASE_URL = "https://api.exchange.coinbase.com";
export const COINBASE_EXCHANGE_SOURCE = "coinbase_exchange" as const;

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
}>;

export type CoinbaseExchangeOptions = {
  baseUrl?: string;
  fetcher?: FetchLike;
  timeoutMs?: number;
  extraLookbackCandles?: number;
};

export type LiveMarketDataFetchRequest = {
  symbol: SignalSymbol;
  interval?: OhlcvInterval;
  lookback?: number;
  sourceMode?: ResearchSignalSourceMode;
  requestedAt: string;
};

export type LiveMarketDataFetcher = (
  request: LiveMarketDataFetchRequest
) => Promise<LiveMarketDataResponse>;

type CoinbaseTickerResult = Pick<
  LiveMarketDataResponse,
  | "productId"
  | "latestPrice"
  | "bid"
  | "ask"
  | "tickerTime"
  | "tickerFreshnessSeconds"
  | "tickerVolume"
  | "warnings"
  | "failClosedReasons"
>;

const granularityByInterval = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600
} satisfies Record<OhlcvInterval, number>;

const productBySymbol = {
  BTC: "BTC-USD",
  ETH: "ETH-USD"
} satisfies Record<SignalSymbol, string>;

export async function fetchCoinbaseExchangeCandles(
  request: OHLCVFetchRequest,
  options: CoinbaseExchangeOptions = {}
): Promise<OHLCVFetchResult> {
  const fetchedAt = request.requestedAt;
  if (request.sourceMode !== "live") {
    return emptyFailClosedOHLCVResult(request, fetchedAt, "Coinbase Exchange adapter only supports sourceMode=live.");
  }

  const fetcher = options.fetcher ?? (globalThis.fetch as FetchLike | undefined);
  if (!fetcher) {
    return emptyFailClosedOHLCVResult(request, fetchedAt, "Global fetch is unavailable for Coinbase Exchange OHLCV adapter.");
  }

  const timeoutMs = options.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(buildCandlesUrl(request, options), {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      return emptyFailClosedOHLCVResult(
        request,
        fetchedAt,
        `Coinbase Exchange candles request failed with HTTP ${response.status} ${response.statusText}.`
      );
    }

    const body = await response.json();
    return parseCoinbaseCandles(body, request, fetchedAt);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Coinbase Exchange candles request timed out after ${timeoutMs}ms.`
        : error instanceof Error
          ? `Coinbase Exchange candles request failed: ${error.message}`
          : "Coinbase Exchange candles request failed with an unknown error.";
    return emptyFailClosedOHLCVResult(request, fetchedAt, message);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchCoinbaseExchangeMarketData(
  request: LiveMarketDataFetchRequest,
  options: CoinbaseExchangeOptions = {}
): Promise<LiveMarketDataResponse> {
  const interval = request.interval ?? "1m";
  const lookback = request.lookback ?? 80;
  const sourceMode = request.sourceMode ?? "live";
  if (sourceMode !== "live") {
    return emptyFailClosedLiveMarketData(
      request,
      `Coinbase Exchange live market-data adapter only supports sourceMode=live.`
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
    fetchCoinbaseExchangeTicker(request, options),
    fetchCoinbaseExchangeCandles(candleRequest, options)
  ]);

  const latestCandleTime = candleResult.freshness.latestClosedAt ?? candleResult.candles.at(-1)?.timestamp ?? null;
  const candleFreshnessSeconds =
    candleResult.freshness.ageMs === null ? null : Math.max(0, Math.round(candleResult.freshness.ageMs / 1000));

  return {
    symbol: request.symbol,
    source: "coinbase-exchange",
    sourceType: "live",
    provider: "coinbase-exchange",
    productId: ticker.productId,
    fetchedAt: request.requestedAt,
    latestPrice: ticker.latestPrice,
    bid: ticker.bid,
    ask: ticker.ask,
    tickerTime: ticker.tickerTime,
    tickerFreshnessSeconds: ticker.tickerFreshnessSeconds,
    tickerVolume: ticker.tickerVolume,
    candles: candleResult.candles,
    candleInterval: interval,
    candleGranularity: coinbaseGranularity(interval),
    candleCount: candleResult.candles.length,
    latestCandleTime,
    lastCandleTime: latestCandleTime,
    candleFreshnessSeconds,
    isLive: true,
    isFixtureBacked: false,
    warnings: unique([...ticker.warnings, ...candleResult.warnings]),
    failClosedReasons: unique([...ticker.failClosedReasons, ...candleResult.failClosedReasons])
  };
}

export function emptyFailClosedLiveMarketData(
  request: Pick<LiveMarketDataFetchRequest, "symbol" | "requestedAt"> & Partial<LiveMarketDataFetchRequest>,
  reason: string
): LiveMarketDataResponse {
  return {
    symbol: request.symbol,
    source: "coinbase-exchange",
    sourceType: "live",
    provider: "coinbase-exchange",
    productId: buildCoinbaseProductId(request.symbol),
    fetchedAt: request.requestedAt,
    latestPrice: null,
    bid: null,
    ask: null,
    tickerTime: null,
    tickerFreshnessSeconds: null,
    tickerVolume: null,
    candles: [],
    candleInterval: request.interval ?? "1m",
    candleGranularity: coinbaseGranularity(request.interval ?? "1m"),
    candleCount: 0,
    latestCandleTime: null,
    lastCandleTime: null,
    candleFreshnessSeconds: null,
    isLive: true,
    isFixtureBacked: false,
    warnings: [reason],
    failClosedReasons: [reason]
  };
}

async function fetchCoinbaseExchangeTicker(
  request: LiveMarketDataFetchRequest,
  options: CoinbaseExchangeOptions
): Promise<CoinbaseTickerResult> {
  const productId = buildCoinbaseProductId(request.symbol);
  const fetcher = options.fetcher ?? (globalThis.fetch as FetchLike | undefined);
  if (!fetcher) {
    return emptyTickerResult(productId, "Live data unavailable: global fetch is unavailable for Coinbase Exchange ticker adapter.");
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
        `Live data unavailable: Coinbase Exchange ticker request failed with HTTP ${response.status} ${response.statusText}.`
      );
    }

    const body = await response.json();
    return parseCoinbaseTicker(body, request, productId);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Live data unavailable: Coinbase Exchange ticker request timed out after ${timeoutMs}ms.`
        : error instanceof Error
          ? `Live data unavailable: Coinbase Exchange ticker request failed: ${error.message}`
          : "Live data unavailable: Coinbase Exchange ticker request failed with an unknown error.";
    return emptyTickerResult(productId, message);
  } finally {
    clearTimeout(timeout);
  }
}

export function buildCoinbaseProductId(symbol: SignalSymbol): string {
  return productBySymbol[symbol];
}

export function coinbaseGranularity(interval: OhlcvInterval): number {
  return granularityByInterval[interval];
}

export function emptyFailClosedOHLCVResult(
  request: OHLCVFetchRequest,
  fetchedAt: string,
  reason: string
): OHLCVFetchResult {
  const sourceType: DataSourceType = request.sourceMode === "live" ? "live" : "fixture";
  return {
    candles: [],
    source: COINBASE_EXCHANGE_SOURCE,
    sourceType,
    provider: "coinbase-exchange",
    productId: buildCoinbaseProductId(request.symbol),
    candleGranularity: coinbaseGranularity(request.interval),
    candleCount: 0,
    lastCandleTime: null,
    fetchedAt,
    freshness: emptyFreshness(request),
    warnings: [reason],
    failClosedReasons: [reason],
    isLive: request.sourceMode === "live",
    isFixtureBacked: false
  };
}

function buildCandlesUrl(request: OHLCVFetchRequest, options: CoinbaseExchangeOptions): string {
  const baseUrl = options.baseUrl ?? COINBASE_EXCHANGE_BASE_URL;
  const requestedAtMs = Date.parse(request.requestedAt);
  const intervalMs = intervalMsFor(request.interval);
  const extraLookbackCandles = options.extraLookbackCandles ?? 10;
  const startMs = requestedAtMs - (request.lookback + extraLookbackCandles) * intervalMs;
  const url = new URL(`/products/${buildCoinbaseProductId(request.symbol)}/candles`, baseUrl);
  url.searchParams.set("granularity", String(coinbaseGranularity(request.interval)));
  url.searchParams.set("start", new Date(startMs).toISOString());
  url.searchParams.set("end", new Date(requestedAtMs).toISOString());
  return url.toString();
}

function buildTickerUrl(request: LiveMarketDataFetchRequest, options: CoinbaseExchangeOptions): string {
  const baseUrl = options.baseUrl ?? COINBASE_EXCHANGE_BASE_URL;
  return new URL(`/products/${buildCoinbaseProductId(request.symbol)}/ticker`, baseUrl).toString();
}

function parseCoinbaseTicker(
  body: unknown,
  request: LiveMarketDataFetchRequest,
  productId: string
): CoinbaseTickerResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return emptyTickerResult(productId, "Live data unavailable: Coinbase Exchange ticker response was not an object.");
  }
  const record = body as Record<string, unknown>;
  const latestPrice = toFiniteNumber(record.price);
  if (latestPrice === undefined) {
    return emptyTickerResult(productId, "Live data unavailable: Coinbase Exchange ticker price was missing or non-numeric.");
  }
  const tickerTime = typeof record.time === "string" ? record.time : null;
  const tickerTimeMs = tickerTime ? Date.parse(tickerTime) : Number.NaN;
  if (!tickerTime || Number.isNaN(tickerTimeMs)) {
    return emptyTickerResult(productId, "Live data unavailable: Coinbase Exchange ticker time was missing or invalid.");
  }

  const warnings: string[] = [];
  const bid = optionalNumeric(record.bid, "bid", warnings);
  const ask = optionalNumeric(record.ask, "ask", warnings);
  const tickerVolume = optionalNumeric(record.volume, "volume", warnings);
  const ageSeconds = Math.max(0, Math.round((Date.parse(request.requestedAt) - tickerTimeMs) / 1000));
  return {
    productId,
    latestPrice,
    bid,
    ask,
    tickerTime: new Date(tickerTimeMs).toISOString(),
    tickerFreshnessSeconds: ageSeconds,
    tickerVolume,
    warnings,
    failClosedReasons: []
  };
}

function emptyTickerResult(productId: string, reason: string): CoinbaseTickerResult {
  return {
    productId,
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

function parseCoinbaseCandles(
  body: unknown,
  request: OHLCVFetchRequest,
  fetchedAt: string
): OHLCVFetchResult {
  if (!Array.isArray(body)) {
    return emptyFailClosedOHLCVResult(request, fetchedAt, "Coinbase Exchange candles response was not an array.");
  }

  const warnings: string[] = [];
  const parsed: Candle[] = [];
  const requestedAtMs = Date.parse(request.requestedAt);
  const intervalMs = intervalMsFor(request.interval);

  body.forEach((row, index) => {
    const candle = parseCoinbaseRow(row, request, intervalMs, requestedAtMs);
    if (!candle) {
      warnings.push(`Dropped Coinbase Exchange candle row ${index}: schema or numeric parsing failed.`);
      return;
    }
    parsed.push(candle);
  });

  const sorted = parsed.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  const closed = sorted.filter((candle) => candle.isClosed);
  const droppedIncomplete = sorted.length - closed.length;
  if (droppedIncomplete > 0) {
    warnings.push(`Dropped ${droppedIncomplete} incomplete Coinbase Exchange candle(s).`);
  }

  const latest = closed.at(-1);
  const freshness = latest
    ? freshnessFromLatest(latest, request.requestedAt, intervalMs)
    : emptyFreshness(request);
  const failClosedReasons: string[] = [];
  if (closed.length < request.lookback) {
    failClosedReasons.push(
      `Coinbase Exchange returned ${closed.length} closed candle(s); ${request.lookback} are required.`
    );
  }
  if (freshness.status === "stale") {
    failClosedReasons.push("Latest Coinbase Exchange closed candle is stale for short-horizon research.");
  }
  if (closed.length === 0 && !failClosedReasons.length) {
    failClosedReasons.push("Coinbase Exchange returned no usable closed candles.");
  }

  const candles = closed.slice(-request.lookback);
  return {
    candles,
    source: COINBASE_EXCHANGE_SOURCE,
    sourceType: "live",
    provider: "coinbase-exchange",
    productId: buildCoinbaseProductId(request.symbol),
    candleGranularity: coinbaseGranularity(request.interval),
    candleCount: candles.length,
    lastCandleTime: latest?.startTime ?? null,
    fetchedAt,
    freshness,
    warnings,
    failClosedReasons,
    isLive: true,
    isFixtureBacked: false
  };
}

function parseCoinbaseRow(
  row: unknown,
  request: OHLCVFetchRequest,
  intervalMs: number,
  requestedAtMs: number
): Candle | undefined {
  const values = Array.isArray(row) ? row : row && typeof row === "object" ? objectRow(row) : undefined;
  if (!values) {
    return undefined;
  }
  const [time, low, high, open, close, volume] = values.map(toFiniteNumber);
  if (
    time === undefined ||
    low === undefined ||
    high === undefined ||
    open === undefined ||
    close === undefined ||
    volume === undefined
  ) {
    return undefined;
  }
  const startMs = time * 1000;
  const startTime = new Date(startMs).toISOString();
  return {
    source: COINBASE_EXCHANGE_SOURCE,
    sourceType: "live",
    provider: "coinbase-exchange",
    symbol: request.symbol,
    interval: request.interval,
    granularity: coinbaseGranularity(request.interval),
    productId: buildCoinbaseProductId(request.symbol),
    openTime: startTime,
    startTime,
    timestamp: startTime,
    open,
    high,
    low,
    close,
    volume,
    isLive: true,
    isFixtureBacked: false,
    isClosed: requestedAtMs >= startMs + intervalMs
  };
}

function objectRow(row: object): unknown[] {
  const record = row as Record<string, unknown>;
  return [record.time, record.low, record.high, record.open, record.close, record.volume];
}

function freshnessFromLatest(latest: Candle, requestedAt: string, intervalMs: number): OHLCVFreshness {
  const latestStartMs = Date.parse(latest.startTime);
  const latestClosedAtMs = latestStartMs + intervalMs;
  const ageMs = Date.parse(requestedAt) - latestClosedAtMs;
  const maxAgeMs = intervalMs === 60_000 ? 3 * 60_000 : intervalMs * 2 + 60_000;
  return {
    status: ageMs <= maxAgeMs ? "fresh" : "stale",
    latestStartTime: latest.startTime,
    latestClosedAt: new Date(latestClosedAtMs).toISOString(),
    ageMs,
    maxAgeMs
  };
}

function emptyFreshness(request: OHLCVFetchRequest): OHLCVFreshness {
  return {
    status: "unknown",
    latestStartTime: null,
    latestClosedAt: null,
    ageMs: null,
    maxAgeMs: intervalMsFor(request.interval) === 60_000 ? 3 * 60_000 : intervalMsFor(request.interval) * 2 + 60_000
  };
}

function intervalMsFor(interval: OhlcvInterval): number {
  return granularityByInterval[interval] * 1000;
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalNumeric(value: unknown, field: string, warnings: string[]): number | null {
  if (value === undefined || value === null || value === "") {
    warnings.push(`Coinbase Exchange ticker ${field} was unavailable.`);
    return null;
  }
  const parsed = toFiniteNumber(value);
  if (parsed === undefined) {
    warnings.push(`Coinbase Exchange ticker ${field} was non-numeric.`);
    return null;
  }
  return parsed;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
