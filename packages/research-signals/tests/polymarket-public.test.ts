import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bindMarketToUnderlying,
  buildEventMarketOdds,
  mapGammaMarketToCandidate
} from "../src/index.js";
import type { EventMarketCandidate } from "@ept/shared-types";

const checkedAt = "2026-05-05T00:00:00.000Z";

describe("Polymarket public market mapping", () => {
  it("maps an active Gamma market into an EventMarketCandidate", () => {
    const mapped = mapGammaMarketToCandidate({
      market: gammaMarket({
        question: "Will Bitcoin be above $100,000 on May 31?",
        slug: "bitcoin-above-100k",
        outcomes: "[\"Yes\",\"No\"]",
        outcomePrices: "[\"0.42\",\"0.58\"]",
        clobTokenIds: "[\"yes-token\",\"no-token\"]"
      })
    });

    assert.equal(mapped.candidate?.marketId, "m1");
    assert.equal(mapped.candidate?.outcomes[0], "Yes");
    assert.equal(mapped.candidate?.outcomePrices[0], 0.42);
    assert.equal(mapped.candidate?.clobTokenIds[0], "yes-token");
  });

  it("marks missing outcomes and token ids as not research eligible", async () => {
    const mapped = mapGammaMarketToCandidate({
      market: gammaMarket({
        outcomes: undefined,
        clobTokenIds: undefined
      })
    });
    assert.ok(mapped.candidate);
    assert.ok(mapped.failClosedReasons.some((reason) => reason.includes("outcomes")));
    const odds = await buildEventMarketOdds(mapped.candidate, { sourceType: "mock", now: () => checkedAt });
    const bound = bindMarketToUnderlying({ candidate: mapped.candidate, odds });
    assert.equal(bound.researchEligible, false);
    assert.ok(bound.researchRejectReasons.some((reason) => reason.includes("token IDs")));
  });

  it("binds BTC, ETH, and ambiguous questions correctly", async () => {
    const btc = await bind(gammaMarket({ question: "Will BTC be above $90,000?", slug: "btc-above-90k" }));
    const eth = await bind(gammaMarket({ id: "m2", question: "Will Ethereum be above $3,000?", slug: "ethereum-above-3000" }));
    const both = await bind(gammaMarket({ id: "m3", question: "Will BTC outperform ETH?", slug: "btc-vs-eth" }));

    assert.equal(btc.underlyingSymbol, "BTCUSDT");
    assert.equal(btc.bindingStatus, "bound");
    assert.equal(eth.underlyingSymbol, "ETHUSDT");
    assert.equal(eth.bindingStatus, "bound");
    assert.equal(both.bindingStatus, "ambiguous");
    assert.equal(both.researchEligible, false);
  });
});

describe("Polymarket CLOB public odds", () => {
  it("combines midpoint spread and orderbook into EventMarketOdds", async () => {
    const candidate = candidateFixture();
    const odds = await buildEventMarketOdds(candidate, {
      now: () => checkedAt,
      fetcher: fakeFetch({
        "/book?token_id=yes-token": { bids: [{ price: "0.41", size: "10" }], asks: [{ price: "0.43", size: "12" }] },
        "/book?token_id=no-token": { bids: [{ price: "0.57", size: "10" }], asks: [{ price: "0.59", size: "12" }] },
        "/midpoint?token_id=yes-token": { mid: "0.42" },
        "/midpoint?token_id=no-token": { mid: "0.58" },
        "/spread?token_id=yes-token": { spread: "0.02" },
        "/spread?token_id=no-token": { spread: "0.02" }
      })
    });

    assert.equal(odds.yesMidpoint, 0.42);
    assert.equal(odds.noMidpoint, 0.58);
    assert.equal(odds.spread, 0.02);
    assert.equal(odds.bestBidYes, 0.41);
    assert.equal(odds.bestAskYes, 0.43);
    assert.equal(odds.liquidityStatus, "ok");
  });

  it("marks empty orderbook liquidity as unknown while preserving fallback prices", async () => {
    const odds = await buildEventMarketOdds(candidateFixture(), {
      now: () => checkedAt,
      fetcher: fakeFetch({
        "/book?token_id=yes-token": { bids: [], asks: [] },
        "/book?token_id=no-token": { bids: [], asks: [] },
        "/midpoint?token_id=yes-token": {},
        "/midpoint?token_id=no-token": {},
        "/spread?token_id=yes-token": {},
        "/spread?token_id=no-token": {}
      })
    });

    assert.equal(odds.yesPrice, 0.42);
    assert.equal(odds.liquidityStatus, "unknown");
    assert.ok(odds.failClosedReasons.some((reason) => reason.includes("Gamma outcomePrices fallback")));
  });

  it("records CLOB failures and falls back to outcomePrices", async () => {
    const odds = await buildEventMarketOdds(candidateFixture(), {
      now: () => checkedAt,
      fetcher: async () => ({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: async () => ({})
      } as Response)
    });

    assert.equal(odds.yesPrice, 0.42);
    assert.ok(odds.failClosedReasons.some((reason) => reason.includes("CLOB public odds unavailable")));
    assert.equal(odds.provider, "polymarket-clob-public");
  });
});

async function bind(market: Record<string, unknown>) {
  const mapped = mapGammaMarketToCandidate({ market });
  assert.ok(mapped.candidate);
  const odds = await buildEventMarketOdds(mapped.candidate, { sourceType: "mock", now: () => checkedAt });
  return bindMarketToUnderlying({ candidate: mapped.candidate, odds });
}

function candidateFixture(): EventMarketCandidate {
  const mapped = mapGammaMarketToCandidate({ market: gammaMarket({}) });
  assert.ok(mapped.candidate);
  return mapped.candidate;
}

function gammaMarket(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "m1",
    eventId: "e1",
    question: "Will Bitcoin be above $100,000 on May 31?",
    slug: "bitcoin-above-100k",
    active: true,
    closed: false,
    endDate: "2026-05-31T23:59:00.000Z",
    outcomes: ["Yes", "No"],
    outcomePrices: [0.42, 0.58],
    clobTokenIds: ["yes-token", "no-token"],
    resolutionSource: "fixture",
    liquidityNum: "1000",
    ...overrides
  };
}

function fakeFetch(payloads: Record<string, unknown>) {
  return async (url: string) => {
    const parsed = new URL(url);
    const key = `${parsed.pathname}?${parsed.searchParams.toString()}`;
    const payload = payloads[key];
    return {
      ok: payload !== undefined,
      status: payload === undefined ? 404 : 200,
      statusText: payload === undefined ? "Not Found" : "OK",
      json: async () => payload ?? {}
    } as Response;
  };
}
