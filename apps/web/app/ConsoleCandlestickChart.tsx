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
      height: 360,
      layout: {
        background: { color: "#070b12" },
        textColor: "#cbd5e1",
        attributionLogo: true
      },
      grid: {
        vertLines: { color: "#101827" },
        horzLines: { color: "#101827" }
      },
      rightPriceScale: {
        borderColor: "#1e293b"
      },
      timeScale: {
        borderColor: "#1e293b",
        timeVisible: true,
        secondsVisible: false
      },
      crosshair: {
        mode: 0
      }
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#fb7185",
      borderUpColor: "#10b981",
      borderDownColor: "#fb7185",
      wickUpColor: "#5eead4",
      wickDownColor: "#fda4af",
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
      <div className="flex min-h-[360px] items-center justify-center border border-slate-800 bg-[#070b12] text-sm text-slate-400">
        No recent candles available. The console is fail-closed.
      </div>
    );
  }

  return (
    <div
      aria-label="Recent event signal candlestick chart"
      className="min-h-[360px] w-full border border-slate-800 bg-[#070b12]"
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
    color: isLong ? "#22c55e" : isShort ? "#f43f5e" : "#94a3b8",
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
    height: 360
  });
}
