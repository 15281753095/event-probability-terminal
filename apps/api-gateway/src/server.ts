import Fastify from "fastify";
import { createPolymarketPublicReadAdapter } from "@ept/market-ingestor";
import {
  buildFixtureEventSignalConsole,
  CONSOLE_CANDLE_LOOKBACK,
  emptyFailClosedBinanceMarketData,
  emptyFailClosedLiveMarketData,
  fetchBinanceSpotMarketData,
  fetchCoinbaseExchangeMarketData,
  buildLiveEventSignalConsole,
  listLiveResearchSignals,
  listResearchSignals,
  type LiveMarketDataFetchRequest,
  type LiveMarketDataFetcher,
  type OHLCVFetcher
} from "@ept/research-signals";
import type {
  ApiErrorResponse,
  BinaryOutcome,
  Candle,
  EventMarket,
  EventSignalConsoleResponse,
  FairValueSnapshot,
  LiveMarketDataResponse,
  LiveMarketDataSource,
  MarketDataProvenance,
  OhlcvSource,
  OhlcvInterval,
  OrderBookLevel,
  OrderBookSnapshot,
  ResearchSignalsResponse,
  ScannerCandidate,
  ScannerMeta,
  ResearchSignalSourceMode,
  SignalHorizon,
  SignalProfileName,
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
  researchSignalOhlcvFetcher?: OHLCVFetcher;
  liveMarketDataFetcher?: LiveMarketDataFetcher;
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
  const liveMarketDataFetcher = buildProviderAwareMarketDataFetcher(options.liveMarketDataFetcher);

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

  server.get<{ Querystring: { symbol?: string; interval?: string; provider?: string } }>("/market-data/live", async (request, reply) => {
    const generatedAt = now();
    const symbol = parseSignalSymbol(request.query.symbol) ?? "BTC";
    const interval = parseOhlcvInterval(request.query.interval) ?? "1m";
    const provider = parseLiveMarketDataProvider(request.query.provider) ?? "binance-spot-public";
    if (request.query.symbol && !parseSignalSymbol(request.query.symbol)) {
      return reply.code(400).send(
        apiError({
          status: "unsupported",
          error: "out_of_scope",
          message: "Live market data currently supports symbol=BTC or symbol=ETH only.",
          generatedAt
        })
      );
    }
    if (request.query.interval && !parseOhlcvInterval(request.query.interval)) {
      return reply.code(400).send(
        apiError({
          status: "unsupported",
          error: "out_of_scope",
          message: "Live market data currently supports interval=1m, 5m, 15m, or 1h only.",
          generatedAt
        })
      );
    }
    if (request.query.provider && !parseLiveMarketDataProvider(request.query.provider)) {
      return reply.code(400).send(
        apiError({
          status: "unsupported",
          error: "out_of_scope",
          message: "Live market data currently supports provider=binance or provider=coinbase only.",
          generatedAt
        })
      );
    }

    try {
      return (await liveMarketDataFetcher({
        symbol,
        interval,
        lookback: CONSOLE_CANDLE_LOOKBACK,
        sourceMode: "live",
        provider,
        requestedAt: generatedAt
      })) satisfies LiveMarketDataResponse;
    } catch (error) {
      return emptyFailClosedMarketDataForProvider(
        provider,
        {
          symbol,
          interval,
          lookback: CONSOLE_CANDLE_LOOKBACK,
          sourceMode: "live",
          requestedAt: generatedAt
        },
        error instanceof Error
          ? `Live data unavailable: live market-data adapter failed: ${error.message}`
          : "Live data unavailable: live market-data adapter failed with an unknown error."
      ) satisfies LiveMarketDataResponse;
    }
  });

  server.get<{ Querystring: { symbol?: string; horizon?: string; sourceMode?: string; profile?: string } }>("/signals/research", async (request, reply) => {
    const generatedAt = now();
    const symbol = parseSignalSymbol(request.query.symbol);
    const horizon = parseSignalHorizon(request.query.horizon);
    const signalSourceMode = parseResearchSignalSourceMode(request.query.sourceMode, "fixture");
    const profileName = parseSignalProfileName(request.query.profile);

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
    if (request.query.sourceMode && !signalSourceMode) {
      return reply.code(400).send(
        apiError({
          status: "unsupported",
          error: "out_of_scope",
          message: "Research signals currently support sourceMode=fixture or sourceMode=live only.",
          generatedAt
        })
      );
    }
    if (request.query.profile && !profileName) {
      return reply.code(400).send(
        apiError({
          status: "unsupported",
          error: "out_of_scope",
          message: "Research signal profile currently supports balanced, conservative, or aggressive only.",
          generatedAt
        })
      );
    }

    if (signalSourceMode === "live") {
      return (await listLiveResearchSignals({
        generatedAt,
        ...(symbol ? { symbol } : {}),
        ...(horizon ? { horizon } : {}),
        ...(profileName ? { profileName } : {}),
        ...(options.researchSignalOhlcvFetcher ? { fetcher: options.researchSignalOhlcvFetcher } : {})
      })) satisfies ResearchSignalsResponse;
    }

    return listResearchSignals({
      generatedAt,
      ...(symbol ? { symbol } : {}),
      ...(horizon ? { horizon } : {}),
      ...(profileName ? { profileName } : {})
    }) satisfies ResearchSignalsResponse;
  });

  server.get<{ Querystring: { symbol?: string; horizon?: string; sourceMode?: string; includeBacktest?: string; includeObservationPreview?: string; profile?: string; provider?: string } }>("/signals/console", async (request, reply) => {
    const generatedAt = now();
    const symbol = parseSignalSymbol(request.query.symbol) ?? "BTC";
    const horizon = parseSignalHorizon(request.query.horizon) ?? "5m";
    const signalSourceMode = parseResearchSignalSourceMode(request.query.sourceMode, "live");
    const profileName = parseSignalProfileName(request.query.profile);
    const provider = parseLiveMarketDataProvider(request.query.provider) ?? "binance-spot-public";
    const includeObservationPreview = request.query.includeObservationPreview === "true" || request.query.includeBacktest === "true";

    if (request.query.symbol && !parseSignalSymbol(request.query.symbol)) {
      return reply.code(400).send(
        apiError({
          status: "unsupported",
          error: "out_of_scope",
          message: "Event Signal Console currently supports symbol=BTC or symbol=ETH only.",
          generatedAt
        })
      );
    }
    if (request.query.horizon && !parseSignalHorizon(request.query.horizon)) {
      return reply.code(400).send(
        apiError({
          status: "unsupported",
          error: "out_of_scope",
          message: "Event Signal Console currently supports horizon=5m or horizon=10m only.",
          generatedAt
        })
      );
    }
    if (request.query.sourceMode && !signalSourceMode) {
      return reply.code(400).send(
        apiError({
          status: "unsupported",
          error: "out_of_scope",
          message: "Event Signal Console currently supports sourceMode=fixture or sourceMode=live only.",
          generatedAt
        })
      );
    }
    if (request.query.profile && !profileName) {
      return reply.code(400).send(
        apiError({
          status: "unsupported",
          error: "out_of_scope",
          message: "Event Signal Console profile currently supports balanced, conservative, or aggressive only.",
          generatedAt
        })
      );
    }
    if (request.query.provider && !parseLiveMarketDataProvider(request.query.provider)) {
      return reply.code(400).send(
        apiError({
          status: "unsupported",
          error: "out_of_scope",
          message: "Event Signal Console currently supports provider=binance or provider=coinbase only.",
          generatedAt
        })
      );
    }

    if (signalSourceMode === "live") {
      return (await buildLiveEventSignalConsole({
        symbol,
        horizon,
        generatedAt,
        includeObservationPreview,
        ...(profileName ? { profileName } : {}),
        provider,
        liveMarketDataFetcher,
        ...(options.researchSignalOhlcvFetcher ? { fetcher: options.researchSignalOhlcvFetcher } : {})
      })) satisfies EventSignalConsoleResponse;
    }

    return buildFixtureEventSignalConsole({
      symbol,
      horizon,
      generatedAt,
      includeObservationPreview,
      ...(profileName ? { profileName } : {})
    }) satisfies EventSignalConsoleResponse;
  });

  return server;
}

