import Fastify from "fastify";
import { createPolymarketPublicReadAdapter } from "@ept/market-ingestor";
import { listResearchSignals } from "@ept/research-signals";
import type {
  ApiErrorResponse,
  BinaryOutcome,
  EventMarket,
  FairValueSnapshot,
  OrderBookLevel,
  OrderBookSnapshot,
  ResearchSignalsResponse,
  ScannerCandidate,
  ScannerMeta,
  SignalHorizon,
  SignalSymbol,
  SourceProvenance,
  TradeCandidate
} from "@ept/shared-types";
import { buildMarketDetailResponse } from "./market-detail.js";
import { localPricingFallback, PricingEngineClient } from "./pricing-client.js";
import { apiError, okMeta } from "./response-contract.js";
import { summarizeRejections } from "./scanner-meta.js";

type AdapterOrderBook = {
  asset_id: string;
  timestamp: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  min_order_size?: string;
  tick_size?: string;
  last_trade_price?: string;
};

type PricingEngineLike = {
  quoteFairValue(market: EventMarket, requestedAt: string): Promise<FairValueSnapshot>;
};

export type BuildServerOptions = {
  logger?: boolean;
  now?: () => string;
  pricingEngine?: PricingEngineLike;
  pricingEngineBaseUrl?: string;
  sourceMode?: SourceProvenance["sourceMode"];
};

export function buildServer(options: BuildServerOptions = {}) {
  const server = Fastify({
    logger: options.logger ?? true
  });
  const sourceMode =
    options.sourceMode ??
    (process.env.POLYMARKET_USE_FIXTURES === "false" ? "live_public" : "fixture");
  const polymarket = createPolymarketPublicReadAdapter({
    sourceMode,
    ...(process.env.POLYMARKET_GAMMA_BASE_URL
      ? { gammaBaseUrl: process.env.POLYMARKET_GAMMA_BASE_URL }
      : {}),
    ...(process.env.POLYMARKET_CLOB_BASE_URL
      ? { clobBaseUrl: process.env.POLYMARKET_CLOB_BASE_URL }
      : {})
  });
  const pricingEngine =
    options.pricingEngine ??
    new PricingEngineClient(
      options.pricingEngineBaseUrl ??
        process.env.PRICING_ENGINE_BASE_URL ??
        "http://127.0.0.1:4100"
    );
  const now = options.now ?? (() => new Date().toISOString());

  server.get("/healthz", async () => {
    return {
      ok: true,
      service: "api-gateway"
    };
  });

  server.get("/markets", async () => {
    const result = await polymarket.discoverEventMarkets({
      assets: ["BTC", "ETH"],
      windows: ["10m", "1h"]
    });

    return {
      markets: stripRaw(result.markets),
      meta: {
        source: "polymarket",
        mode: sourceMode,
        rejectedCount: result.rejected.length,
        rejectionSummary: summarizeRejections(result.rejected),
        uncertainty: result.uncertainty
      }
    };
  });

  server.get<{ Params: { id: string } }>("/markets/:id", async (request, reply) => {
    const market = await polymarket.getMarketById(request.params.id);
    if (!market) {
      return reply.code(404).send(marketNotFound(now()));
    }

    return {
      market: stripRawOne(market)
    };
  });

  server.get<{ Params: { id: string } }>("/markets/:id/book", async (request, reply) => {
    const market = await polymarket.getMarketById(request.params.id);
    if (!market) {
      return reply.code(404).send(marketNotFound(now()));
    }

    const primaryOutcome = market.outcomes.primary;
    const book = await polymarket.getOrderBook(primaryOutcome.tokenId);
    const snapshot = toOrderBookSnapshot(stripRawOne(market), book);

    return {
      market: stripRawOne(market),
      book: snapshot
    };
  });

  server.get<{ Params: { id: string } }>("/markets/:id/detail", async (request, reply) => {
    const result = await polymarket.discoverEventMarkets({
      assets: ["BTC", "ETH"],
      windows: ["10m", "1h"]
    });
    const markets = stripRaw(result.markets);
    const generatedAt = now();
    const market = markets.find((item) => item.id === request.params.id);

    if (!market) {
      return reply.code(404).send(
        marketNotFound(generatedAt, markets.map((item) => item.id))
      );
    }

    const priced = await priceMarket(market, generatedAt, pricingEngine);
    let book: OrderBookSnapshot | undefined;
    try {
      book = toOrderBookSnapshot(market, await polymarket.getOrderBook(market.outcomes.primary.tokenId));
    } catch {
      book = undefined;
    }

    return buildMarketDetailResponse({
      market,
      sourceMode,
      generatedAt,
      candidate: toScannerCandidate(market, priced.fairValue),
      relatedMarkets: markets.filter((item) => item.id !== market.id),
      pricingStatus: priced.pricingStatus,
      ...(book ? { book } : {})
    });
  });

  server.get("/scanner/top", async () => {
    const result = await polymarket.discoverEventMarkets({
      assets: ["BTC", "ETH"],
      windows: ["10m", "1h"]
    });
    const requestedAt = now();
    const markets = stripRaw(result.markets);
    const priced = await Promise.all(
      markets.map(async (market) => ({
        market,
        ...(await priceMarket(market, requestedAt, pricingEngine))
      }))
    );
    const candidates: ScannerCandidate[] = priced.map(({ market, fairValue }) =>
      toScannerCandidate(market, fairValue)
    );
    const usedFallback = priced.some((item) => item.pricingStatus === "local-placeholder-fallback");

    const meta: ScannerMeta = {
      ...okMeta({
        responseKind: "scanner_top",
        generatedAt: requestedAt,
        sourceMode,
        message:
          "Scanner output is read-only. Fair value, confidence, and edge fields are placeholders."
      }),
      pricing: usedFallback ? "local-placeholder-fallback" : "pricing-engine-v0-placeholder",
      rejectedCount: result.rejected.length,
      rejectionSummary: summarizeRejections(result.rejected),
      uncertainty: result.uncertainty
    };

    return {
      candidates,
      meta
    };
  });

  server.get<{ Querystring: { symbol?: string; horizon?: string } }>("/signals/research", async (request, reply) => {
    const generatedAt = now();
    const symbol = parseSignalSymbol(request.query.symbol);
    const horizon = parseSignalHorizon(request.query.horizon);

    if (request.query.symbol && !symbol) {
      return reply.code(400).send(
        apiError({
          status: "unsupported",
          error: "out_of_scope",
          message: "Research signals currently support symbol=BTC or symbol=ETH only.",
          generatedAt
        })
      );
    }
    if (request.query.horizon && !horizon) {
      return reply.code(400).send(
        apiError({
          status: "unsupported",
          error: "out_of_scope",
          message: "Research signals currently support horizon=5m or horizon=10m only.",
          generatedAt
        })
      );
    }

    return listResearchSignals({
      generatedAt,
      ...(symbol ? { symbol } : {}),
      ...(horizon ? { horizon } : {})
    }) satisfies ResearchSignalsResponse;
  });

  return server;
}

