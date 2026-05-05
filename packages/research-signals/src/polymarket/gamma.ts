import type { BoundEventMarket, EventMarketCandidate, PolymarketActiveMarketsResponse, ProviderHealth, SignalSymbol } from "@ept/shared-types";
import type { FetchLike } from "../ohlcv/types.js";
import { buildEventMarketOdds } from "./clob-public.js";
import { bindMarketToUnderlying, inferSymbols, mapGammaMarketToCandidate } from "./market-mapper.js";
import { loadMockPolymarketActiveMarkets } from "./mock-fixture.js";
import type { FindCryptoEventMarketsInput, FindCryptoEventMarketsResult, GammaMarketRecord, PolymarketSymbolFilter } from "./types.js";

export const POLYMARKET_GAMMA_PUBLIC_BASE_URL = "https://gamma-api.polymarket.com";

export async function fetchActivePolymarketMarkets(
  options: FindCryptoEventMarketsInput = {}
): Promise<EventMarketCandidate[]> {
  const limit = options.limit ?? 20;
  const payload = await fetchGammaMarkets({
    ...options,
    searchParams: {
      active: "true",
      closed: "false",
      limit: String(Math.min(100, limit * 3))
    }
  });
  const candidates = payload.flatMap((market) => {
    const mapped = mapGammaMarketToCandidate({ market });
    return mapped.candidate ? [mapped.candidate] : [];
  });
  return filterCryptoCandidates(candidates, options.symbol ?? "ALL").slice(0, limit);
}

export async function searchPolymarketMarkets(
  query: string,
  options: FindCryptoEventMarketsInput = {}
): Promise<EventMarketCandidate[]> {
  const url = new URL("/public-search", options.gammaBaseUrl ?? POLYMARKET_GAMMA_PUBLIC_BASE_URL);
  url.searchParams.set("q", query);
  const payload = await fetchJson<unknown>(url, options);
  const records = extractPublicSearchMarkets(payload);
  return records.flatMap((market) => {
    const mapped = mapGammaMarketToCandidate({ market });
    return mapped.candidate ? [mapped.candidate] : [];
  });
}

export async function findCryptoEventMarkets(
  input: FindCryptoEventMarketsInput = {}
): Promise<FindCryptoEventMarketsResult> {
  const checkedAt = input.now?.() ?? new Date().toISOString();
  const symbol = input.symbol ?? "ALL";
  if (input.useMock || process.env.EPT_LIVE_MARKET_DATA_MOCK === "true" || process.env.EPT_POLYMARKET_MOCK === "true") {
    return buildMockResponse(symbol, checkedAt, input.realtimeUnderlyingPrice);
  }

  const warnings: string[] = [];
  const failClosedReasons: string[] = [];
  let candidates: EventMarketCandidate[] = [];
  try {
    const [active, btcSearch, ethSearch] = await Promise.all([
      fetchActivePolymarketMarkets(input),
      symbol === "ETH" ? Promise.resolve([]) : searchPolymarketMarkets("Bitcoin BTC active", input).catch((error) => {
        warnings.push(error instanceof Error ? `Polymarket public-search BTC failed: ${error.message}` : "Polymarket public-search BTC failed.");
        return [];
      }),
      symbol === "BTC" ? Promise.resolve([]) : searchPolymarketMarkets("Ethereum ETH active", input).catch((error) => {
        warnings.push(error instanceof Error ? `Polymarket public-search ETH failed: ${error.message}` : "Polymarket public-search ETH failed.");
        return [];
      })
    ]);
    candidates = uniqueCandidates([...active, ...btcSearch, ...ethSearch]).filter((candidate) => isActiveOpen(candidate));
  } catch (error) {
    failClosedReasons.push(error instanceof Error ? `Polymarket Gamma public discovery failed: ${error.message}` : "Polymarket Gamma public discovery failed.");
  }

  const filtered = filterCryptoCandidates(candidates, symbol).slice(0, input.limit ?? 20);
  const markets = await bindCandidates(filtered, input, "live");
  if (markets.length === 0) {
    warnings.push(`No active BTC/ETH Polymarket markets found for symbol=${symbol}.`);
  }
  return {
    symbol,
    checkedAt,
    sourceType: "live",
    providerHealth: providerHealth({
      sourceType: "live",
      status: failClosedReasons.length ? "failed" : markets.length ? "ok" : "degraded",
      checkedAt,
      marketCount: markets.length,
      failClosedReasons
    }),
    realtimeUnderlyingPrice: {
      BTC: input.realtimeUnderlyingPrice?.BTC ?? null,
      ETH: input.realtimeUnderlyingPrice?.ETH ?? null
    },
    markets,
    warnings,
    failClosedReasons
  };
}

async function bindCandidates(
  candidates: EventMarketCandidate[],
  input: FindCryptoEventMarketsInput,
  sourceType: "live" | "mock" | "fixture"
): Promise<BoundEventMarket[]> {
  const markets: BoundEventMarket[] = [];
  for (const candidate of candidates) {
    try {
      const odds = await buildEventMarketOdds(candidate, {
        ...input,
        sourceType
      });
      markets.push(bindMarketToUnderlying({
        candidate,
        odds,
        realtimeUnderlyingPrice: input.realtimeUnderlyingPrice
      }));
    } catch (error) {
      const odds = await buildEventMarketOdds({
        ...candidate,
        outcomePrices: candidate.outcomePrices
      }, {
        ...input,
        sourceType: "mock"
      });
      odds.failClosedReasons.push(error instanceof Error ? error.message : "Market binding failed.");
      markets.push(bindMarketToUnderlying({
        candidate,
        odds,
        realtimeUnderlyingPrice: input.realtimeUnderlyingPrice
      }));
    }
  }
  return markets;
}