function parseSignalSymbol(value?: string): SignalSymbol | undefined {
  return value === "BTC" || value === "ETH" ? value : undefined;
}

function parseOhlcvInterval(value?: string): OhlcvInterval | undefined {
  return value === "1m" || value === "5m" || value === "15m" || value === "1h" ? value : undefined;
}

function parseLiveMarketDataProvider(value?: string): LiveMarketDataSource | undefined {
  if (!value || value === "binance" || value === "binance-spot-public") {
    return "binance-spot-public";
  }
  if (value === "coinbase" || value === "coinbase-exchange") {
    return "coinbase-exchange";
  }
  return undefined;
}

function buildProviderAwareMarketDataFetcher(
  injectedFetcher?: LiveMarketDataFetcher
): LiveMarketDataFetcher {
  return async (request) => {
    if (injectedFetcher) {
      return injectedFetcher(request);
    }
    if (process.env.EPT_LIVE_MARKET_DATA_MOCK === "true") {
      return mockLiveMarketDataFetcher(request);
    }
    return request.provider === "coinbase-exchange"
      ? fetchCoinbaseExchangeMarketData(request)
      : fetchBinanceSpotMarketData(request);
  };
}

function emptyFailClosedMarketDataForProvider(
  provider: LiveMarketDataSource,
  request: Pick<LiveMarketDataFetchRequest, "symbol" | "requestedAt"> & Partial<LiveMarketDataFetchRequest>,
  reason: string
): LiveMarketDataResponse {
  return provider === "coinbase-exchange"
    ? emptyFailClosedLiveMarketData(request, reason)
    : emptyFailClosedBinanceMarketData(request, reason);
}

