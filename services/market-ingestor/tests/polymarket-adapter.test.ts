import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  createPolymarketPublicReadAdapter,
  normalizeEventMarket,
  parseBinaryOutcomes,
  parseOutcomeLabels,
  parseTokenIds
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

const liveUpDownPayoffEvidenceSamples = JSON.parse(
  readFileSync(
    new URL("../fixtures/polymarket/live-updown-payoff-evidence-samples.json", import.meta.url),
    "utf8"
  )
) as {
  metadata: {
    classificationStatus: string;
    extractionReadiness: string;
    requestCount: number;
  };
  observations: {
    btc5mActiveChainlink: UpDownPayoffEvidenceObservation;
    eth5mActiveChainlink: UpDownPayoffEvidenceObservation;
    btc5mClosedChainlinkMetadata: UpDownClosedMetadataObservation;
    eth5mClosedChainlinkMetadata: UpDownClosedMetadataObservation;
    btcThresholdOutOfScope: {
      tags: string[];
      thresholdEvidence: {
        kind: string;
        thresholdValue: number;
        targetFamilyStatus: string;
      };
      market: {
        outcomes: unknown;
      };
    };
  };
};

interface UpDownPayoffEvidenceObservation {
  tags: string[];
  descriptionEvidence: string;
  resolutionSource: string;
  market: {
    eventStartTime: string;
    endDate: string;
    enableOrderBook: boolean;
    outcomes: unknown;
  };
  payoffEvidence: {
    kind: string;
    status: string;
    primaryWinsWhen: string;
    secondaryWinsWhen: string;
    referenceLevelKind: string;
    settlementLevelKind: string;
    tieRule: string;
    referenceLevelValue: number | null;
    settlementLevelValue: number | null;
  };
}

