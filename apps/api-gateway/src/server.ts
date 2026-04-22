import Fastify from "fastify";
import { createPolymarketPublicReadAdapter } from "@ept/market-ingestor";
import type {
  BinaryOutcome,
  EventMarket,
  FairValueSnapshot,
  OrderBookSnapshot,
  ScannerCandidate,
  TradeCandidate
} from "@ept/shared-types";
import { localPricingFallback, PricingEngineClient } from "./pricing-client.js";

export function buildServer() {
  const server = Fastify({
    logger: true
  });
  const polymarket = createPolymarketPublicReadAdapter({
    sourceMode: process.env.POLYMARKET_USE_FIXTURES === "false" ? "live_public" : "fixture",
    ...(process.env.POLYMARKET_GAMMA_BASE_URL
      ? { gammaBaseUrl: process.env.POLYMARKET_GAMMA_BASE_URL }
      : {}),
    ...(process.env.POLYMARKET_CLOB_BASE_URL
      ? { clobBaseUrl: process.env.POLYMARKET_CLOB_BASE_URL }
      : {})
  });
  const pricingEngine = new PricingEngineClient(
    process.env.PRICING_ENGINE_BASE_URL ?? "http://127.0.0.1:4100"
  );

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
        mode: process.env.POLYMARKET_USE_FIXTURES === "false" ? "live_public" : "fixture",
        rejectedCount: result.rejected.length,
        uncertainty: result.uncertainty
      }
    };
  });

  server.get<{ Params: { id: string } }>("/markets/:id", async (request, reply) => {
    const market = await polymarket.getMarketById(request.params.id);
    if (!market) {
      return reply.code(404).send({
        error: "market_not_found",
        message: "Market not found in current Polymarket public-read adapter result set."
      });
    }

    return {
      market: stripRawOne(market)
    };
  });

  server.get<{ Params: { id: string } }>("/markets/:id/book", async (request, reply) => {
    const market = await polymarket.getMarketById(request.params.id);
    if (!market) {
      return reply.code(404).send({
        error: "market_not_found",
        message: "Market not found in current Polymarket public-read adapter result set."
      });
    }

    const primaryOutcome = market.outcomes.primary;
    const book = await polymarket.getOrderBook(primaryOutcome.tokenId);
    const snapshot: OrderBookSnapshot = {
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

    return {
      market: stripRawOne(market),
      book: snapshot
    };
  });

  server.get("/scanner/top", async () => {
    const result = await polymarket.discoverEventMarkets({
      assets: ["BTC", "ETH"],
      windows: ["10m", "1h"]
    });
    const now = new Date().toISOString();
    const markets = stripRaw(result.markets);
    const priced = await Promise.all(
      markets.map(async (market) => {
        try {
          return {
            market,
            fairValue: await pricingEngine.quoteFairValue(market, now),
            pricingStatus: "pricing-engine-v0-placeholder" as const
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "pricing-engine unavailable";
          return {
            market,
            fairValue: localPricingFallback(
              market,
              now,
              `pricing-engine v0 placeholder unavailable: ${message}`
            ),
            pricingStatus: "local-placeholder-fallback" as const
          };
        }
      })
    );
    const candidates: ScannerCandidate[] = priced.map(({ market, fairValue }) => ({
      market,
      fairValue,
      tradeCandidate: placeholderTradeCandidate(market.id, market.outcomes.primary, fairValue),
      isPlaceholder: true
    }));
    const usedFallback = priced.some((item) => item.pricingStatus === "local-placeholder-fallback");

    return {
      candidates,
      meta: {
        source: "polymarket",
        mode: process.env.POLYMARKET_USE_FIXTURES === "false" ? "live_public" : "fixture",
        pricing: usedFallback ? "local-placeholder-fallback" : "pricing-engine-v0-placeholder",
        message:
          "Scanner output is read-only. Fair value, confidence, and edge fields are placeholders."
      }
    };
  });

  return server;
}

function stripRaw(markets: Array<EventMarket & { raw?: unknown }>): EventMarket[] {
  return markets.map(stripRawOne);
}

function stripRawOne(market: EventMarket & { raw?: unknown }): EventMarket {
  const { raw: _raw, ...clean } = market;
  return clean;
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
