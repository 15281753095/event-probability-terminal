"use client";

import { useEffect, useMemo, useState } from "react";
import type { RealtimeConnectionStatus, RealtimePriceSsePayload, SignalSymbol } from "@ept/shared-types";

type Props = {
  symbol: SignalSymbol;
  provider?: "binance";
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function RealTimePriceCard({ symbol, provider = "binance" }: Props) {
  const [payload, setPayload] = useState<RealtimePriceSsePayload | null>(null);
  const [status, setStatus] = useState<RealtimeConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const params = useMemo(() => new URLSearchParams({ symbol, provider }), [provider, symbol]);

  useEffect(() => {
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
  const sourceLabel = payload?.sourceType === "mock" ? "DEV MOCK" : "LIVE";
  const unhealthy = status === "stale" || status === "failed" || status === "closed" || payload?.stale === true;

  return (
    <section
      className={`border p-3 ${payload?.sourceType === "mock" ? "border-amber-400/40 bg-amber-400/10" : unhealthy ? "border-rose-400/40 bg-rose-400/10" : "border-emerald-400/40 bg-emerald-400/10"}`}
      data-testid={`realtime-price-card-${symbol}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{displaySymbol}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-50" data-testid={`realtime-price-value-${symbol}`}>
            {formatUsd(payload?.price ?? null, symbol)}
          </div>
        </div>
        <div className={`border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${payload?.sourceType === "mock" ? "border-amber-300/60 text-amber-100" : unhealthy ? "border-rose-300/60 text-rose-100" : "border-emerald-300/60 text-emerald-100"}`}>
          {sourceLabel}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Metric label="provider" value={payload?.provider ?? "binance-spot-public"} />
        <Metric label="status" value={status} testId={`realtime-price-status-${symbol}`} />
        <Metric label="latencyMs" value={formatLatency(payload?.latencyMs ?? null)} testId={`realtime-price-latency-${symbol}`} />
        <Metric label="last tick" value={formatTime(payload?.receivedAt ?? null)} />
        <Metric label="bid" value={formatUsd(payload?.bidPrice ?? null, symbol)} />
        <Metric label="ask" value={formatUsd(payload?.askPrice ?? null, symbol)} />
      </div>
      <div className="mt-2 text-xs text-slate-400">
        stale={String(unhealthy)} checkedAt={payload?.providerHealth.checkedAt ?? "pending"}
      </div>
      {error ? <div className="mt-2 text-xs text-rose-100">{error}</div> : null}
    </section>
  );
}

function Metric({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="border border-slate-800 bg-slate-950 px-2 py-1.5" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 break-words font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function formatUsd(value: number | null, symbol: SignalSymbol) {
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

function formatLatency(value: number | null) {
  return value === null || !Number.isFinite(value) ? "Pending" : `${Math.max(0, Math.round(value))}ms`;
}

function formatTime(value: string | null) {
  if (!value) {
    return "Pending";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Pending" : date.toISOString().slice(11, 19);
}
