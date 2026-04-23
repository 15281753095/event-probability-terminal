import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import type {
  EventMarket,
  FairValueSnapshot,
  MarketDetailResponse,
  ScannerCandidate,
  ScannerTopResponse
} from "@ept/shared-types";
import { buildServer } from "../src/server.js";

const fixtureMarketId = "polymarket:mkt-btc-1h-demo";
const fixedRequestedAt = "2026-04-23T00:00:00.000Z";

describe("fixture-backed API response contracts", () => {
  it("locks the normalized /scanner/top response contract", async () => {
    const server = buildSnapshotServer();
    const response = await server.inject({
      method: "GET",
      url: "/scanner/top"
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<ScannerTopResponse>();
    assert.deepEqual(
      scannerContractSnapshot(payload),
      await readJsonSnapshot("scanner-top.fixture.json")
    );

    await server.close();
  });

  it("locks the normalized /markets/:id/detail response contract", async () => {
    const server = buildSnapshotServer();
    const response = await server.inject({
      method: "GET",
      url: `/markets/${encodeURIComponent(fixtureMarketId)}/detail`
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json<MarketDetailResponse>();
    assert.equal(payload.candidate?.market.id, payload.market.id);
    assert.deepEqual(
      detailContractSnapshot(payload),
      await readJsonSnapshot("market-detail-btc-1h.fixture.json")
    );

    await server.close();
  });
});

function buildSnapshotServer() {
  return buildServer({
    logger: false,
    now: () => fixedRequestedAt,
    pricingEngine: {
      quoteFairValue: async (market: EventMarket, requestedAt: string): Promise<FairValueSnapshot> => {
        throw new Error(`snapshot pricing-engine unavailable for ${market.id} at ${requestedAt}`);
      }
    },
    sourceMode: "fixture"
  });
}

async function readJsonSnapshot<T>(name: string): Promise<T> {
  const fileUrl = new URL(`./snapshots/${name}`, import.meta.url);
  return JSON.parse(await readFile(fileUrl, "utf8")) as T;
}

function scannerContractSnapshot(payload: ScannerTopResponse) {
  return {
    candidates: payload.candidates.map((candidate) => ({
      market: candidate.market,
      fairValue: candidate.fairValue,
      tradeCandidate: tradeCandidateContract(candidate),
      isPlaceholder: candidate.isPlaceholder
    })),
    meta: payload.meta
  };
}

function detailContractSnapshot(payload: MarketDetailResponse) {
  return {
    market: payload.market,
    relatedMarkets: payload.relatedMarkets,
    researchReadiness: payload.researchReadiness,
    tokenTrace: payload.tokenTrace,
    sourceTrace: payload.sourceTrace,
    evidenceTrail: payload.evidenceTrail,
    openGaps: payload.openGaps,
    meta: payload.meta,
    ...(payload.candidate
      ? {
          candidate: {
          marketId: payload.candidate.market.id,
          fairValue: payload.candidate.fairValue,
          tradeCandidate: tradeCandidateContract(payload.candidate),
          isPlaceholder: payload.candidate.isPlaceholder
        }
        }
      : {}),
    ...(payload.book ? { book: payload.book } : {})
  };
}

function tradeCandidateContract(candidate: ScannerCandidate) {
  return {
    marketId: candidate.tradeCandidate.marketId,
    outcomeRole: candidate.tradeCandidate.outcomeRole,
    outcomeLabel: candidate.tradeCandidate.outcomeLabel,
    edge: candidate.tradeCandidate.edge,
    isPlaceholder: candidate.tradeCandidate.isPlaceholder,
    reason: candidate.tradeCandidate.reason,
    ...(candidate.tradeCandidate.fairValue
      ? {
          fairValue: {
          marketId: candidate.tradeCandidate.fairValue.marketId,
          modelVersion: candidate.tradeCandidate.fairValue.modelVersion,
          isPlaceholder: candidate.tradeCandidate.fairValue.isPlaceholder,
          createdAt: candidate.tradeCandidate.fairValue.createdAt
        }
        }
      : {})
  };
}
