"use client";

import { useEffect, useMemo, useState } from "react";
import type { RealtimeConnectionStatus, RealtimePriceSsePayload, SignalSymbol } from "@ept/shared-types";
import { useI18n } from "../i18n/useI18n";

type Props = {
  symbol: SignalSymbol;
  initialPrice: number | null;
  endTime: string;
  initialSecondsRemaining: number;
  initialSourceType: "live" | "mock" | "stored";
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function ShortWindowRuntimePanel({
  symbol,
  initialPrice,
  endTime,
  initialSecondsRemaining,
  initialSourceType
}: Props) {
  const { locale, dictionary } = useI18n();
  const [price, setPrice] = useState<number | null>(initialPrice);
  const [status, setStatus] = useState<RealtimeConnectionStatus>("connecting");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [sourceType, setSourceType] = useState(initialSourceType);
  const [secondsRemaining, setSecondsRemaining] = useState(initialSecondsRemaining);
  const params = useMemo(() => new URLSearchParams({ symbol, provider: "binance" }), [symbol]);

  useEffect(() => {
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((Date.parse(endTime) - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [endTime]);

  useEffect(() => {
    setPrice(initialPrice);
    setLatencyMs(null);
    setStatus("connecting");
    setSourceType(initialSourceType);
    const eventSource = new EventSource(`${apiBaseUrl}/market-data/realtime?${params.toString()}`);
    const handleMessage = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as RealtimePriceSsePayload;
        setStatus(payload.connectionStatus);
        setSourceType(payload.sourceType === "mock" ? "mock" : "live");
        setLatencyMs(payload.latencyMs);
        if (payload.price !== null) {
          setPrice(payload.price);
        }
      } catch {
        setStatus("stale");
      }
    };
    eventSource.addEventListener("price", handleMessage);
    eventSource.addEventListener("health", handleMessage);
    eventSource.addEventListener("stale", handleMessage);
    eventSource.onerror = () => setStatus((current) => (current === "open" ? "stale" : "failed"));
    return () => {
      eventSource.close();
      setStatus("closed");
    };
  }, [params]);

  return (
    <section className="grid gap-3 rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{dictionary.shortWindow.runtimePrice}</div>
          <div className="mt-2 text-sm font-semibold text-slate-600">{symbol === "BTC" ? "BTCUSDT" : "ETHUSDT"}</div>
          <div className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950" data-testid="short-window-price">
            {formatUsd(price, locale)}
          </div>
        </div>
        <span className={sourceType === "mock" ? "rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700" : sourceType === "stored" ? "rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700" : "rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700"}>
          {sourceType === "mock" ? dictionary.common.mock : sourceType === "stored" ? dictionary.common.stored : dictionary.common.live}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Metric label={dictionary.shortWindow.countdown} value={formatCountdown(secondsRemaining)} testId="short-window-countdown" />
        <Metric label={dictionary.common.status} value={status} />
        <Metric label="latency" value={latencyMs === null ? (locale === "zh-CN" ? "待定" : "Pending") : `${Math.max(0, Math.round(latencyMs))}ms`} />
      </div>
    </section>
  );
}

function Metric({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-2.5" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-900">{value}</div>
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

function formatCountdown(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
