import type { EventMarketCandidate, EventMarketOdds, PolymarketLiquidityStatus } from "@ept/shared-types";
import type { FetchLike } from "../ohlcv/types.js";
import type { PolymarketOrderBook, PolymarketPublicOptions } from "./types.js";

export const POLYMARKET_CLOB_PUBLIC_BASE_URL = "https://clob.polymarket.com";

export async function fetchPolymarketOrderBook(
  tokenId: string,
  options: PolymarketPublicOptions = {}
): Promise<PolymarketOrderBook> {
  if (!tokenId) {
    throw new Error("Polymarket CLOB public orderbook requires tokenId.");
  }
  const url = new URL("/book", options.clobBaseUrl ?? POLYMARKET_CLOB_PUBLIC_BASE_URL);
  url.searchParams.set("token_id", tokenId);
  return fetchJson<PolymarketOrderBook>(url, options);
}

export async function fetchPolymarketMidpoint(
  tokenId: string,
  options: PolymarketPublicOptions = {}
): Promise<number | null> {
  if (!tokenId) {
    throw new Error("Polymarket CLOB public midpoint requires tokenId.");
  }
  const url = new URL("/midpoint", options.clobBaseUrl ?? POLYMARKET_CLOB_PUBLIC_BASE_URL);
  url.searchParams.set("token_id", tokenId);
  const payload = await fetchJson<Record<string, unknown>>(url, options);
  return numberValue(payload.mid_price ?? payload.mid ?? payload.midpoint) ?? null;
}

export async function fetchPolymarketSpread(
  tokenId: string,
  options: PolymarketPublicOptions = {}
): Promise<number | null> {
  if (!tokenId) {
    throw new Error("Polymarket CLOB public spread requires tokenId.");
  }
  const url = new URL("/spread", options.clobBaseUrl ?? POLYMARKET_CLOB_PUBLIC_BASE_URL);
  url.searchParams.set("token_id", tokenId);
  const payload = await fetchJson<Record<string, unknown>>(url, options);
  return numberValue(payload.spread) ?? null;
}

export async function fetchPolymarketPrice(
  tokenId: string,
  side = "BUY",
  options: PolymarketPublicOptions = {}
): Promise<number | null> {
  if (!tokenId) {
    throw new Error("Polymarket CLOB public price requires tokenId.");
  }
  const url = new URL("/price", options.clobBaseUrl ?? POLYMARKET_CLOB_PUBLIC_BASE_URL);
  url.searchParams.set("token_id", tokenId);
  url.searchParams.set("side", side);
  const payload = await fetchJson<Record<string, unknown>>(url, options);
  return numberValue(payload.price) ?? null;
}

