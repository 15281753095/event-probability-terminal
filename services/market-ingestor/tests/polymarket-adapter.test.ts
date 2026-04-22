import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  createPolymarketPublicReadAdapter,
  normalizeEventMarket,
  parseOutcomeLabels,
  parseTokenIds,
  parseYesNoTokenIds
} from "../src/index.js";

const liveGammaSamples = JSON.parse(
  readFileSync(
    new URL("../fixtures/polymarket/live-public-gamma-samples.json", import.meta.url),
    "utf8"
  )
) as {
  metadata: {
    classificationStatus: string;
    sourceIds: string[];
    uncertainty: string[];
  };
  observations: {
    publicSearchBitcoin: {
      firstEvent: {
        title: string;
        tags: Array<{ slug: string }>;
        markets: Array<{
          clobTokenIds: unknown;
          outcomes: unknown;
          question: string;
        }>;
      };
    };
    publicSearchEthereum: {
      firstEvent: {
        title: string;
        tags: Array<{ slug: string }>;
        markets: Array<{
          clobTokenIds: unknown;
          outcomes: unknown;
          question: string;
        }>;
      };
    };
  };
};

const liveTargetDiscoverySamples = JSON.parse(
  readFileSync(
    new URL("../fixtures/polymarket/live-target-discovery-samples.json", import.meta.url),
    "utf8"
  )
) as {
  metadata: {
    classificationStatus: string;
    executedRequests?: unknown;
  };
  executedRequests: Array<{ endpoint: string; query: string }>;
  observations: {
    btc5mActive: {
      closed: boolean;
      tags: Array<{ slug: string }>;
      market: {
        clobTokenIds: unknown;
        outcomes: unknown;
        enableOrderBook: boolean;
      };
    };
    eth5mActive: {
      closed: boolean;
      tags: Array<{ slug: string }>;
      market: {
        clobTokenIds: unknown;
        outcomes: unknown;
        enableOrderBook: boolean;
      };
    };
    btc1hClosed: {
      closed: boolean;
      tags: Array<{ slug: string }>;
      market: {
        clobTokenIds: unknown;
        outcomes: unknown;
      };
    };
    no10mSearches: Array<{
      events: number;
      targetHits: number;
    }>;
  };
};