function buildMockResponse(
  symbol: PolymarketSymbolFilter,
  checkedAt: string,
  realtimeUnderlyingPrice?: Partial<Record<SignalSymbol, number | null>>
): PolymarketActiveMarketsResponse {
  const fixture = loadMockPolymarketActiveMarkets();
  const candidates = process.env.EPT_POLYMARKET_MOCK_EMPTY === "true" ? [] : filterCryptoCandidates(fixture.markets, symbol);
  const markets = candidates.map((candidate) => {
    const [yes, no] = candidate.outcomePrices;
    const spread = candidate.liquidity !== undefined && candidate.liquidity < 100 ? 0.12 : 0.02;
    return bindMarketToUnderlying({
      candidate,
      odds: {
        marketId: candidate.marketId,
        question: candidate.question,
        tokenIdYes: candidate.clobTokenIds[0] ?? null,
        tokenIdNo: candidate.clobTokenIds[1] ?? null,
        yesPrice: yes ?? null,
        noPrice: no ?? null,
        yesMidpoint: yes ?? null,
        noMidpoint: no ?? null,
        spread,
        bestBidYes: yes !== undefined ? Number(Math.max(0, yes - spread / 2).toFixed(4)) : undefined,
        bestAskYes: yes !== undefined ? Number(Math.min(1, yes + spread / 2).toFixed(4)) : undefined,
        impliedProbabilityYes: yes ?? null,
        impliedProbabilityNo: no ?? null,
        liquidityStatus: candidate.liquidity !== undefined && candidate.liquidity < 100 ? "thin" : "ok",
        sourceType: "mock",
        provider: "mock",
        checkedAt,
        failClosedReasons: candidate.resolutionSource ? [] : ["Resolution source/rule is not confirmed."]
      },
      realtimeUnderlyingPrice
    });
  });
  return {
    symbol,
    checkedAt,
    sourceType: "mock",
    providerHealth: providerHealth({
      sourceType: "mock",
      status: "ok",
      checkedAt,
      marketCount: markets.length,
      failClosedReasons: []
    }),
    realtimeUnderlyingPrice: {
      BTC: realtimeUnderlyingPrice?.BTC ?? 64_250,
      ETH: realtimeUnderlyingPrice?.ETH ?? 3_180
    },
    markets,
    warnings: [
      "DEV ONLY mock Polymarket active market odds for deterministic local smoke only.",
      ...(markets.length === 0 ? [`No active BTC/ETH Polymarket markets found for symbol=${symbol}.`] : [])
    ],
    failClosedReasons: []
  };
}

async function fetchGammaMarkets(input: FindCryptoEventMarketsInput & { searchParams: Record<string, string> }): Promise<GammaMarketRecord[]> {
  const url = new URL("/markets", input.gammaBaseUrl ?? POLYMARKET_GAMMA_PUBLIC_BASE_URL);
  for (const [key, value] of Object.entries(input.searchParams)) {
    url.searchParams.set(key, value);
  }
  const payload = await fetchJson<unknown>(url, input);
  return Array.isArray(payload) ? payload.filter(isRecord) : [];
}

async function fetchJson<T>(url: URL, options: FindCryptoEventMarketsInput): Promise<T> {
  const fetcher = options.fetcher ?? (globalThis.fetch as FetchLike | undefined);
  if (!fetcher) {
    throw new Error("Global fetch is unavailable for Polymarket Gamma public adapter.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);
  try {
    const response = await fetcher(url.toString(), {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

function extractPublicSearchMarkets(payload: unknown): GammaMarketRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) {
    return [];
  }
  const candidates = [payload.markets, payload.events, payload.results].filter(Array.isArray).flat() as unknown[];
  return candidates.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    if (Array.isArray(item.markets)) {
      return item.markets.filter(isRecord);
    }
    return [item];
  });
}

function filterCryptoCandidates(candidates: EventMarketCandidate[], symbol: PolymarketSymbolFilter): EventMarketCandidate[] {
  return candidates.filter((candidate) => {
    const symbols = inferSymbols(candidate);
    if (symbol === "ALL") {
      return symbols.length > 0;
    }
    return symbols.length === 1 && symbols[0] === symbol;
  });
}

function isActiveOpen(candidate: EventMarketCandidate): boolean {
  return candidate.active && !candidate.closed && candidate.archived !== true;
}

function uniqueCandidates(candidates: EventMarketCandidate[]): EventMarketCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.marketId)) {
      return false;
    }
    seen.add(candidate.marketId);
    return true;
  });
}

function providerHealth(input: {
  sourceType: "live" | "mock";
  status: ProviderHealth["status"];
  checkedAt: string;
  marketCount: number;
  failClosedReasons: string[];
}): ProviderHealth {
  return {
    requestedProvider: input.sourceType === "mock" ? "mock" : "polymarket",
    resolvedProvider: input.sourceType === "mock" ? "mock" : "polymarket-gamma",
    sourceType: input.sourceType,
    status: input.status,
    latencyMs: null,
    candleCount: input.marketCount,
    expectedMinCandles: 0,
    lastCandleTime: null,
    isFixtureBacked: false,
    fallbackUsed: false,
    fallbackReason: null,
    failClosedReasons: input.failClosedReasons,
    checkedAt: input.checkedAt
  };
}

function isRecord(value: unknown): value is GammaMarketRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