export async function buildEventMarketOdds(
  candidate: EventMarketCandidate,
  options: PolymarketPublicOptions & { sourceType?: "live" | "mock" | "fixture" } = {}
): Promise<EventMarketOdds> {
  const checkedAt = options.now?.() ?? new Date().toISOString();
  const [tokenIdYes, tokenIdNo] = candidate.clobTokenIds;
  const [yesOutcomePrice, noOutcomePrice] = candidate.outcomePrices;
  const failClosedReasons: string[] = [];
  if (!tokenIdYes || !tokenIdNo) {
    failClosedReasons.push("Cannot build CLOB odds: binary CLOB token IDs are missing.");
  }

  let yesBook: PolymarketOrderBook | undefined;
  let noBook: PolymarketOrderBook | undefined;
  let yesMidpoint: number | null = null;
  let noMidpoint: number | null = null;
  let yesSpread: number | null = null;
  let noSpread: number | null = null;
  let yesPublicPrice: number | null = null;
  let noPublicPrice: number | null = null;

  if (tokenIdYes && tokenIdNo && options.sourceType !== "mock" && options.sourceType !== "fixture") {
    try {
      [yesBook, noBook, yesMidpoint, noMidpoint, yesSpread, noSpread] = await Promise.all([
        fetchPolymarketOrderBook(tokenIdYes, options),
        fetchPolymarketOrderBook(tokenIdNo, options),
        fetchPolymarketMidpoint(tokenIdYes, options),
        fetchPolymarketMidpoint(tokenIdNo, options),
        fetchPolymarketSpread(tokenIdYes, options),
        fetchPolymarketSpread(tokenIdNo, options)
      ]);
      [yesPublicPrice, noPublicPrice] = await Promise.all([
        fetchPolymarketPrice(tokenIdYes, "BUY", options).catch(() => null),
        fetchPolymarketPrice(tokenIdNo, "BUY", options).catch(() => null)
      ]);
    } catch (error) {
      failClosedReasons.push(error instanceof Error ? `CLOB public odds unavailable: ${error.message}` : "CLOB public odds unavailable.");
    }
  }

  const bestBidYes = bestBid(yesBook);
  const bestAskYes = bestAsk(yesBook);
  const bestBidNo = bestBid(noBook);
  const bestAskNo = bestAsk(noBook);
  const yesPrice = firstNumber(yesMidpoint, midpointFromBook(yesBook), yesPublicPrice, yesOutcomePrice);
  const noPrice = firstNumber(noMidpoint, midpointFromBook(noBook), noPublicPrice, noOutcomePrice);
  const spread = firstNumber(maxSpread(yesSpread, noSpread), spreadFromBook(yesBook), spreadFromBook(noBook), candidate.liquidity !== undefined ? null : undefined);
  const liquidityStatus = liquidityStatusFor({ yesBook, noBook, spread, liquidity: candidate.liquidity });

  if (yesPrice === null || noPrice === null) {
    failClosedReasons.push("Odds unavailable: CLOB and Gamma outcome price fallback did not provide binary prices.");
  }
  if ((yesMidpoint === null || noMidpoint === null) && candidate.outcomePrices.length > 0) {
    failClosedReasons.push("Using Gamma outcomePrices fallback because CLOB midpoint/spread was unavailable.");
  }

  return {
    marketId: candidate.marketId,
    question: candidate.question,
    tokenIdYes: tokenIdYes ?? null,
    tokenIdNo: tokenIdNo ?? null,
    yesPrice,
    noPrice,
    yesMidpoint,
    noMidpoint,
    spread,
    ...(bestBidYes !== undefined ? { bestBidYes } : {}),
    ...(bestAskYes !== undefined ? { bestAskYes } : {}),
    ...(bestBidNo !== undefined ? { bestBidNo } : {}),
    ...(bestAskNo !== undefined ? { bestAskNo } : {}),
    impliedProbabilityYes: yesPrice,
    impliedProbabilityNo: noPrice,
    liquidityStatus,
    sourceType: options.sourceType ?? "live",
    provider: options.sourceType === "mock" ? "mock" : "polymarket-clob-public",
    checkedAt,
    failClosedReasons: unique(failClosedReasons)
  };
}

function bestBid(book: PolymarketOrderBook | undefined): number | undefined {
  return bestLevel(book?.bids, "bid");
}

function bestAsk(book: PolymarketOrderBook | undefined): number | undefined {
  return bestLevel(book?.asks, "ask");
}

function bestLevel(levels: PolymarketOrderBook["bids"], side: "bid" | "ask"): number | undefined {
  const values = (levels ?? []).map((level) => numberValue(level.price)).filter((value): value is number => value !== undefined);
  if (!values.length) {
    return undefined;
  }
  return side === "bid" ? Math.max(...values) : Math.min(...values);
}

function midpointFromBook(book: PolymarketOrderBook | undefined): number | null {
  const bid = bestBid(book);
  const ask = bestAsk(book);
  return bid !== undefined && ask !== undefined ? round((bid + ask) / 2) : null;
}

function spreadFromBook(book: PolymarketOrderBook | undefined): number | null {
  const bid = bestBid(book);
  const ask = bestAsk(book);
  return bid !== undefined && ask !== undefined ? round(Math.max(0, ask - bid)) : null;
}

function maxSpread(...values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return valid.length ? Math.max(...valid) : null;
}

function liquidityStatusFor(input: {
  yesBook?: PolymarketOrderBook | undefined;
  noBook?: PolymarketOrderBook | undefined;
  spread: number | null;
  liquidity?: number | undefined;
}): PolymarketLiquidityStatus {
  const hasBook = Boolean(input.yesBook?.bids?.length && input.yesBook?.asks?.length && input.noBook?.bids?.length && input.noBook?.asks?.length);
  const observedEmptyBook = Boolean(input.yesBook || input.noBook) && !hasBook;
  if (input.spread !== null && input.spread > 0.08) {
    return "thin";
  }
  if (observedEmptyBook) {
    return "unknown";
  }
  if (input.liquidity !== undefined && input.liquidity < 100) {
    return "thin";
  }
  if (hasBook || (input.liquidity !== undefined && input.liquidity >= 100)) {
    return "ok";
  }
  return "unknown";
}

async function fetchJson<T>(url: URL, options: PolymarketPublicOptions): Promise<T> {
  const fetcher = options.fetcher ?? (globalThis.fetch as FetchLike | undefined);
  if (!fetcher) {
    throw new Error("Global fetch is unavailable for Polymarket CLOB public adapter.");
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

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function firstNumber(...values: Array<number | null | undefined>): number | null {
  const value = values.find((item) => item !== null && item !== undefined && Number.isFinite(item));
  return value === undefined ? null : value;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
