import type { Candle, OhlcvInterval, SignalSymbol } from "@ept/shared-types";
import { fetchBinanceHistoricalKlines } from "../ohlcv/binance-history.js";
import { binanceSpotIntervalSeconds, buildBinanceSpotSymbol } from "../ohlcv/binance-spot.js";
import { underlyingCandleFromCandle } from "../store/index.js";
import type { CaptureJobContext, CaptureJobResult } from "./types.js";
import { mergeSummaries, recordCaptureJobRun, shouldUseMockCapture } from "./types.js";

const symbols: SignalSymbol[] = ["BTC", "ETH"];
const intervals: OhlcvInterval[] = ["1m", "5m", "15m", "1h"];
const CAPTURE_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

export async function runBinanceCandlesCaptureJob(context: CaptureJobContext): Promise<CaptureJobResult> {
  await context.store.init();
  const startedAt = context.now?.() ?? new Date().toISOString();
  const sourceType = shouldUseMockCapture(context) ? "mock" : "live";
  const warnings: string[] = [];
  try {
    const summaries = [];
    for (const symbol of symbols) {
      for (const interval of intervals) {
        const candles = sourceType === "mock"
          ? buildMockCandles({ symbol, interval, checkedAt: startedAt, count: 120 })
          : await fetchLiveCandles({ context, symbol, interval, checkedAt: startedAt, warnings });
        summaries.push(await context.store.insertUnderlyingCandles(candles.map(underlyingCandleFromCandle)));
      }
    }
    warnings.push("Binance candle capture covers 1d/3d/1w/1m coverage queries from the same local candle table.");
    return recordCaptureJobRun({
      store: context.store,
      jobName: "binance-candles",
      startedAt,
      sourceType,
      summary: mergeSummaries(summaries),
      warnings,
      now: context.now
    });
  } catch (error) {
    return recordCaptureJobRun({
      store: context.store,
      jobName: "binance-candles",
      startedAt,
      sourceType,
      summary: { recordsInserted: 0, recordsUpdated: 0, recordsSkipped: 0 },
      warnings,
      errorMessage: error instanceof Error ? error.message : "Binance candles capture failed.",
      now: context.now
    });
  }
}

export function buildMockCandles(input: {
  symbol: SignalSymbol;
  interval: OhlcvInterval;
  checkedAt: string;
  count: number;
}): Candle[] {
  const intervalSeconds = binanceSpotIntervalSeconds(input.interval);
  const endMs = Math.floor(Date.parse(input.checkedAt) / (intervalSeconds * 1000)) * intervalSeconds * 1000;
  const base = input.symbol === "BTC" ? 64_000 : 3_100;
  return Array.from({ length: input.count }, (_, index) => {
    const openMs = endMs - (input.count - index) * intervalSeconds * 1000;
    const drift = input.symbol === "BTC" ? index * 3.5 : index * 0.35;
    const wave = Math.sin(index / 5) * (input.symbol === "BTC" ? 24 : 2.4);
    const open = round(base + drift + wave);
    const close = round(open + Math.cos(index / 4) * (input.symbol === "BTC" ? 9 : 0.9));
    const high = round(Math.max(open, close) + (input.symbol === "BTC" ? 18 : 1.8));
    const low = round(Math.min(open, close) - (input.symbol === "BTC" ? 18 : 1.8));
    const timestamp = new Date(openMs).toISOString();
    return {
      source: "binance_spot_public",
      sourceType: "mock",
      provider: "binance-spot-public",
      symbol: input.symbol,
      interval: input.interval,
      granularity: intervalSeconds,
      productId: buildBinanceSpotSymbol(input.symbol),
      displaySymbol: buildBinanceSpotSymbol(input.symbol),
      openTime: timestamp,
      startTime: timestamp,
      timestamp,
      open,
      high,
      low,
      close,
      volume: round(100 + index * 0.5),
      isLive: false,
      isMock: true,
      isFixtureBacked: false,
      isClosed: true
    };
  });
}

async function fetchLiveCandles(input: {
  context: CaptureJobContext;
  symbol: SignalSymbol;
  interval: OhlcvInterval;
  checkedAt: string;
  warnings: string[];
}): Promise<Candle[]> {
  const result = await fetchBinanceHistoricalKlines({
    symbol: input.symbol,
    interval: input.interval,
    lookback: "1m",
    startTime: new Date(Date.parse(input.checkedAt) - (input.context.binanceLookbackMs ?? CAPTURE_LOOKBACK_MS)).toISOString(),
    endTime: input.checkedAt,
    requestedAt: input.checkedAt
  }, {
    fetcher: input.context.fetcher,
    timeoutMs: input.context.timeoutMs,
    maxPages: input.context.binanceMaxPages ?? 3
  });
  input.warnings.push(...result.warnings, ...result.failClosedReasons);
  return result.candles;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