async function mockLiveMarketDataFetcher(
  request: LiveMarketDataFetchRequest
): Promise<LiveMarketDataResponse> {
  const lookback = request.lookback ?? CONSOLE_CANDLE_LOOKBACK;
  const interval = request.interval ?? "1m";
  const provider: LiveMarketDataSource = request.provider === "coinbase-exchange" ? "coinbase-exchange" : "binance-spot-public";
  const candleSource: OhlcvSource = provider === "coinbase-exchange" ? "coinbase_exchange" : "binance_spot_public";
  const displaySymbol =
    provider === "coinbase-exchange"
      ? request.symbol === "BTC" ? "BTC-USD" : "ETH-USD"
      : request.symbol === "BTC" ? "BTCUSDT" : "ETHUSDT";
  const intervalMs = intervalMsFor(interval);
  const granularity = Math.round(intervalMs / 1000);
  const requestedAtMs = Date.parse(request.requestedAt);
  const latestStartMs = requestedAtMs - intervalMs;
  const base = request.symbol === "BTC" ? 64_000 : 3_100;
  const candles: Candle[] = Array.from({ length: lookback }, (_, index) => {
    const startMs = latestStartMs - (lookback - 1 - index) * intervalMs;
    const trend = index * (request.symbol === "BTC" ? 8 : 0.7);
    const wave = Math.sin(index / 3) * (request.symbol === "BTC" ? 35 : 3.5);
    const open = base + trend + wave;
    const close = open + Math.cos(index / 2) * (request.symbol === "BTC" ? 22 : 2.1);
    const high = Math.max(open, close) + (request.symbol === "BTC" ? 18 : 1.8);
    const low = Math.min(open, close) - (request.symbol === "BTC" ? 18 : 1.8);
    const startTime = new Date(startMs).toISOString();
    return {
      source: candleSource,
      sourceType: "mock" as const,
      provider,
      symbol: request.symbol,
      interval,
      granularity,
      productId: displaySymbol,
      displaySymbol,
      openTime: startTime,
      startTime,
      timestamp: startTime,
      open: roundPrice(open),
      high: roundPrice(high),
      low: roundPrice(low),
      close: roundPrice(close),
      volume: roundPrice(900 + index * 4),
      isLive: false,
      isMock: true,
      isFixtureBacked: false,
      isClosed: true
    };
  });
  const latest = candles.at(-1);
  const latestClose = latest?.close ?? base;
  const latestPrice = roundPrice(latestClose + (request.symbol === "BTC" ? 14 : 1.4));
  return withMarketDataProvenance({
    symbol: request.symbol,
    source: provider,
    sourceType: "mock",
    provider,
    productId: displaySymbol,
    displaySymbol,
    fetchedAt: request.requestedAt,
    latestPrice,
    bid: roundPrice(latestPrice - (request.symbol === "BTC" ? 1.5 : 0.15)),
    ask: roundPrice(latestPrice + (request.symbol === "BTC" ? 1.5 : 0.15)),
    tickerTime: request.requestedAt,
    tickerFreshnessSeconds: 0,
    tickerVolume: roundPrice(100_000 + lookback),
    candles,
    candleInterval: interval,
    candleGranularity: granularity,
    candleCount: candles.length,
    latestCandleTime: latest?.timestamp ?? null,
    lastCandleTime: latest?.timestamp ?? null,
    candleFreshnessSeconds: 0,
    isLive: false,
    isMock: true,
    isFixtureBacked: false,
    warnings: [`DEV ONLY mock ${provider} market data for deterministic local smoke only.`],
    failClosedReasons: []
  });
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

function intervalMsFor(interval: OhlcvInterval): number {
  return interval === "1m" ? 60_000 : interval === "5m" ? 300_000 : interval === "15m" ? 900_000 : 3_600_000;
}

function roundPrice(value: number): number {
  return Number(value.toFixed(2));
}

function parseSignalHorizon(value?: string): SignalHorizon | undefined {
  return value === "5m" || value === "10m" ? value : undefined;
}

function parseResearchSignalSourceMode(
  value?: string,
  defaultMode: ResearchSignalSourceMode = "fixture"
): ResearchSignalSourceMode | undefined {
  if (!value) {
    return defaultMode;
  }
  return value === "fixture" || value === "live" ? value : undefined;
}

function parseSignalProfileName(value?: string): SignalProfileName | undefined {
  if (!value) {
    return "balanced";
  }
  return value === "balanced" || value === "conservative" || value === "aggressive" ? value : undefined;
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
