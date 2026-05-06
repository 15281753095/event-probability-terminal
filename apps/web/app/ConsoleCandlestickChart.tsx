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
import type { DataSourceType, EventSignalConsoleResponse, FairValueSignalMarker, SignalMarker } from "@ept/shared-types";

type Props = {
  candles: EventSignalConsoleResponse["recentCandles"];
  markers: EventSignalConsoleResponse["recentMarkers"];
  fairValueMarkers?: FairValueSignalMarker[] | undefined;
  sourceMode?: EventSignalConsoleResponse["sourceMode"];
  sourceType?: DataSourceType;
  emptyReason?: string | undefined;
};

export function ConsoleCandlestickChart({ candles, markers, fairValueMarkers = [], sourceMode = "fixture", sourceType = sourceMode, emptyReason }: Props) {
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
    const chartMarkers = [
      ...markers.map(toSeriesMarker),
      ...fairValueMarkers.map(toFairValueSeriesMarker)
    ];
    const markerApi = createSeriesMarkers(candleSeries, chartMarkers, {
      autoScale: true
    });
    markerApi.setMarkers(chartMarkers);
    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(() => resizeChart(chart, container));
    resizeObserver.observe(container);
    resizeChart(chart, container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [candles, markers, fairValueMarkers, unavailable]);

  if (candles.length === 0 || unavailable) {
    return (
      <div className="flex min-h-[360px] items-center justify-center border border-slate-800 bg-[#070b12] text-sm text-slate-400" data-testid="event-signal-chart-empty">
        {sourceType === "live" ? "Live candles unavailable" : "No recent candles available. The console is fail-closed."}
        {emptyReason ? ` ${emptyReason}` : ""}
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
      <div className="mt-3 grid gap-2" data-testid="strategy-marker-layer">
        {fairValueMarkers.length ? (
          fairValueMarkers.slice(0, 8).map((marker) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300"
              data-testid={`fair-value-marker-${marker.side}`}
              key={marker.id}
            >
              <span className={fairValueTone(marker.side)}>{marker.label}</span>
              <span className="max-w-[760px] truncate text-slate-400">{marker.reason}</span>
              <span className="text-slate-500">{formatMarkerTime(marker.time)}</span>
            </div>
          ))
        ) : (
          <div className="border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-500">
            No fair value markers.
          </div>
        )}
      </div>
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

function toFairValueSeriesMarker(marker: FairValueSignalMarker): SeriesMarker<UTCTimestamp> {
  const longYes = marker.side === "LONG_YES";
  const longNo = marker.side === "LONG_NO";
  const rejected = marker.side === "REJECTED";
  return {
    time: toUtcTimestamp(marker.time),
    position: longYes ? "belowBar" : longNo || rejected ? "aboveBar" : "inBar",
    shape: longYes ? "arrowUp" : longNo ? "arrowDown" : "circle",
    color: longYes ? "#22c55e" : longNo ? "#f43f5e" : rejected ? "#f59e0b" : "#94a3b8",
    text: marker.label,
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

function fairValueTone(side: FairValueSignalMarker["side"]): string {
  if (side === "LONG_YES") {
    return "font-semibold text-emerald-200";
  }
  if (side === "LONG_NO") {
    return "font-semibold text-rose-200";
  }
  if (side === "REJECTED") {
    return "font-semibold text-amber-200";
  }
  return "font-semibold text-slate-200";
}

function formatMarkerTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toISOString().slice(11, 19);
}