interface UpDownClosedMetadataObservation {
  eventMetadata: {
    finalPrice: number;
    priceToBeat: number;
  };
  eventMetadataSemantics: string;
  market: {
    eventStartTime: string;
    endDate: string;
    outcomes: unknown;
    outcomePrices: unknown;
  };
}

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
    assert.equal(btc.outcomeType, "binary");
    assert.equal(btc.outcomes.primary.label, "Yes");
    assert.equal(btc.outcomes.secondary.label, "No");
    assert.equal(btc.outcomes.primary.tokenId.length > 0, true);
    assert.equal(btc.outcomes.secondary.tokenId.length > 0, true);
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
    const tokenId = result.markets[0]?.outcomes.primary.tokenId;
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

  it("parses observed live public Gamma binary outcome string shapes", () => {
    const market = liveGammaSamples.observations.publicSearchBitcoin.firstEvent.markets[0];
    assert.ok(market);

    const tokenIds = parseTokenIds(market.clobTokenIds);
    assert.equal(tokenIds?.length, 2);
    assert.deepEqual(parseOutcomeLabels(market.outcomes), ["Yes", "No"]);
    const outcomes = parseBinaryOutcomes(market.clobTokenIds, market.outcomes);
    assert.equal(outcomes?.[0].label, "Yes");
    assert.equal(outcomes?.[1].label, "No");
    assert.deepEqual(outcomes?.map((outcome) => outcome.tokenId), tokenIds);
    assert.equal(parseBinaryOutcomes(market.clobTokenIds, undefined), undefined);
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

  it("parses observed Up/Down target-family outcomes as binary labels", () => {
    const btc5m = liveTargetDiscoverySamples.observations.btc5mActive;

    assert.deepEqual(parseOutcomeLabels(btc5m.market.outcomes), ["Up", "Down"]);
    const outcomes = parseBinaryOutcomes(btc5m.market.clobTokenIds, btc5m.market.outcomes);
    assert.equal(outcomes?.[0].role, "primary");
    assert.equal(outcomes?.[0].label, "Up");
    assert.equal(outcomes?.[1].role, "secondary");
    assert.equal(outcomes?.[1].label, "Down");
  });

  it("keeps observed Up/Down target-family samples fail-closed when order book or live classification is not proven", () => {
    const btc5m = liveTargetDiscoverySamples.observations.btc5mActive;

    const normalized = normalizeEventMarket({
      event: btc5m,
      market: btc5m.market,
      classification: {
        asset: "BTC",
        window: "10m",
        source: "fixture_metadata",
        evidence: ["Deliberately forced in test to prove binary outcome parsing does not open discovery."]
      },
      sourceMode: "live_public",
      sourceIds: ["polymarket-target-discovery-2026-04-22"]
    });

    assert.equal(normalized.candidate, undefined);
    assert.equal(normalized.rejection, "enableOrderBook is not true");
  });

  it("records 5M Up/Down payoff wording without enabling runtime extraction", () => {
    const btc = liveUpDownPayoffEvidenceSamples.observations.btc5mActiveChainlink;
    const eth = liveUpDownPayoffEvidenceSamples.observations.eth5mActiveChainlink;

    assert.equal(liveUpDownPayoffEvidenceSamples.metadata.requestCount, 12);
    assert.equal(
      liveUpDownPayoffEvidenceSamples.metadata.classificationStatus,
      "payoff_semantics_observed_for_5m_chainlink_samples_target_10m_1h_still_unconfirmed"
    );
    assert.equal(
      liveUpDownPayoffEvidenceSamples.metadata.extractionReadiness,
      "research_evidence_only_runtime_extraction_not_implemented"
    );

    for (const sample of [btc, eth]) {
      assert.equal(sample.tags.includes("up-or-down"), true);
      assert.equal(sample.tags.includes("5M"), true);
      assert.match(sample.descriptionEvidence, /greater than or equal to the price at the beginning/);
      assert.equal(sample.payoffEvidence.kind, "up_down_reference_comparison");
      assert.equal(sample.payoffEvidence.primaryWinsWhen, "end_price_greater_than_or_equal_to_beginning_price");
      assert.equal(sample.payoffEvidence.secondaryWinsWhen, "otherwise");
      assert.equal(sample.payoffEvidence.referenceLevelKind, "beginning_price");
      assert.equal(sample.payoffEvidence.settlementLevelKind, "end_price");
      assert.equal(sample.payoffEvidence.tieRule, "primary_wins_on_equal");
      assert.equal(sample.payoffEvidence.referenceLevelValue, null);
      assert.equal(sample.payoffEvidence.settlementLevelValue, null);
      assert.deepEqual(parseOutcomeLabels(sample.market.outcomes), ["Up", "Down"]);
      assert.equal(sample.market.enableOrderBook, false);
    }

    assert.equal(btc.resolutionSource, "https://data.chain.link/streams/btc-usd");
    assert.equal(eth.resolutionSource, "https://data.chain.link/streams/eth-usd");
  });

  it("records closed 5M metadata fields as observed but not runtime-ready schema", () => {
    const btc = liveUpDownPayoffEvidenceSamples.observations.btc5mClosedChainlinkMetadata;
    const eth = liveUpDownPayoffEvidenceSamples.observations.eth5mClosedChainlinkMetadata;

    for (const sample of [btc, eth]) {
      assert.equal(typeof sample.eventMetadata.finalPrice, "number");
      assert.equal(typeof sample.eventMetadata.priceToBeat, "number");
      assert.equal(sample.eventMetadataSemantics, "observed_field_names_only_schema_semantics_unconfirmed");
      assert.deepEqual(parseOutcomeLabels(sample.market.outcomes), ["Up", "Down"]);
      assert.equal(sample.market.eventStartTime.length > 0, true);
      assert.equal(sample.market.endDate.length > 0, true);
    }
  });

  it("keeps fixed-threshold Up/Down-like evidence out of target extraction", () => {
    const sample = liveUpDownPayoffEvidenceSamples.observations.btcThresholdOutOfScope;

    assert.equal(sample.tags.includes("up-or-down"), false);
    assert.equal(sample.thresholdEvidence.kind, "fixed_threshold");
    assert.equal(sample.thresholdEvidence.thresholdValue, 93445.45);
    assert.equal(
      sample.thresholdEvidence.targetFamilyStatus,
      "out_of_scope_for_current_btc_eth_10m_1h_updown_discovery"
    );
    assert.deepEqual(parseOutcomeLabels(sample.market.outcomes), ["Up", "Down"]);
  });
});
