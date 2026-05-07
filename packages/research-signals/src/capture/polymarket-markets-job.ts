import type { SignalSymbol } from "@ept/shared-types";
import { fetchBinanceSpotMarketData, type BinanceSpotOptions } from "../ohlcv/binance-spot.js";
import { findCryptoEventMarkets } from "../polymarket/gamma.js";
import { marketSnapshotFromBoundMarket } from "../store/index.js";
import type { CaptureJobContext, CaptureJobResult } from "./types.js";
import { recordCaptureJobRun, shouldUseMockCapture } from "./types.js";

export async function runPolymarketMarketsCaptureJob(context: CaptureJobContext): Promise<CaptureJobResult> {
  await context.store.init();
  const startedAt = context.now?.() ?? new Date().toISOString();
  const useMock = shouldUseMockCapture(context);
  const warnings: string[] = [];
  try {
    const realtimeUnderlyingPrice = useMock
      ? { BTC: 64_250, ETH: 3_180 }
      : await loadUnderlyingPrices({ context, checkedAt: startedAt, warnings });
    const activeMarkets = await findCryptoEventMarkets({
      symbol: "ALL",
      limit: 20,
      now: () => startedAt,
      realtimeUnderlyingPrice,
      useMock,
      ...(context.fetcher ? { fetcher: context.fetcher } : {}),
      ...(context.timeoutMs !== undefined ? { timeoutMs: context.timeoutMs } : {})
    });
    warnings.push(...activeMarkets.warnings, ...activeMarkets.failClosedReasons);
    const summary = await context.store.insertMarketSnapshots(
      activeMarkets.markets.map((market) => marketSnapshotFromBoundMarket(market, activeMarkets.checkedAt))
    );
    return recordCaptureJobRun({
      store: context.store,
      jobName: "polymarket-markets",
      startedAt,
      sourceType: activeMarkets.sourceType,
      summary,
      warnings,
      now: context.now
    });
  } catch (error) {
    return recordCaptureJobRun({
      store: context.store,
      jobName: "polymarket-markets",
      startedAt,
      sourceType: useMock ? "mock" : "live",
      summary: { recordsInserted: 0, recordsUpdated: 0, recordsSkipped: 0 },
      warnings,
      errorMessage: error instanceof Error ? error.message : "Polymarket markets capture failed.",
      now: context.now
    });
  }
}

async function loadUnderlyingPrices(input: {
  context: CaptureJobContext;
  checkedAt: string;
  warnings: string[];
}): Promise<Partial<Record<SignalSymbol, number | null>>> {
  const entries = await Promise.all((["BTC", "ETH"] as const).map(async (symbol) => {
    try {
      const data = await fetchBinanceSpotMarketData({
        symbol,
        interval: "1m",
        lookback: 5,
        sourceMode: "live",
        provider: "binance-spot-public",
        requestedAt: input.checkedAt
      }, spotOptions(input.context));
      input.warnings.push(...data.warnings, ...data.failClosedReasons);
      return [symbol, data.latestPrice] as const;
    } catch (error) {
      input.warnings.push(error instanceof Error ? `Binance underlying price unavailable for ${symbol}: ${error.message}` : `Binance underlying price unavailable for ${symbol}.`);
      return [symbol, null] as const;
    }
  }));
  return Object.fromEntries(entries) as Partial<Record<SignalSymbol, number | null>>;
}

function spotOptions(context: CaptureJobContext): BinanceSpotOptions {
  return {
    ...(context.fetcher ? { fetcher: context.fetcher } : {}),
    ...(context.timeoutMs !== undefined ? { timeoutMs: context.timeoutMs } : {})
  };
}
