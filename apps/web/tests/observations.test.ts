import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EventSignalConsoleResponse, SignalDirection, SignalHorizon, SignalProfileName } from "@ept/shared-types";
import {
  MAX_DISPLAYED_OBSERVATIONS,
  MAX_STORED_OBSERVATIONS,
  buildObservationSummary,
  createSignalObservation,
  displayedObservations,
  mergeObservationSnapshot,
  pruneObservations,
  resolvePendingObservations,
  shouldRecordObservation,
  type SignalObservation
} from "../app/signal-observations";

describe("signal observations", () => {
  it("creates observations and excludes NO_SIGNAL from directional match counts", () => {
    const observation = createSignalObservation(makePayload({ direction: "NO_SIGNAL" }));
    const summary = buildObservationSummary([observation]);

    assert.equal(observation.status, "no_signal");
    assert.equal(summary.totalDirectionalSignals, 0);
    assert.equal(summary.directionalMatchRate, null);
  });

  it("resolves LONG and SHORT observations as hit or miss with close-to-close comparison", () => {
    const longHit = createSignalObservation(makePayload({ direction: "LONG", entryPrice: 100, entryCandleTime: "2026-04-23T00:00:00.000Z" }));
    const longMiss = createSignalObservation(makePayload({ direction: "LONG", entryPrice: 100, entryCandleTime: "2026-04-23T00:00:00.000Z", score: 0.8 }));
    const shortHit = createSignalObservation(makePayload({ direction: "SHORT", entryPrice: 100, entryCandleTime: "2026-04-23T00:00:00.000Z" }));
    const shortMiss = createSignalObservation(makePayload({ direction: "SHORT", entryPrice: 100, entryCandleTime: "2026-04-23T00:00:00.000Z", score: -0.8 }));

    const resolvedLongHit = resolvePendingObservations([longHit], makePayload({ direction: "LONG", candleTime: "2026-04-23T00:05:00.000Z", close: 101 }))[0];
    const resolvedLongMiss = resolvePendingObservations([longMiss], makePayload({ direction: "LONG", candleTime: "2026-04-23T00:05:00.000Z", close: 99 }))[0];
    const resolvedShortHit = resolvePendingObservations([shortHit], makePayload({ direction: "SHORT", candleTime: "2026-04-23T00:05:00.000Z", close: 99 }))[0];
    const resolvedShortMiss = resolvePendingObservations([shortMiss], makePayload({ direction: "SHORT", candleTime: "2026-04-23T00:05:00.000Z", close: 101 }))[0];

    assert.equal(resolvedLongHit?.status, "hit");
    assert.equal(resolvedLongMiss?.status, "miss");
    assert.equal(resolvedShortHit?.status, "hit");
    assert.equal(resolvedShortMiss?.status, "miss");
  });

  it("invalidates pending observations when data is missing at resolution time", () => {
    const pending = createSignalObservation(makePayload({ direction: "LONG", entryPrice: 100, entryCandleTime: "2026-04-23T00:00:00.000Z" }));
    const [invalidated] = resolvePendingObservations([pending], makePayload({
      direction: "LONG",
      generatedAt: "2026-04-23T00:06:00.000Z",
      candles: []
    }));

    assert.equal(invalidated?.status, "invalidated");
  });

  it("dedupes by cooldown and records meaningful score changes or direction changes", () => {
    const first = createSignalObservation(makePayload({ direction: "LONG", score: 0.7, generatedAt: "2026-04-23T00:00:00.000Z" }));
    const duplicate = createSignalObservation(makePayload({ direction: "LONG", score: 0.74, generatedAt: "2026-04-23T00:01:00.000Z" }));
    const scoreMove = createSignalObservation(makePayload({ direction: "LONG", score: 0.82, generatedAt: "2026-04-23T00:01:00.000Z" }));
    const directionChange = createSignalObservation(makePayload({ direction: "SHORT", score: -0.7, generatedAt: "2026-04-23T00:01:00.000Z" }));

    assert.equal(shouldRecordObservation([first], duplicate), false);
    assert.equal(shouldRecordObservation([first], scoreMove), true);
    assert.equal(shouldRecordObservation([first], directionChange), true);
    assert.equal(mergeObservationSnapshot([first], makePayload({ direction: "LONG", score: 0.74, generatedAt: "2026-04-23T00:01:00.000Z" })).length, 1);
  });

  it("keeps 100 stored observations and displays 20", () => {
    const observations: SignalObservation[] = Array.from({ length: 120 }, (_, index) =>
      createSignalObservation(makePayload({
        direction: "LONG",
        generatedAt: new Date(Date.parse("2026-04-23T00:00:00.000Z") + index * 180_000).toISOString(),
        score: 0.7 + index / 1000
      }))
    );

    assert.equal(pruneObservations(observations).length, MAX_STORED_OBSERVATIONS);
    assert.equal(displayedObservations(observations).length, MAX_DISPLAYED_OBSERVATIONS);
  });
});

function makePayload(input: {
  direction: SignalDirection;
  horizon?: SignalHorizon;
  profileName?: SignalProfileName;
  generatedAt?: string;
  score?: number;
  confidence?: number;
  entryPrice?: number | null;
  entryCandleTime?: string | null;
  candleTime?: string;
  close?: number;
  candles?: Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume: number }>;
}): EventSignalConsoleResponse {
  const generatedAt = input.generatedAt ?? "2026-04-23T00:00:00.000Z";
  const horizon = input.horizon ?? "5m";
  const entryCandleTime = input.entryCandleTime ?? "2026-04-23T00:00:00.000Z";
  const expectedResolveAt = new Date(Date.parse(entryCandleTime) + (horizon === "5m" ? 5 : 10) * 60_000).toISOString();
  const entryPrice = input.entryPrice ?? 100;
  const candleTime = input.candleTime ?? entryCandleTime;
  const close = input.close ?? entryPrice;
  const recentCandles = input.candles ?? [{ timestamp: candleTime, open: close, high: close, low: close, close, volume: 1 }];
  const profileName = input.profileName ?? "balanced";
  return {
    meta: { generatedAt },
    symbol: "BTC",
    horizon,
    sourceMode: "fixture",
    profileName,
    recentCandles,
    observationCandidate: {
      createdAt: generatedAt,
      symbol: "BTC",
      horizon,
      sourceMode: "fixture",
      direction: input.direction,
      score: input.score ?? 0.7,
      confidence: input.confidence ?? 0.55,
      profileName,
      entryPrice,
      entryCandleTime,
      expectedResolveAt,
      reasonSummary: "test reason",
      caveats: ["Local observation only, not trading performance."],
      canObserve: entryPrice !== null
    }
  } as EventSignalConsoleResponse;
}
