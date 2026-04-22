import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EventMarket } from "@ept/shared-types";
import { localPricingFallback, pricingInputFeatures } from "../src/pricing-client.js";

const market: EventMarket = {
  id: "polymarket:mkt-btc-1h-demo",
  venue: "polymarket",
  asset: "BTC",
  window: "1h",
  question: "Will Bitcoin be up at the end of the hour?",
  event: {
    id: "evt-btc-hourly-demo"
  },
  market: {
    id: "mkt-btc-1h-demo",
    conditionId: "0xcondition",
    active: true,
    closed: false,
    enableOrderBook: true
  },
  outcomeType: "binary",
  outcomes: {
    primary: {
      role: "primary",
      label: "Up",
      tokenId: "token-up"
    },
    secondary: {
      role: "secondary",
      label: "Down",
      tokenId: "token-down"
    }
  },
  metrics: {
    bestBid: 0.49,
    bestAsk: 0.52,
    spread: 0.03,
    liquidity: 12000,
    volume: 80000
  },
  provenance: {
    source: "polymarket",
    sourceIds: ["local-test"],
    sourceMode: "fixture",
    classificationSource: "fixture_metadata",
    evidence: ["local test"]
  },
  uncertainty: []
};

describe("pricing client helpers", () => {
  it("records binary outcome labels as pricing input features", () => {
    assert.deepEqual(pricingInputFeatures(market), {
      bestBid: 0.49,
      bestAsk: 0.52,
      spread: 0.03,
      liquidity: 12000,
      volume: 80000,
      observedMidpoint: 0.505,
      outcomeLabels: {
        primary: "Up",
        secondary: "Down"
      }
    });
  });

  it("keeps fallback fair value explicitly placeholder", () => {
    const fairValue = localPricingFallback(market, "2026-04-22T12:00:00Z", "pricing down");

    assert.equal(fairValue.marketId, market.id);
    assert.equal(fairValue.modelVersion, "pricing-engine-v0-placeholder");
    assert.equal(fairValue.isPlaceholder, true);
    assert.equal(fairValue.confidence, null);
    assert.equal(fairValue.fairProbabilityByOutcome.primary.outcomeLabel, "Up");
    assert.equal(fairValue.fairProbabilityByOutcome.primary.probability, null);
    assert.equal(fairValue.fairProbabilityByOutcome.secondary.outcomeLabel, "Down");
  });
});
