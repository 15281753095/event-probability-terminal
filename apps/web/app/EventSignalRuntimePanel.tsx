"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  EventSignalConsoleResponse,
  ResearchSignalSourceMode,
  SignalDirection,
  SignalHorizon,
  SignalProfileName,
  SignalSymbol
} from "@ept/shared-types";
import {
  MAX_DISPLAYED_OBSERVATIONS,
  MAX_OBSERVATION_MARKERS,
  buildObservationSummary,
  displayedObservations,
  mergeObservationSnapshot,
  observationMarkerCount,
  readStoredObservations,
  writeStoredObservations,
  type SignalObservation,
  type SignalObservationStatus
} from "./signal-observations";

type RefreshInterval = "off" | "15" | "30" | "60";

type Props = {
  initialConsole: EventSignalConsoleResponse;
};

const profiles: SignalProfileName[] = ["balanced", "conservative", "aggressive"];

export function EventSignalRuntimePanel({ initialConsole }: Props) {
  const [interval, setIntervalValue] = useState<RefreshInterval>("off");
  const [snapshot, setSnapshot] = useState<EventSignalConsoleResponse>(initialConsole);
  const [selectedProfile, setSelectedProfile] = useState<SignalProfileName>(initialConsole.profileName);
  const [observations, setObservations] = useState<SignalObservation[]>(() => mergeObservationSnapshot([], initialConsole));
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const summary = useMemo(() => buildObservationSummary(observations), [observations]);
  const visibleObservations = useMemo(() => displayedObservations(observations), [observations]);
  const observationMarkers = useMemo(() => observationMarkerCount(observations), [observations]);

  const effectiveIntervalMs = useMemo(() => {
    if (interval === "off") {
      return null;
    }
    const requested = Number(interval) * 1000;
    return snapshot.sourceMode === "live" ? Math.max(requested, 30_000) : requested;
  }, [interval, snapshot.sourceMode]);

  useEffect(() => {
    setSnapshot(initialConsole);
    setSelectedProfile(initialConsole.profileName);
    setObservations((current) => persistObservations(mergeObservationSnapshot(current.length ? current : readStoredObservations(), initialConsole)));
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
  }, [effectiveIntervalMs, snapshot.symbol, snapshot.horizon, snapshot.sourceMode, selectedProfile]);

  async function refreshSnapshot(profileOverride?: SignalProfileName) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    setError(null);
    const profile = profileOverride ?? selectedProfile;
    try {
      const url = new URL("/api/signals/console", window.location.origin);
      url.searchParams.set("symbol", snapshot.symbol);
      url.searchParams.set("horizon", snapshot.horizon);
      url.searchParams.set("sourceMode", snapshot.sourceMode);
      url.searchParams.set("profile", profile);
      const response = await fetch(url.toString(), {
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Signal refresh failed with HTTP ${response.status}.`);
      }
      const next = (await response.json()) as EventSignalConsoleResponse;
      setSnapshot(next);
      setSelectedProfile(next.profileName);
      setObservations((current) => persistObservations(mergeObservationSnapshot(current, next)));
      setStatus("idle");
    } catch (refreshError) {
      if (refreshError instanceof DOMException && refreshError.name === "AbortError") {
        return;
      }
      setStatus("error");
      setError(refreshError instanceof Error ? refreshError.message : "Signal refresh failed.");
    }
  }

  function applyProfile(profile: SignalProfileName) {
    setSelectedProfile(profile);
    syncProfileToUrl(profile);
    void refreshSnapshot(profile);
  }

  const liveIntervalNotice =
    snapshot.sourceMode === "live" && interval === "15" ? "Live mode floors 15s refreshes to 30s." : null;

  return (
    <section className="grid gap-3 border border-slate-800 bg-[#070b12] p-3" data-testid="signal-observation-log">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Signal Observation Log</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Local observation only, not trading performance. Pending observations resolve close-to-close after the selected 5m/10m window.
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
            {status === "loading" ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
        <RuntimeMetric label="Profile" value={selectedProfile} />
        <RuntimeMetric label="Last updated" value={formatTime(snapshot.meta.generatedAt)} />
        <RuntimeMetric label="Observation status" value={snapshot.observationCandidate.canObserve ? "can observe" : "limited"} />
        <RuntimeMetric label="Directional match rate" value={formatNullableRate(summary.directionalMatchRate)} />
        <RuntimeMetric label="Observation markers" value={`${observationMarkers}/${MAX_OBSERVATION_MARKERS}`} />
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-4">
        <RuntimeMetric label="Directional signals" value={`${summary.totalDirectionalSignals}`} />
        <RuntimeMetric label="Resolved" value={`${summary.resolvedCount}`} />
        <RuntimeMetric label="Pending" value={`${summary.pendingCount}`} />
        <RuntimeMetric label="Invalidated" value={`${summary.invalidatedCount}`} />
      </div>

      <div className="grid gap-2 text-xs lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="border border-slate-800 bg-slate-950 p-3" data-testid="observation-feedback">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Observation Feedback</h4>
              <p className="mt-1 text-xs text-slate-500">Suggestions are local research prompts and are never applied automatically.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {profiles.map((profile) => (
                <button
                  className={`border px-2 py-1 font-semibold ${
                    selectedProfile === profile
                      ? "border-cyan-400 bg-cyan-400/10 text-cyan-100"
                      : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500"
                  }`}
                  key={profile}
                  onClick={() => applyProfile(profile)}
                  type="button"
                >
                  {profile === "conservative" ? "Apply conservative locally" : profile === "aggressive" ? "Apply aggressive" : "Apply balanced"}
                </button>
              ))}
            </div>
          </div>
          <ul className="mt-3 grid gap-1 text-xs leading-5 text-slate-300">
            {summary.suggestedAdjustments.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        </section>

        <section className="border border-slate-800 bg-slate-950 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">By Window</h4>
          <div className="mt-2 grid gap-2">
            <MiniSummary label="5m" summary={summary.byHorizon["5m"]} />
            <MiniSummary label="10m" summary={summary.byHorizon["10m"]} />
          </div>
        </section>
      </div>

      {liveIntervalNotice ? <p className="text-xs text-amber-200">{liveIntervalNotice}</p> : null}
      {error ? <p className="text-xs text-rose-200">{error}</p> : null}

      <div>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Recent Observations</h4>
          <span className="text-xs text-slate-500">{visibleObservations.length}/{MAX_DISPLAYED_OBSERVATIONS}</span>
        </div>
        <div className="mt-2 grid gap-2" data-testid="signal-history">
          {visibleObservations.length ? (
            visibleObservations.map((item) => <ObservationRow item={item} key={item.id} />)
          ) : (
            <p className="border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">No local observations yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ObservationRow({ item }: { item: SignalObservation }) {
  return (
    <article className="grid gap-2 border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300 lg:grid-cols-[78px_76px_92px_86px_86px_minmax(0,1fr)]">
      <div className="text-slate-500">{formatTime(item.createdAt)}</div>
      <div>
        {item.symbol} {item.horizon}
      </div>
      <div className={directionClass(item.direction)}>{displayDirection(item.direction)}</div>
      <StatusPill status={item.status} />
      <div>{formatNullableRate(item.movePct)}</div>
      <div className="truncate text-slate-500">{item.reasonSummary}</div>
    </article>
  );
}

function StatusPill({ status }: { status: SignalObservationStatus }) {
  const tone =
    status === "hit"
      ? "border-emerald-500/40 text-emerald-100"
      : status === "miss"
        ? "border-rose-500/40 text-rose-100"
        : status === "pending"
          ? "border-amber-500/40 text-amber-100"
          : "border-slate-700 text-slate-400";
  return <span className={`inline-flex w-fit border px-2 py-0.5 ${tone}`}>{status}</span>;
}

function MiniSummary({ label, summary }: { label: string; summary: { resolvedCount: number; pendingCount: number; directionalMatchRate: number | null } }) {
  return (
    <div className="grid grid-cols-3 gap-2 border border-slate-800 bg-[#070b12] px-2 py-1">
      <span className="font-semibold text-slate-100">{label}</span>
      <span className="text-slate-400">R {summary.resolvedCount}</span>
      <span className="text-slate-400">{formatNullableRate(summary.directionalMatchRate)}</span>
    </div>
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

function persistObservations(observations: SignalObservation[]) {
  writeStoredObservations(observations);
  return observations;
}

function syncProfileToUrl(profile: SignalProfileName) {
  const url = new URL(window.location.href);
  if (profile === "balanced") {
    url.searchParams.delete("consoleProfile");
  } else {
    url.searchParams.set("consoleProfile", profile);
  }
  window.history.replaceState(null, "", url.toString());
}

function displayDirection(direction: SignalDirection) {
  return direction === "LONG" ? "LONG bias" : direction === "SHORT" ? "SHORT bias" : "NO_SIGNAL";
}

function directionClass(direction: SignalDirection) {
  return direction === "LONG" ? "text-emerald-200" : direction === "SHORT" ? "text-rose-200" : "text-slate-300";
}

function formatTime(value: string | null) {
  if (!value) {
    return "n/a";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }
  return date.toISOString().slice(11, 19);
}

function formatNullableRate(value: number | null) {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}
