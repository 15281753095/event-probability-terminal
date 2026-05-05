import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { EventMarketCandidate } from "@ept/shared-types";

type MockPolymarketFixture = {
  metadata: {
    checkedAt: string;
  };
  markets: EventMarketCandidate[];
};

const fixtureUrl = new URL("../../fixtures/polymarket/active-crypto-markets.json", import.meta.url);

export function loadMockPolymarketActiveMarkets(): MockPolymarketFixture {
  return JSON.parse(readFileSync(fileURLToPath(fixtureUrl), "utf8")) as MockPolymarketFixture;
}
