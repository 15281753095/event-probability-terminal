import type { ProviderHealth } from "@ept/shared-types";
import type { FetchLike } from "../ohlcv/types.js";
import { POLYMARKET_CLOB_PUBLIC_BASE_URL } from "./clob-public.js";

export type PolymarketPriceHistoryInterval = "1h" | "6h" | "1d" | "1w" | "1m";

export type PolymarketPricePoint = {
  t: number;
  p: number;
};

export type PolymarketPriceHistoryRequest = {
  tokenId: string | null | undefined;
  interval?: PolymarketPriceHistoryInterval | undefined;
  startTs?: number | undefined;
  endTs?: number | undefined;
  requestedAt: string;
};

export type PolymarketPriceHistoryOptions = {
  clobBaseUrl?: string | undefined;
  fetcher?: FetchLike | undefined;
  timeoutMs?: number | undefined;
};

export type PolymarketPriceHistoryResult = {
  tokenId: string | null;
  history: PolymarketPricePoint[];
  providerHealth: ProviderHealth;
  warnings: string[];
  failClosedReasons: string[];
};

export async function fetchPolymarketPriceHistory(
  request: PolymarketPriceHistoryRequest,
  options: PolymarketPriceHistoryOptions = {}
): Promise<PolymarketPriceHistoryResult> {
  const tokenId = request.tokenId?.trim() || null;
  if (!tokenId) {
    return emptyResult(request, "Polymarket CLOB public prices-history requires tokenId.");
  }
  const fetcher = options.fetcher ?? (globalThis.fetch as FetchLike | undefined);
  if (!fetcher) {
    return emptyResult(request, "Global fetch is unavailable for Polymarket CLOB public prices-history adapter.");
  }

  const timeoutMs = options.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(buildPriceHistoryUrl(request, tokenId, options), {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      return emptyResult(request, `Polymarket CLOB public prices-history failed with HTTP ${response.status} ${response.statusText}.`);
    }
    const parsed = parsePriceHistoryPayload(await response.json());
    if (parsed.failClosedReasons.length) {
      return {
        tokenId,
        history: [],
        providerHealth: providerHealth(request, 0, parsed.failClosedReasons),
        warnings: parsed.failClosedReasons,
        failClosedReasons: parsed.failClosedReasons
      };
    }
    return {
      tokenId,
      history: parsed.history,
      providerHealth: providerHealth(request, parsed.history.length, []),
      warnings: parsed.history.length ? [] : ["Polymarket CLOB public prices-history returned no price points."],
      failClosedReasons: parsed.history.length ? [] : ["Polymarket CLOB public prices-history returned no price points."]
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Polymarket CLOB public prices-history timed out after ${timeoutMs}ms.`
        : error instanceof Error
          ? `Polymarket CLOB public prices-history failed: ${error.message}`
          : "Polymarket CLOB public prices-history failed with an unknown error.";
    return emptyResult(request, message);
  } finally {
    clearTimeout(timeout);
  }
}

export function priceAtOrBeforeHistory(
  history: PolymarketPricePoint[],
  isoTime: string
): number | null {
  const targetSeconds = Math.floor(Date.parse(isoTime) / 1000);
  if (!Number.isFinite(targetSeconds)) {
    return null;
  }
  const point = [...history]
    .filter((item) => item.t <= targetSeconds)
    .sort((a, b) => b.t - a.t)[0];
  return point?.p ?? null;
}

function buildPriceHistoryUrl(
  request: PolymarketPriceHistoryRequest,
  tokenId: string,
  options: PolymarketPriceHistoryOptions
): string {
  const url = new URL("/prices-history", options.clobBaseUrl ?? POLYMARKET_CLOB_PUBLIC_BASE_URL);
  url.searchParams.set("market", tokenId);
  if (request.interval) {
    url.searchParams.set("interval", request.interval);
  }
  if (request.startTs !== undefined) {
    url.searchParams.set("startTs", String(request.startTs));
  }
  if (request.endTs !== undefined) {
    url.searchParams.set("endTs", String(request.endTs));
  }
  return url.toString();
}

function parsePriceHistoryPayload(payload: unknown): { history: PolymarketPricePoint[]; failClosedReasons: string[] } {
  const raw = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.history) ? payload.history : [];
  if (!Array.isArray(raw)) {
    return { history: [], failClosedReasons: ["Polymarket CLOB public prices-history response was not an array."] };
  }
  const history: PolymarketPricePoint[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    const t = isRecord(item) ? numberValue(item.t ?? item.time ?? item.timestamp) : undefined;
    const p = isRecord(item) ? numberValue(item.p ?? item.price) : undefined;
    if (t === undefined || p === undefined) {
      return {
        history: [],
        failClosedReasons: [`Polymarket CLOB public prices-history row ${index} was malformed.`]
      };
    }
    history.push({ t, p });
  }
  return {
    history: history.sort((a, b) => a.t - b.t),
    failClosedReasons: []
  };
}

function emptyResult(request: PolymarketPriceHistoryRequest, reason: string): PolymarketPriceHistoryResult {
  return {
    tokenId: request.tokenId?.trim() || null,
    history: [],
    providerHealth: providerHealth(request, 0, [reason]),
    warnings: [reason],
    failClosedReasons: [reason]
  };
}

function providerHealth(
  request: PolymarketPriceHistoryRequest,
  count: number,
  failClosedReasons: string[]
): ProviderHealth {
  return {
    requestedProvider: "polymarket",
    resolvedProvider: "polymarket-clob-public",
    sourceType: "live",
    status: failClosedReasons.length ? "failed" : count ? "ok" : "degraded",
    latencyMs: null,
    candleCount: count,
    expectedMinCandles: 0,
    lastCandleTime: null,
    isFixtureBacked: false,
    fallbackUsed: false,
    fallbackReason: null,
    failClosedReasons,
    checkedAt: request.requestedAt
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
