import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MarketDetailResponse } from "@ept/shared-types";
import { buildServer } from "../src/server.js";

const fixtureMarketId = "polymarket:mkt-btc-1h-demo";

describe("market detail API", () => {
  it("returns a contract-backed market detail response", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "GET",
      url: `/markets/${encodeURIComponent(fixtureMarketId)}/detail`
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<MarketDetailResponse>();
    assert.equal(payload.market.id, fixtureMarketId);
    assert.equal(payload.researchReadiness.outcomeContract, "binary");
    assert.equal(payload.researchReadiness.isPlaceholderPricing, true);
    assert.equal(payload.candidate?.isPlaceholder, true);
    assert.ok(payload.tokenTrace.length >= 4);
    assert.ok(payload.sourceTrace.length >= 1);
    assert.ok(payload.evidenceTrail.length >= 1);
    assert.ok(payload.relatedMarkets.length >= 1);
    assert.equal(payload.book?.marketId, fixtureMarketId);

    await server.close();
  });

  it("returns supported fixture ids for an unknown market", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "GET",
      url: "/markets/not-a-known-market/detail"
    });

    assert.equal(response.statusCode, 404);
    const payload = response.json<{ error: string; supportedIds: string[] }>();
    assert.equal(payload.error, "market_not_found");
    assert.ok(payload.supportedIds.includes(fixtureMarketId));

    await server.close();
  });
});
