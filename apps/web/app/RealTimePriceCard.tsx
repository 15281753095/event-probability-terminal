"use client";

import { useEffect, useMemo, useState } from "react";
import type { RealtimeConnectionStatus, RealtimePriceSsePayload, SignalSymbol } from "@ept/shared-types";
import { useI18n } from "./i18n/useI18n";

type Props = {
  symbol: SignalSymbol;
  provider?: "binance";
  title?: string | undefined;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function RealTimePriceCard({ symbol, provider = "binance", title }: Props) {
  const { locale, dictionary } = useI18n();
  const [payload, setPayload] = useState<RealtimePriceSsePayload | null>(null);
  const [status, setStatus] = useState<RealtimeConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const params = useMemo(() => new URLSearchParams({ symbol, provider }), [provider, symbol]);

  useEffect(() => {
    setPayload(null);
    setStatus("connecting");
    setError(null);
    const eventSource = new EventSource(`${apiBaseUrl}/market-data/realtime?${params.toString()}`);
    const handleMessage = (event: MessageEvent<string>) => {
      try {
        const next = JSON.parse(event.data) as RealtimePriceSsePayload & { message?: string };
        setPayload(next);
        setStatus(next.connectionStatus);
        setError(next.message ?? null);
      } catch {
        setStatus("stale");
        setError("Realtime payload parse failed.");
      }
    };
    eventSource.addEventListener("price", handleMessage);
    eventSource.addEventListener("health", handleMessage);
    eventSource.addEventListener("stale", handleMessage);
    eventSource.addEventListener("error", handleMessage);
    eventSource.onerror = () => {
      setStatus((current) => (current === "open" ? "stale" : "failed"));
      setError("Realtime SSE connection error.");
    };
    return () => {
      eventSource.close();
      setStatus("closed");
    };
  }, [params]);

  const displaySymbol = payload?.displaySymbol ?? (symbol === "BTC" ? "BTCUSDT" : "ETHUSDT");
  const sourceLabel = payload?.sourceType === "mock"
    ? dictionary.common.mock
    : payload?.sourceType === "live"
      ? dictionary.common.live
      : dictionary.common.stored;
  const unhealthy = status === "stale" || status === "failed" || status === "closed" || payload?.stale === true;

  return (
    <section
      className={`rounded-[28px] border p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] ${payload?.sourceType === "mock" ? "border-amber-200 bg-amber-50" : unhealthy ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-white"}`}
      data-testid={`realtime-price-card-${symbol}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {title ?? dictionary.common.latestPrice}
          </div>
          <div className="mt-1 text-xl font-semibold text-slate-900">{displaySymbol}</div>
          <div className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950" data-testid={`realtime-price-value-${symbol}`}>
            {formatUsd(payload?.price ?? null, locale)}
          </div>
        </div>
        <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${payload?.sourceType === "mock" ? "border-amber-300 text-amber-700" : unhealthy ? "border-rose-300 text-rose-700" : "border-emerald-300 text-emerald-700"}`}>
          {sourceLabel}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <Metric label={dictionary.common.provider} value={payload?.provider ?? "binance-spot-public"} />
        <Metric label={dictionary.common.status} value={status} testId={`realtime-price-status-${symbol}`} />
        <Metric label="latencyMs" value={formatLatency(payload?.latencyMs ?? null, locale)} testId={`realtime-price-latency-${symbol}`} />
        <Metric label="tick" value={formatTime(payload?.receivedAt ?? null, locale)} />
        <Metric label="bid" value={formatUsd(payload?.bidPrice ?? null, locale)} />
        <Metric label="ask" value={formatUsd(payload?.askPrice ?? null, locale)} />
      </div>
      <div className="mt-3 text-xs text-slate-500">
        stale={String(unhealthy)} checkedAt={payload?.providerHealth.checkedAt ?? "pending"}
      </div>
      {error ? <div className="mt-3 text-xs text-rose-700">{error}</div> : null}
    </section>
  );
}

function Metric({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white/80 px-3 py-2.5" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 break-words font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function formatUsd(value: number | null, locale: string) {
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

function formatLatency(value: number | null, locale: string) {
  return value === null || !Number.isFinite(value)
    ? locale === "zh-CN" ? "待定" : "Pending"
    : `${Math.max(0, Math.round(value))}ms`;
}

function formatTime(value: string | null, locale: string) {
  if (!value) {
    return locale === "zh-CN" ? "待定" : "Pending";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? locale === "zh-CN" ? "待定" : "Pending"
    : new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}
