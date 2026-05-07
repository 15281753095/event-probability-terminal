import type { Candle, LiveMarketDataResponse, SignalSymbol } from "@ept/shared-types";
import { buildFairValueSignalResponse } from "../fair-value/edge.js";
import { emptyFailClosedBinanceMarketData, fetchBinanceSpotMarketData, type BinanceSpotOptions } from "../ohlcv/binance-spot.js";
import { findCryptoEventMarkets } from "../polymarket/gamma.js";
import { fairValueSignalRecordsFromResponse } from "../store/index.js";
import { buildMockCandles } from "./binance-candles-job.js";
import type { CaptureJobContext, CaptureJobResult } from "./types.js";
import { recordCaptureJobRun, shouldUseMockCapture } from "./types.js";

export async function runFairValueSignalsCaptureJob(context: CaptureJobContext): Promise<CaptureJobResult> {
  await context.store.init();
  const startedAt = context.now?.() ?? new Date().toISOString();
  const useMock = shouldUseMockCapture(context);
  const warnings: string[] = [];
  try {
    const marketData = useMock
      ? buildMockMarketData(startedAt)
      : await loadMarketData({ context, checkedAt: startedAt, warnings });
    const currentPriceBySymbol = mapValues(marketData, (data) => data.latestPrice);
    const activeMarkets = await findCryptoEventMarkets({
      symbol: "ALL",
      limit: 20,
      now: () => startedAt,
      realtimeUnderlyingPrice: currentPriceBySymbol,
      useMock,
      ...(context.fetcher ? { fetcher: context.fetcher } : {}),
      ...(context.timeoutMs !== undefined ? { timeoutMs: context.timeoutMs } : {})
    });
    warnings.push(...activeMarkets.warnings, ...activeMarkets.failClosedReasons);
    const response = buildFairValueSignalResponse({
      symbol: "ALL",
      checkedAt: startedAt,
      sourceType: activeMarkets.sourceType,
      providerHealth: activeMarkets.providerHealth,
      markets: activeMarkets.markets,
      candlesBySymbol: mapValues(marketData, (data) => data.candles),
      currentPriceBySymbol,
      horizonSeconds: 5 * 60,
      feesBps: 0,
      slippageBps: 25,
      minEdgeBps: 250,
      maxSpread: 0.08,
      minLiquidityStatus: "ok",
      warnings: [
        ...warnings,
        ...Object.values(marketData).flatMap((data) => data.warnings),
        ...Object.values(marketData).flatMap((data) => data.failClosedReasons)
      ]
    });
    const summary = await context.store.insertFairValueSignals(fairValueSignalRecordsFromResponse(response));
    return recordCaptureJobRun({
      store: context.store,
      jobName: "fair-value-signals",
      startedAt,
      sourceType: response.sourceType,
      summary,
      warnings: response.warnings,
      now: context.now
    });
  } catch (error) {
    return recordCaptureJobRun({
      store: context.store,
      jobName: "fair-value-signals",
      startedAt,
      sourceType: useMock ? "mock" : "live",
      summary: { recordsInserted: 0, recordsUpdated: 0, recordsSkipped: 0 },
      warnings,
      errorMessage: error instanceof Error ? error.message : "Fair-value signal capture failed.",
      now: context.now
    });
  }
}

async function loadMarketData(input: {
  context: CaptureJobContext;
  checkedAt: string;
  warnings: string[];
}): Promise<Record<SignalSymbol, LiveMarketDataResponse>> {
  const entries = await Promise.all((["BTC", "ETH"] as const).map(async (symbol) => {
    try {
      const data = await fetchBinanceSpotMarketData({
        symbol,
        interval: "1m",
        lookback: 120,
        sourceMode: "live",
        provider: "binance-spot-public",
        requestedAt: input.checkedAt
      }, spotOptions(input.context));
      input.warnings.push(...data.warnings, ...data.failClosedReasons);
      return [symbol, data] as const;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      return [symbol, emptyFailClosedBinanceMarketData({
        symbol,
        interval: "1m",
        lookback: 120,
        sourceMode: "live",
        provider: "binance-spot-public",
        requestedAt: input.checkedAt
      }, `Binance fair-value capture data unavailable: ${reason}`)] as const;
    }
  }));
  return Object.fromEntries(entries) as Record<SignalSymbol, LiveMarketDataResponse>;
}

function spotOptions(context: CaptureJobContext): BinanceSpotOptions {
  return {
    ...(context.fetcher ? { fetcher: context.fetcher } : {}),
    ...(context.timeoutMs !== undefined ? { timeoutMs: context.timeoutMs } : {})
  };
}

function buildMockMarketData(checkedAt: string): Record<SignalSymbol, Pick<LiveMarketDataResponse, "latestPrice" | "candles" | "warnings" | "failClosedReasons">> {
  const btcCandles = buildMockCandles({ symbol: "BTC", interval: "1m", checkedAt, count: 120 });
  const ethCandles = buildMockCandles({ symbol: "ETH", interval: "1m", checkedAt, count: 120 });
  return {
    BTC: mockMarketData("BTC", btcCandles),
    ETH: mockMarketData("ETH", ethCandles)
  } as Record<SignalSymbol, LiveMarketDataResponse>;
}

function mockMarketData(symbol: SignalSymbol, candles: Candle[]): Pick<LiveMarketDataResponse, "latestPrice" | "candles" | "warnings" | "failClosedReasons"> {
  return {
    latestPrice: candles.at(-1)?.close ?? (symbol === "BTC" ? 64_250 : 3_180),
    candles,
    warnings: ["DEV ONLY mock fair-value capture market data."],
    failClosedReasons: []
  };
}

function mapValues<T, U>(
  input: Record<SignalSymbol, T>,
  mapper: (value: T) => U
): Record<SignalSymbol, U> {
  return Object.fromEntries((Object.entries(input) as Array<[SignalSymbol, T]>).map(([key, value]) => [key, mapper(value)])) as Record<SignalSymbol, U>;
}
