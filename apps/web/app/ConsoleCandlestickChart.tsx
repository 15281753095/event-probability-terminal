"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type SeriesMarker,
  type UTCTimestamp
} from "lightweight-charts";
import type { DataSourceType, EventSignalConsoleResponse, SignalMarker } from "@ept/shared-types";

type Props = {
  candles: EventSignalConsoleResponse["recentCandles"];
  markers: EventSignalConsoleResponse["recentMarkers"];
  sourceMode?: EventSignalConsoleResponse["sourceMode"];
  sourceType?: DataSourceType;
};

export function ConsoleCandlestickChart({ candles, markers, sourceMode = "fixture", sourceType = sourceMode }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const unavailable = sourceType === "live" && candles.length === 0;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0 || unavailable) {
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
        borderColor: "#273244"
      },
      timeScale: {
        borderColor: "#273244",
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
      priceLineVisible: true,
      lastValueVisible: true
    });
    candleSeries.setData(candles.map(toCandleData));
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#64748b",
      priceFormat: {
        type: "volume"
      },
      priceScaleId: "",
      lastValueVisible: false,
      priceLineVisible: false
    });
    volumeSeries.setData(candles.map(toVolumeData));
    chart.priceScale("").applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0
      }
    });
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
  }, [candles, markers, unavailable]);

  if (candles.length === 0 || unavailable) {
    return (
      <div className="flex min-h-[360px] items-center justify-center border border-slate-800 bg-[#070b12] text-sm text-slate-400" data-testid="event-signal-chart-empty">
        {sourceType === "live" ? "Live candles unavailable" : "No recent candles available. The console is fail-closed."}
      </div>
    );
  }

  return (
    <div data-testid="console-candlestick-chart">
      <div
        aria-label="Recent event signal candlestick chart"
        className="min-h-[360px] w-full border border-slate-800 bg-[#070b12]"
        data-testid="event-signal-chart"
        ref={containerRef}
        style={{ minHeight: 360 }}
      />
    </div>
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

function toVolumeData(candle: Props["candles"][number]): HistogramData<UTCTimestamp> {
  const up = candle.close >= candle.open;
  return {
    time: toUtcTimestamp(candle.timestamp),
    value: candle.volume,
    color: up ? "rgba(16, 185, 129, 0.32)" : "rgba(244, 63, 94, 0.32)"
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
    text: marker.direction === "LONG" ? "LONG BIAS" : marker.direction === "SHORT" ? "SHORT BIAS" : "NO_SIGNAL",
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
