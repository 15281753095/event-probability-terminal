"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EventSignalConsoleResponse, ResearchSignalSourceMode, SignalHorizon, SignalSymbol } from "@ept/shared-types";

type RefreshInterval = "off" | "15" | "30" | "60";

type RuntimeHistoryItem = {
  id: string;
  time: string;
  symbol: SignalSymbol;
  horizon: SignalHorizon;
  direction: EventSignalConsoleResponse["currentSignal"]["direction"];
  score: number;
  confidence: number;
  sourceMode: ResearchSignalSourceMode;
  reasonSummary: string;
};

type Props = {
  initialConsole: EventSignalConsoleResponse;
};

const historyLimit = 20;

export function EventSignalRuntimePanel({ initialConsole }: Props) {
  const [interval, setIntervalValue] = useState<RefreshInterval>("off");
  const [snapshot, setSnapshot] = useState<EventSignalConsoleResponse>(initialConsole);
  const [history, setHistory] = useState<RuntimeHistoryItem[]>(() => [toHistoryItem(initialConsole)]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const effectiveIntervalMs = useMemo(() => {
    if (interval === "off") {
      return null;
    }
    const requested = Number(interval) * 1000;
    return snapshot.sourceMode === "live" ? Math.max(requested, 30_000) : requested;
  }, [interval, snapshot.sourceMode]);

  useEffect(() => {
    setSnapshot(initialConsole);
    setHistory((current) => mergeHistory(current, toHistoryItem(initialConsole)));
  }, [initialConsole]);

  useEffect(() => {
    if (!effectiveIntervalMs) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void refreshSnapshot();
    }, effectiveIntervalMs);
    return () => {
      window.clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [effectiveIntervalMs, snapshot.symbol, snapshot.horizon, snapshot.sourceMode]);

  async function refreshSnapshot() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    setError(null);
    try {
      const url = new URL("/api/signals/console", window.location.origin);
      url.searchParams.set("symbol", snapshot.symbol);
      url.searchParams.set("horizon", snapshot.horizon);
      url.searchParams.set("sourceMode", snapshot.sourceMode);
      const response = await fetch(url.toString(), {
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Signal refresh failed with HTTP ${response.status}.`);
      }
      const next = (await response.json()) as EventSignalConsoleResponse;
      setSnapshot(next);
      setHistory((current) => mergeHistory(current, toHistoryItem(next)));
      setStatus("idle");
    } catch (refreshError) {
      if (refreshError instanceof DOMException && refreshError.name === "AbortError") {
        return;
      }
      setStatus("error");
      setError(refreshError instanceof Error ? refreshError.message : "Signal refresh failed.");
    }
  }

  const liveIntervalNotice =
    snapshot.sourceMode === "live" && interval === "15" ? "Live mode floors 15s refreshes to 30s." : null;

  return (
    <section className="border border-slate-800 bg-[#070b12] p-3" data-testid="signal-runtime-panel">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Signal Runtime</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Auto refresh is local UI polling only. It does not trade, submit orders, connect wallets, or create a trade log.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(["off", "15", "30", "60"] as RefreshInterval[]).map((value) => (
            <button
              className={`border px-2 py-1 font-semibold ${
                interval === value
                  ? "border-cyan-400 bg-cyan-400/10 text-cyan-100"
                  : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500"
              }`}
              key={value}
              onClick={() => setIntervalValue(value)}
              type="button"
            >
              {value === "off" ? "Auto refresh off" : `${value}s`}
            </button>
          ))}
          <button
            className="border border-cyan-500/70 bg-cyan-500/10 px-2 py-1 font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={status === "loading"}
            onClick={() => void refreshSnapshot()}
            type="button"
          >
            {status === "loading" ? "Refreshing..." : "Runtime refresh"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <RuntimeMetric label="Profile" value={snapshot.profileName} />
        <RuntimeMetric label="Last updated" value={formatTime(snapshot.meta.generatedAt)} />
        <RuntimeMetric label="Source mode" value={snapshot.sourceMode} />
        <RuntimeMetric label="Runtime status" value={status === "error" ? "warning" : status} />
      </div>

      {liveIntervalNotice ? <p className="mt-2 text-xs text-amber-200">{liveIntervalNotice}</p> : null}
      {error ? <p className="mt-2 text-xs text-rose-200">{error}</p> : null}

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Recent Signal History</h4>
          <span className="text-xs text-slate-500">{history.length}/{historyLimit}</span>
        </div>
        <div className="mt-2 grid gap-2" data-testid="signal-history">
          {history.map((item) => (
            <article className="grid gap-2 border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300 lg:grid-cols-[86px_80px_90px_90px_minmax(0,1fr)]" key={item.id}>
              <div className="text-slate-500">{formatTime(item.time)}</div>
              <div>
                {item.symbol} {item.horizon}
              </div>
              <div className={item.direction === "LONG" ? "text-emerald-200" : item.direction === "SHORT" ? "text-rose-200" : "text-slate-300"}>
                {item.direction === "LONG" ? "LONG bias" : item.direction === "SHORT" ? "SHORT bias" : "NO_SIGNAL"}
              </div>
              <div>
                {formatSigned(item.score)} / {item.confidence.toFixed(3)}
              </div>
              <div className="truncate text-slate-500">{item.reasonSummary}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function RuntimeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-800 bg-slate-950 px-2 py-1">
      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function mergeHistory(history: RuntimeHistoryItem[], next: RuntimeHistoryItem): RuntimeHistoryItem[] {
  const [latest] = history;
  if (latest && !isMeaningfulChange(latest, next)) {
    return history;
  }
  return [next, ...history].slice(0, historyLimit);
}

function isMeaningfulChange(previous: RuntimeHistoryItem, next: RuntimeHistoryItem): boolean {
  return (
    previous.symbol !== next.symbol ||
    previous.horizon !== next.horizon ||
    previous.sourceMode !== next.sourceMode ||
    previous.direction !== next.direction ||
    Math.abs(previous.score - next.score) >= 0.03 ||
    Math.abs(previous.confidence - next.confidence) >= 0.05
  );
}

function toHistoryItem(payload: EventSignalConsoleResponse): RuntimeHistoryItem {
  return {
    id: `${payload.meta.generatedAt}-${payload.symbol}-${payload.horizon}-${payload.sourceMode}-${payload.confluence.totalScore}`,
    time: payload.meta.generatedAt,
    symbol: payload.symbol,
    horizon: payload.horizon,
    direction: payload.currentSignal.direction,
    score: payload.confluence.totalScore,
    confidence: payload.confluence.confidence,
    sourceMode: payload.sourceMode,
    reasonSummary: payload.confluence.vetoReasons[0] ?? payload.confluence.reasons[0] ?? "Confluence evaluated."
  };
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }
  return date.toISOString().slice(11, 19);
}

function formatSigned(value: number) {
  const rounded = value.toFixed(3);
  return value > 0 ? `+${rounded}` : rounded;
}
