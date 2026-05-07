#!/usr/bin/env node
import { createResearchDataStore } from "../store/index.js";
import { runCaptureJobByName, type CaptureRunMode } from "./scheduler.js";
import { shouldUseMockCapture, type CaptureJobContext } from "./types.js";

const command = process.argv[2] ?? "status";
const commandToMode: Record<string, CaptureRunMode> = {
  once: "once",
  snapshot: "snapshot",
  binance: "binance-candles",
  polymarket: "polymarket-markets",
  "fair-value": "fair-value-signals",
  replay: "replay-metrics",
  "strategy-lab": "strategy-lab"
};

async function main(): Promise<void> {
  const store = createResearchDataStore();
  await store.init();
  try {
    if (command === "status") {
      console.log(JSON.stringify(await store.getStatus(), null, 2));
      return;
    }
    const mode = commandToMode[command];
    if (!mode) {
      throw new Error(`Unknown capture command: ${command}`);
    }
    const results = await runCaptureJobByName(buildCliCaptureContext(store), mode);
    console.log(JSON.stringify({ results }, null, 2));
    if (results.some((result) => result.status === "failed")) {
      process.exitCode = 1;
    }
  } finally {
    await store.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function buildCliCaptureContext(store: CaptureJobContext["store"]): CaptureJobContext {
  if (shouldUseMockCapture()) {
    return { store, useMock: true };
  }
  return {
    store,
    useMock: false,
    timeoutMs: 1_500,
    binanceLookbackMs: 24 * 60 * 60 * 1000,
    binanceMaxPages: 1
  };
}
