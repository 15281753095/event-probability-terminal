import type { Candle, OhlcvInterval } from "@ept/shared-types";
import { binanceSpotIntervalSeconds } from "./binance-spot.js";

export type AggregateCandlesResult = {
  candles: Candle[];
  warnings: string[];
};

export function aggregateCandlesToInterval(input: {
  candles: Candle[];
  targetInterval: OhlcvInterval;
}): AggregateCandlesResult {
  if (input.candles.length === 0) {
    return { candles: [], warnings: [] };
  }

  const sorted = [...input.candles].sort((left, right) => Date.parse(left.openTime) - Date.parse(right.openTime));
  const sourceInterval = sorted[0]?.interval ?? "1m";
  const sourceMs = binanceSpotIntervalSeconds(sourceInterval) * 1000;
  const targetMs = binanceSpotIntervalSeconds(input.targetInterval) * 1000;
  if (targetMs <= sourceMs || targetMs % sourceMs !== 0) {
    return {
      candles: [],
      warnings: [`Cannot derive ${input.targetInterval} candles from ${sourceInterval} candles.`]
    };
  }

  const expectedPerBucket = Math.max(1, Math.round(targetMs / sourceMs));
  const warnings: string[] = [];
  const aggregated: Candle[] = [];
  let activeBucketStartMs: number | null = null;
  let bucket: Candle[] = [];

  const flush = () => {
    if (activeBucketStartMs === null || bucket.length === 0) {
      return;
    }
    if (bucket.length < expectedPerBucket) {
      warnings.push(`Derived ${input.targetInterval} candle at ${new Date(activeBucketStartMs).toISOString()} used ${bucket.length}/${expectedPerBucket} source candles.`);
    }
    const first = bucket[0]!;
    const last = bucket[bucket.length - 1]!;
    aggregated.push({
      ...first,
      interval: input.targetInterval,
      granularity: Math.round(targetMs / 1000),
      openTime: new Date(activeBucketStartMs).toISOString(),
      startTime: new Date(activeBucketStartMs).toISOString(),
      timestamp: new Date(activeBucketStartMs).toISOString(),
      open: first.open,
      high: Math.max(...bucket.map((item) => item.high)),
      low: Math.min(...bucket.map((item) => item.low)),
      close: last.close,
      volume: Number(bucket.reduce((sum, item) => sum + item.volume, 0).toFixed(8)),
      isClosed: bucket.every((item) => item.isClosed)
    });
    bucket = [];
    activeBucketStartMs = null;
  };

  for (let index = 0; index < sorted.length; index += 1) {
    const candle = sorted[index]!;
    const candleMs = Date.parse(candle.openTime);
    const bucketStartMs = Math.floor(candleMs / targetMs) * targetMs;
    const previous = sorted[index - 1];
    if (previous) {
      const previousMs = Date.parse(previous.openTime);
      if (candleMs - previousMs > sourceMs) {
        warnings.push(`Missing ${sourceInterval} candle gap before ${candle.openTime}.`);
      }
    }
    if (activeBucketStartMs === null) {
      activeBucketStartMs = bucketStartMs;
    }
    if (bucketStartMs !== activeBucketStartMs) {
      flush();
      activeBucketStartMs = bucketStartMs;
    }
    bucket.push(candle);
  }
  flush();

  return {
    candles: aggregated,
    warnings: unique(warnings)
  };
}

export function intervalMsForOhlcv(interval: OhlcvInterval): number {
  return binanceSpotIntervalSeconds(interval) * 1000;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
