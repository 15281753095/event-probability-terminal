import type { ReplayWindow, ReplayWindowId } from "@ept/shared-types";

const windowDurationsMs = {
  "1d": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000
} satisfies Record<Exclude<ReplayWindowId, "custom">, number>;

const labels = {
  "1d": "Past 1 day",
  "3d": "Past 3 days",
  "1w": "Past 1 week",
  "1m": "Past 1 month"
} satisfies Record<Exclude<ReplayWindowId, "custom">, string>;

export function resolveReplayWindow(
  input: ReplayWindowId | ReplayWindow,
  now = new Date().toISOString()
): ReplayWindow {
  if (typeof input !== "string") {
    return validateCustomReplayWindow(input);
  }
  if (input === "custom") {
    throw new Error("Custom replay window requires explicit startTime and endTime.");
  }
  const endMs = parseIso(now, "now");
  const startMs = endMs - windowDurationsMs[input];
  return {
    id: input,
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
    label: labels[input]
  };
}

export function parseReplayWindowId(value?: string): ReplayWindowId | undefined {
  return value === "1d" || value === "3d" || value === "1w" || value === "1m" || value === "custom"
    ? value
    : undefined;
}

export function intervalMsForReplay(value: "1m" | "5m" | "15m" | "1h"): number {
  return value === "1m" ? 60_000 : value === "5m" ? 300_000 : value === "15m" ? 900_000 : 3_600_000;
}

function validateCustomReplayWindow(window: ReplayWindow): ReplayWindow {
  if (window.id !== "custom") {
    return resolveReplayWindow(window.id, window.endTime);
  }
  const startMs = parseIso(window.startTime, "startTime");
  const endMs = parseIso(window.endTime, "endTime");
  if (startMs >= endMs) {
    throw new Error("Custom replay window startTime must be earlier than endTime.");
  }
  return {
    id: "custom",
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
    label: window.label || "Custom replay window"
  };
}

function parseIso(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Replay window ${label} must be a valid ISO timestamp.`);
  }
  return parsed;
}
