import type { OhlcvCandle, SignalFeatureSnapshot } from "@ept/shared-types";

export type IndicatorOptions = {
  emaFastPeriod?: number;
  emaSlowPeriod?: number;
  rsiPeriod?: number;
  macdFastPeriod?: number;
  macdSlowPeriod?: number;
  macdSignalPeriod?: number;
  bollingerPeriod?: number;
  bollingerStdDev?: number;
  atrPeriod?: number;
  volumePeriod?: number;
};

const defaultOptions = {
  emaFastPeriod: 8,
  emaSlowPeriod: 21,
  rsiPeriod: 14,
  macdFastPeriod: 12,
  macdSlowPeriod: 26,
  macdSignalPeriod: 9,
  bollingerPeriod: 20,
  bollingerStdDev: 2,
  atrPeriod: 14,
  volumePeriod: 20
} satisfies Required<IndicatorOptions>;

export function buildFeatureSnapshot(
  candles: OhlcvCandle[],
  options: IndicatorOptions = {}
): SignalFeatureSnapshot {
  const config = { ...defaultOptions, ...options };
  const closes = candles.map((candle) => candle.close);
  const volumes = candles.map((candle) => candle.volume);
  const fastEma = emaSeries(closes, config.emaFastPeriod);
  const slowEma = emaSeries(closes, config.emaSlowPeriod);
  const macd = macdSnapshot(closes, {
    fastPeriod: config.macdFastPeriod,
    slowPeriod: config.macdSlowPeriod,
    signalPeriod: config.macdSignalPeriod
  });
  const bollinger = bollingerSnapshot(closes, config.bollingerPeriod, config.bollingerStdDev);
  const volume = volumeSnapshot(volumes, config.volumePeriod);
  const realizedVolatility = realizedVolatilitySnapshot(closes, config.atrPeriod);
  const atr = atrSnapshot(candles, config.atrPeriod);
  const lastClose = last(closes);
  const atrRatio = lastClose === 0 ? 0 : atr / lastClose;

  return {
    lastClose,
    returns: {
      oneMinute: periodReturn(closes, 1),
      threeMinute: periodReturn(closes, 3),
      fiveMinute: periodReturn(closes, 5)
    },
    ema: {
      fast: last(fastEma),
      slow: last(slowEma),
      slope: slope(fastEma)
    },
    rsi: {
      value: rsiSnapshot(closes, config.rsiPeriod),
      period: config.rsiPeriod
    },
    macd,
    bollinger,
    volatility: {
      atr,
      realizedVolatility,
      regime: atrRatio > 0.006 || realizedVolatility > 0.004 ? "high" : atrRatio < 0.002 ? "low" : "normal"
    },
    volume
  };
}

export function emaSeries(values: number[], period: number): number[] {
  assertSeries(values, 1, "ema");
  const alpha = 2 / (period + 1);
  const result: number[] = [values[0] as number];
  for (let index = 1; index < values.length; index += 1) {
    const previous = result[index - 1] as number;
    const value = values[index] as number;
    result.push(value * alpha + previous * (1 - alpha));
  }
  return result;
}

export function rsiSnapshot(values: number[], period: number): number {
  assertSeries(values, period + 1, "rsi");
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const delta = (values[index] as number) - (values[index - 1] as number);
    gain += Math.max(delta, 0);
    loss += Math.max(-delta, 0);
  }
  let averageGain = gain / period;
  let averageLoss = loss / period;

  for (let index = period + 1; index < values.length; index += 1) {
    const delta = (values[index] as number) - (values[index - 1] as number);
    averageGain = (averageGain * (period - 1) + Math.max(delta, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-delta, 0)) / period;
  }

  if (averageLoss === 0) {
    return 100;
  }
  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

export function macdSnapshot(
  values: number[],
  input: { fastPeriod: number; slowPeriod: number; signalPeriod: number }
) {
  assertSeries(values, input.slowPeriod + input.signalPeriod, "macd");
  const fast = emaSeries(values, input.fastPeriod);
  const slow = emaSeries(values, input.slowPeriod);
  const macdLine = fast.map((item, index) => item - (slow[index] as number));
  const signal = emaSeries(macdLine, input.signalPeriod);
  const histogram = macdLine.map((item, index) => item - (signal[index] as number));

  return {
    line: last(macdLine),
    signal: last(signal),
    histogram: last(histogram),
    histogramSlope: slope(histogram)
  };
}

export function bollingerSnapshot(values: number[], period: number, multiplier: number) {
  assertSeries(values, period + 1, "bollinger");
  const currentWindow = values.slice(-period);
  const previousWindow = values.slice(-(period + 1), -1);
  const middle = mean(currentWindow);
  const sigma = standardDeviation(currentWindow);
  const upper = middle + multiplier * sigma;
  const lower = middle - multiplier * sigma;
  const width = upper - lower;
  const previousMiddle = mean(previousWindow);
  const previousWidth = multiplier * 2 * standardDeviation(previousWindow);
  const bandwidth = middle === 0 ? 0 : width / middle;
  const previousBandwidth = previousMiddle === 0 ? 0 : previousWidth / previousMiddle;

  return {
    middle,
    upper,
    lower,
    bandwidth,
    bandPosition: width === 0 ? 0.5 : (last(values) - lower) / width,
    squeeze: bandwidth < 0.012,
    expansion: bandwidth > previousBandwidth * 1.08
  };
}

export function atrSnapshot(candles: OhlcvCandle[], period: number): number {
  assertSeries(candles, period + 1, "atr");
  const trueRanges: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index] as OhlcvCandle;
    const previous = candles[index - 1] as OhlcvCandle;
    trueRanges.push(
      Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previous.close),
        Math.abs(candle.low - previous.close)
      )
    );
  }
  return mean(trueRanges.slice(-period));
}

export function realizedVolatilitySnapshot(values: number[], period: number): number {
  assertSeries(values, period + 1, "realized volatility");
  const returns = values.slice(-(period + 1)).flatMap((value, index, window) => {
    if (index === 0) {
      return [];
    }
    const previous = window[index - 1] as number;
    return previous === 0 ? [0] : [Math.log(value / previous)];
  });
  return standardDeviation(returns);
}

export function volumeSnapshot(values: number[], period: number) {
  assertSeries(values, period, "volume");
  const window = values.slice(-period);
  const latest = last(values);
  const average = mean(window);
  const sigma = standardDeviation(window);
  const zScore = sigma === 0 ? 0 : (latest - average) / sigma;

  return {
    latest,
    mean: average,
    zScore,
    abnormal: Math.abs(zScore) >= 1.5
  };
}

function periodReturn(values: number[], period: number): number | null {
  if (values.length <= period) {
    return null;
  }
  const previous = values[values.length - 1 - period] as number;
  if (previous === 0) {
    return null;
  }
  return (last(values) - previous) / previous;
}

function slope(values: number[]): number {
  assertSeries(values, 2, "slope");
  return last(values) - (values[values.length - 2] as number);
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function last<T>(values: T[]): T {
  assertSeries(values, 1, "last");
  return values[values.length - 1] as T;
}

function assertSeries<T>(values: T[], minLength: number, label: string): void {
  if (values.length < minLength) {
    throw new Error(`${label} requires at least ${minLength} values`);
  }
}