function parseSignalSymbol(value?: string): SignalSymbol | undefined {
  return value === "BTC" || value === "ETH" ? value : undefined;
}

function parseSignalHorizon(value?: string): SignalHorizon | undefined {
  return value === "5m" || value === "10m" ? value : undefined;
}

function marketNotFound(generatedAt: string, supportedIds?: string[]): ApiErrorResponse {
  return apiError({
    status: "not_found",
    error: "market_not_found",
    message: "Market not found in current Polymarket public-read adapter result set.",
    generatedAt,
    ...(supportedIds ? { supportedIds } : {})
  });
}

function stripRaw(markets: Array<EventMarket & { raw?: unknown }>): EventMarket[] {
  return markets.map(stripRawOne);
}

function stripRawOne(market: EventMarket & { raw?: unknown }): EventMarket {
  const { raw: _raw, ...clean } = market;
  return clean;
}

async function priceMarket(
  market: EventMarket,
  now: string,
  pricingEngine: PricingEngineLike
): Promise<{ fairValue: FairValueSnapshot; pricingStatus: ScannerMeta["pricing"] }> {
  try {
    return {
      fairValue: await pricingEngine.quoteFairValue(market, now),
      pricingStatus: "pricing-engine-v0-placeholder"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "pricing-engine unavailable";
    return {
      fairValue: localPricingFallback(
        market,
        now,
        `pricing-engine v0 placeholder unavailable: ${message}`
      ),
      pricingStatus: "local-placeholder-fallback"
    };
  }
}

function toScannerCandidate(market: EventMarket, fairValue: FairValueSnapshot): ScannerCandidate {
  return {
    market,
    fairValue,
    tradeCandidate: placeholderTradeCandidate(market.id, market.outcomes.primary, fairValue),
    isPlaceholder: true
  };
}

function toOrderBookSnapshot(market: EventMarket, book: AdapterOrderBook): OrderBookSnapshot {
  return {
    marketId: market.id,
    tokenId: book.asset_id,
    timestamp: book.timestamp,
    bids: book.bids,
    asks: book.asks,
    provenance: market.provenance,
    ...(book.min_order_size ? { minOrderSize: book.min_order_size } : {}),
    ...(book.tick_size ? { tickSize: book.tick_size } : {}),
    ...(book.last_trade_price ? { lastTradePrice: book.last_trade_price } : {})
  };
}

function placeholderTradeCandidate(
  marketId: string,
  outcome: BinaryOutcome,
  fairValue: FairValueSnapshot
): TradeCandidate {
  return {
    marketId,
    outcomeRole: outcome.role,
    outcomeLabel: outcome.label,
    edge: null,
    isPlaceholder: true,
    reason: "No real edge calculation is implemented in this slice.",
    fairValue
  };
}
