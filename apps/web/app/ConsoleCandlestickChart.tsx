"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type SeriesMarker,
  type UTCTimestamp
} from "lightweight-charts";
import type { EventSignalConsoleResponse, SignalMarker } from "@ept/shared-types";

type Props = {
  candles: EventSignalConsoleResponse["recentCandles"];
  markers: EventSignalConsoleResponse["recentMarkers"];
};

export function ConsoleCandlestickChart({ candles, markers }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0) {
      return;
    }

    const chart = createChart(container, {
      height: 280,
      layout: {
        background: { color: "#ffffff" },
        textColor: "#334155",
        attributionLogo: true
      },
      grid: {
        vertLines: { color: "#e2e8f0" },
        horzLines: { color: "#e2e8f0" }
      },
      rightPriceScale: {
        borderColor: "#cbd5e1"
      },
      timeScale: {
        borderColor: "#cbd5e1",
        timeVisible: true,
        secondsVisible: false
      },
      crosshair: {
        mode: 0
      }
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#0f766e",
      downColor: "#be123c",
      borderUpColor: "#0f766e",
      borderDownColor: "#be123c",
      wickUpColor: "#0f766e",
      wickDownColor: "#be123c",
      priceLineVisible: false
    });
    candleSeries.setData(candles.map(toCandleData));
    const markerApi = createSeriesMarkers(candleSeries, markers.map(toSeriesMarker), {
      autoScale: true
    });
    markerApi.setMarkers(markers.map(toSeriesMarker));
    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(() => resizeChart(chart, container));
    resizeObserver.observe(container);
    resizeChart(chart, container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [candles, markers]);

  if (candles.length === 0) {
    return (
      <div className="flex min-h-[280px] items-center justify-center border border-border bg-slate-50 text-sm text-slate-600">
        No recent candles available.
      </div>
    );
  }

  return (
    <div
      aria-label="Recent event signal candlestick chart"
      className="min-h-[280px] w-full border border-border bg-white"
      data-testid="event-signal-chart"
      ref={containerRef}
    />
  );
}

function toCandleData(candle: Props["candles"][number]): CandlestickData<UTCTimestamp> {
  return {
    time: toUtcTimestamp(candle.timestamp),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  };
}

function toSeriesMarker(marker: SignalMarker): SeriesMarker<UTCTimestamp> {
  const isLong = marker.direction === "LONG";
  const isShort = marker.direction === "SHORT";
  return {
    time: toUtcTimestamp(marker.time),
    position: isLong ? "belowBar" : isShort ? "aboveBar" : "inBar",
    shape: isLong ? "arrowUp" : isShort ? "arrowDown" : "circle",
    color: isLong ? "#0f766e" : isShort ? "#be123c" : "#64748b",
    text: marker.direction === "LONG" ? "LONG bias" : marker.direction === "SHORT" ? "SHORT bias" : "NO_SIGNAL",
    size: 1
  };
}

function toUtcTimestamp(value: string): UTCTimestamp {
  return Math.floor(Date.parse(value) / 1000) as UTCTimestamp;
}

function resizeChart(chart: IChartApi, container: HTMLDivElement) {
  chart.applyOptions({
    width: Math.max(320, container.clientWidth),
    height: 280
  });
}