describe("Polymarket public read adapter", () => {
  it("discovers fixture-backed BTC/ETH event markets and preserves provenance", async () => {
    const adapter = createPolymarketPublicReadAdapter();
    const result = await adapter.discoverEventMarkets({
      assets: ["BTC", "ETH"],
      windows: ["10m", "1h"]
    });

    assert.equal(result.markets.length, 2);
    assert.equal(result.rejected.some((item) => item.reason.includes("ambiguous")), true);

    const btc = result.markets.find((market) => market.asset === "BTC");
    assert.ok(btc);
    assert.equal(btc.window, "1h");
    assert.equal(btc.venue, "polymarket");
    assert.equal(btc.market.enableOrderBook, true);
    assert.equal(btc.tokens.yes.length > 0, true);
    assert.equal(btc.tokens.no.length > 0, true);
    assert.equal(btc.provenance.sourceMode, "fixture");
    assert.equal(btc.provenance.classificationSource, "fixture_metadata");
  });

  it("filters to requested scope", async () => {
    const adapter = createPolymarketPublicReadAdapter();
    const result = await adapter.discoverEventMarkets({
      assets: ["ETH"],
      windows: ["10m"]
    });

    assert.equal(result.markets.length, 1);
    assert.equal(result.markets[0]?.asset, "ETH");
    assert.equal(result.markets[0]?.window, "10m");
  });

  it("reads fixture order book by token id", async () => {
    const adapter = createPolymarketPublicReadAdapter();
    const result = await adapter.discoverEventMarkets({
      assets: ["BTC"],
      windows: ["1h"]
    });
    const tokenId = result.markets[0]?.tokens.yes;
    assert.ok(tokenId);

    const book = await adapter.getOrderBook(tokenId);
    assert.equal(book.asset_id, tokenId);
    assert.equal(book.bids[0]?.price, "0.49");
    assert.equal(book.asks[0]?.price, "0.52");
  });

  it("fails closed when token id shape is ambiguous", () => {
    assert.equal(parseTokenIds("not-json-token-array"), undefined);
    assert.equal(parseTokenIds(["only-one-token"]), undefined);
    assert.deepEqual(parseTokenIds(JSON.stringify(["yes-token", "no-token"])), [
      "yes-token",
      "no-token"
    ]);
  });

  it("parses observed live public Gamma token and outcome string shapes", () => {
    const market = liveGammaSamples.observations.publicSearchBitcoin.firstEvent.markets[0];
    assert.ok(market);

    const tokenIds = parseTokenIds(market.clobTokenIds);
    assert.equal(tokenIds?.length, 2);
    assert.deepEqual(parseOutcomeLabels(market.outcomes), ["Yes", "No"]);
    assert.deepEqual(parseYesNoTokenIds(market.clobTokenIds, market.outcomes), tokenIds);
    assert.equal(parseYesNoTokenIds(market.clobTokenIds, "[\"No\", \"Yes\"]"), undefined);
    assert.equal(parseYesNoTokenIds(market.clobTokenIds, undefined), undefined);
  });

  it("keeps promoted live public search samples out of EventMarket without classification", () => {
    const event = liveGammaSamples.observations.publicSearchBitcoin.firstEvent;
    const market = event.markets[0];
    assert.ok(market);

    const normalized = normalizeEventMarket({
      event,
      market,
      sourceMode: "live_public",
      sourceIds: liveGammaSamples.metadata.sourceIds
    });

    assert.equal(normalized.candidate, undefined);
    assert.match(normalized.rejection ?? "", /missing asset\/window classification/);
  });

  it("records asset evidence but does not confirm 10m or 1h live classification", () => {
    const btc = liveGammaSamples.observations.publicSearchBitcoin.firstEvent;
    const eth = liveGammaSamples.observations.publicSearchEthereum.firstEvent;

    assert.equal(liveGammaSamples.metadata.classificationStatus, "partial_asset_evidence_only_window_unconfirmed");
    assert.equal(btc.tags.some((tag) => tag.slug === "bitcoin"), true);
    assert.equal(eth.tags.some((tag) => tag.slug === "ethereum"), true);
    assert.equal(/10m|1h|10 minute|hourly/i.test(`${btc.title} ${btc.markets[0]?.question ?? ""}`), false);
    assert.equal(/10m|1h|10 minute|hourly/i.test(`${eth.title} ${eth.markets[0]?.question ?? ""}`), false);
  });

  it("records target discovery evidence without opening 10m or active 1h classification", () => {
    const observations = liveTargetDiscoverySamples.observations;

    assert.equal(liveTargetDiscoverySamples.metadata.classificationStatus, "target_window_unconfirmed");
    assert.equal(liveTargetDiscoverySamples.executedRequests.length, 12);
    assert.equal(observations.btc5mActive.tags.some((tag) => tag.slug === "5M"), true);
    assert.equal(observations.eth5mActive.tags.some((tag) => tag.slug === "5M"), true);
    assert.equal(observations.btc1hClosed.tags.some((tag) => tag.slug === "1H"), true);
    assert.equal(observations.btc1hClosed.closed, true);
    assert.equal(observations.no10mSearches.every((item) => item.targetHits === 0), true);
  });

  it("fails closed for observed Up/Down target-family samples under the current Yes/No contract", () => {
    const btc5m = liveTargetDiscoverySamples.observations.btc5mActive;

    assert.deepEqual(parseOutcomeLabels(btc5m.market.outcomes), ["Up", "Down"]);
    assert.equal(parseYesNoTokenIds(btc5m.market.clobTokenIds, btc5m.market.outcomes), undefined);

    const normalized = normalizeEventMarket({
      event: btc5m,
      market: btc5m.market,
      classification: {
        asset: "BTC",
        window: "10m",
        source: "fixture_metadata",
        evidence: ["Deliberately forced in test to prove non-Yes/No outcomes stay rejected."]
      },
      sourceMode: "live_public",
      sourceIds: ["polymarket-target-discovery-2026-04-22"]
    });

    assert.equal(normalized.candidate, undefined);
    assert.equal(normalized.rejection, "ambiguous or missing Yes/No token mapping");
  });
});
