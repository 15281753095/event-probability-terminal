"use client";

import { useEffect, useMemo, useState } from "react";
import type { RealtimeConnectionStatus, RealtimePriceSsePayload, SignalSymbol } from "@ept/shared-types";

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
    <section className="grid gap-2 border border-slate-800 bg-slate-950 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Runtime price</div>
          <div className="mt-1 text-2xl font-semibold text-slate-50" data-testid="short-window-price">
            {formatUsd(price)}
          </div>
        </div>
        <span className={sourceType === "mock" ? "border border-amber-400/60 px-2 py-1 text-[11px] font-semibold text-amber-100" : "border border-emerald-400/60 px-2 py-1 text-[11px] font-semibold text-emerald-100"}>
          {sourceType === "mock" ? "DEV MOCK" : sourceType.toUpperCase()}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Metric label="countdown" value={formatCountdown(secondsRemaining)} testId="short-window-countdown" />
        <Metric label="status" value={status} />
        <Metric label="latency" value={latencyMs === null ? "Pending" : `${Math.max(0, Math.round(latencyMs))}ms`} />
      </div>
    </section>
  );
}

function Metric({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="border border-slate-800 bg-[#080d16] px-2 py-1.5" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function formatUsd(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Pending";
  }
  return new Intl.NumberFormat("en-US", {
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
