"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
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
import type { Candle, OhlcvInterval, ShortWindowMarker, StoredDataSourceType } from "@ept/shared-types";
import type { AppLocale } from "../i18n/dictionaries";
import { useI18n } from "../i18n/useI18n";

type ControlItem = {
  href: string;
  label: string;
  active: boolean;
};

type MarkerSummaryItem = Pick<ShortWindowMarker, "id" | "time" | "price" | "side" | "reason"> & {
  confidence?: number | null | undefined;
};

type Props = {
  displaySymbol: string;
  interval: OhlcvInterval;
  intervalSource: "native" | "derived";
  derivedFrom?: OhlcvInterval | undefined;
  sourceType: StoredDataSourceType;
  providerStatus: string;
  sourceLabel: string;
  candles: Candle[];
  markers: MarkerSummaryItem[];
  warnings: string[];
  error?: string | undefined;
  latestPrice: number | null;
  startReferencePrice: number | null;
  symbolControls: ControlItem[];
  intervalControls: ControlItem[];
  rangeControls: ControlItem[];
  signalToggleHref: string;
  showSignals: boolean;
  locale: AppLocale;
};

export function ProfessionalKlineChart({
  displaySymbol,
  interval,
  intervalSource,
  derivedFrom,
  sourceType,
  providerStatus,
  sourceLabel,
  candles,
  markers,
  warnings,
  error,
  latestPrice,
  startReferencePrice,
  symbolControls,
  intervalControls,
  rangeControls,
  signalToggleHref,
  showSignals,
  locale
}: Props) {
  const { dictionary } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartMarkers = useMemo(() => markers.map(toSeriesMarker), [markers]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0 || error) {
      return;
    }

    const chart = createChart(container, {
      height: 420,
      layout: {
        background: { color: "#ffffff" },
        textColor: "#475569",
        attributionLogo: true
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.14)" },
        horzLines: { color: "rgba(148, 163, 184, 0.14)" }
      },
      rightPriceScale: {
        borderColor: "rgba(15, 23, 42, 0.08)"
      },
      timeScale: {
        borderColor: "rgba(15, 23, 42, 0.08)",
        timeVisible: true,
        secondsVisible: interval === "1m" || interval === "5m" || interval === "10m"
      },
      crosshair: {
        mode: 0
      }
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderUpColor: "#16a34a",
      borderDownColor: "#dc2626",
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
      priceLineVisible: true,
      lastValueVisible: true
    });
    candleSeries.setData(candles.map(toCandleData));

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "rgba(100, 116, 139, 0.32)",
      priceFormat: { type: "volume" },
      priceScaleId: "",
      lastValueVisible: false,
      priceLineVisible: false
    });
    volumeSeries.setData(candles.map(toVolumeData));
    chart.priceScale("").applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0
      }
    });

    const markerApi = createSeriesMarkers(candleSeries, chartMarkers, { autoScale: true });
    markerApi.setMarkers(chartMarkers);
    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => resizeChart(chart, container));
    observer.observe(container);
    resizeChart(chart, container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [candles, chartMarkers, error, interval]);

  return (
    <section
      className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
      data-testid="professional-kline-chart"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-900">
                {dictionary.shortWindow.chartTitle}
              </h2>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${sourceType === "mock" ? "bg-amber-100 text-amber-700" : sourceType === "stored" ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}`}
                data-testid="kline-source-badge"
              >
                {sourceLabel}
              </span>
              {intervalSource === "derived" ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  {dictionary.shortWindow.intervalDerived} · {dictionary.shortWindow.intervalDerivedFrom} {derivedFrom}
                </span>
              ) : null}
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">{dictionary.shortWindow.chartSubtitle}</p>
          </div>

          <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:min-w-[320px]">
            <SummaryStat label={dictionary.common.symbol} value={displaySymbol} />
            <SummaryStat label={dictionary.common.status} value={providerStatus} />
            <SummaryStat label={dictionary.common.latestPrice} value={formatUsd(latestPrice, locale)} />
            <SummaryStat label={dictionary.common.startReference} value={formatUsd(startReferencePrice, locale)} />
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <ControlGroup items={symbolControls} label={dictionary.common.symbol} testId="kline-symbol-selector" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[auto_auto]">
            <ControlGroup items={intervalControls} label={dictionary.common.chartInterval} testId="kline-interval-selector" />
            <ControlGroup items={rangeControls} label={dictionary.common.range} testId="kline-range-selector" />
          </div>
        </div>

        {warnings.length ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {warnings[0]}
          </div>
        ) : null}

        {error ? (
          <div className="flex min-h-[420px] items-center justify-center rounded-[24px] border border-rose-200 bg-rose-50 px-6 text-sm text-rose-700">
            {dictionary.common.error}: {error}
          </div>
        ) : candles.length === 0 ? (
          <div className="grid min-h-[420px] gap-4 rounded-[24px] border border-slate-200 bg-slate-50 p-6">
            <div className="h-6 w-40 animate-pulse rounded-full bg-slate-200" />
            <div className="h-56 animate-pulse rounded-[20px] bg-white shadow-inner" />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="h-16 animate-pulse rounded-2xl bg-white" />
              <div className="h-16 animate-pulse rounded-2xl bg-white" />
              <div className="h-16 animate-pulse rounded-2xl bg-white" />
            </div>
          </div>
        ) : (
          <div
            aria-label="Professional k-line chart"
            className="min-h-[420px] w-full overflow-hidden rounded-[24px] border border-slate-200 bg-white"
            data-testid="kline-chart-canvas"
            ref={containerRef}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
            href={signalToggleHref}
          >
            {showSignals ? dictionary.common.hideRecentSignals : dictionary.common.showRecentSignals}
          </Link>
          {interval === "1d" || interval === "1w" || interval === "1M" ? (
            <p className="text-sm text-slate-500">{dictionary.shortWindow.longHistoryWarning}</p>
          ) : null}
        </div>

        <div className="grid gap-3" data-testid="marker-summary">
          {showSignals && markers.length ? (
            markers.slice(-6).reverse().map((marker) => (
              <div
                className="grid gap-2 rounded-[22px] border border-black/5 bg-slate-50 px-4 py-3 text-sm text-slate-700 lg:grid-cols-[auto_1fr_auto_auto]"
                key={marker.id}
              >
                <span className={`font-semibold ${marker.side === "LONG_UP" ? "text-emerald-700" : marker.side === "LONG_DOWN" ? "text-rose-700" : "text-slate-500"}`}>
                  {marker.side === "LONG_UP" ? dictionary.markers.up : marker.side === "LONG_DOWN" ? dictionary.markers.down : dictionary.markers.rejected}
                </span>
                <span className="truncate text-slate-600">{marker.reason}</span>
                <span>{formatUsd(marker.price ?? null, locale)}</span>
                <span className="text-slate-500">{formatTime(marker.time, locale)}</span>
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              {dictionary.shortWindow.noSignalMarkers}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ControlGroup({
  items,
  label,
  testId
}: {
  items: ControlItem[];
  label: string;
  testId: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <div className="inline-flex flex-wrap gap-1 rounded-full border border-black/5 bg-slate-100 p-1">
        {items.map((item) => (
          <Link
            className={`rounded-full px-3 py-2 text-sm font-medium transition ${item.active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/80"}`}
            href={item.href}
            key={`${label}-${item.label}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function toCandleData(candle: Candle): CandlestickData<UTCTimestamp> {
  return {
    time: toUtc(candle.timestamp),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  };
}

function toVolumeData(candle: Candle): HistogramData<UTCTimestamp> {
  return {
    time: toUtc(candle.timestamp),
    value: candle.volume,
    color: candle.close >= candle.open ? "rgba(34, 197, 94, 0.28)" : "rgba(239, 68, 68, 0.28)"
  };
}

function toSeriesMarker(marker: MarkerSummaryItem): SeriesMarker<UTCTimestamp> {
  const isUp = marker.side === "LONG_UP";
  const isDown = marker.side === "LONG_DOWN";
  return {
    time: toUtc(marker.time),
    position: isUp ? "belowBar" : isDown ? "aboveBar" : "inBar",
    shape: isUp ? "arrowUp" : isDown ? "arrowDown" : "circle",
    color: isUp ? "#16a34a" : isDown ? "#dc2626" : "#94a3b8",
    text: isUp ? "UP" : isDown ? "DOWN" : "",
    size: 1
  };
}

function toUtc(value: string): UTCTimestamp {
  return Math.floor(Date.parse(value) / 1000) as UTCTimestamp;
}

function resizeChart(chart: IChartApi, container: HTMLDivElement) {
  chart.applyOptions({
    width: Math.max(320, container.clientWidth),
    height: 420
  });
}

function formatUsd(value: number | null, locale: AppLocale): string {
  if (value === null || !Number.isFinite(value)) {
    return locale === "zh-CN" ? "待定" : "Pending";
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatTime(value: string, locale: AppLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return locale === "zh-CN" ? "待定" : "Pending";
  }
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
