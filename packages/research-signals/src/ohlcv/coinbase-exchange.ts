import type {
  Candle,
  OHLCVFetchRequest,
  OHLCVFetchResult,
  OHLCVFreshness,
  OhlcvInterval,
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

const granularityByInterval = {
  "1m": 60,
  "5m": 300
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
  return {
    candles: [],
    source: COINBASE_EXCHANGE_SOURCE,
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

  return {
    candles: closed.slice(-request.lookback),
    source: COINBASE_EXCHANGE_SOURCE,
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
    symbol: request.symbol,
    interval: request.interval,
    startTime,
    timestamp: startTime,
    open,
    high,
    low,
    close,
    volume,
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
