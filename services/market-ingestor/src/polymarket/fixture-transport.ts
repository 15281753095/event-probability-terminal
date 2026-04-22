import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  GammaEventsKeysetParams,
  GammaEventsKeysetResponse,
  PolymarketFixtureDocument,
  PolymarketOrderBookSnapshot,
  PolymarketPublicReadTransport
} from "./types.js";

const defaultFixtureUrl = new URL("../../fixtures/polymarket/local-discovery.json", import.meta.url);

export function loadPolymarketFixture(fixturePath?: string): PolymarketFixtureDocument {
  const path = fixturePath ?? fileURLToPath(defaultFixtureUrl);
  return JSON.parse(readFileSync(path, "utf8")) as PolymarketFixtureDocument;
}

export class PolymarketFixtureTransport implements PolymarketPublicReadTransport {
  constructor(private readonly fixture: PolymarketFixtureDocument = loadPolymarketFixture()) {}

  async listEventsKeyset(params: GammaEventsKeysetParams): Promise<GammaEventsKeysetResponse> {
    const limit = params.limit ?? this.fixture.events.length;
    return {
      events: this.fixture.events.slice(0, limit),
      next_cursor: null
    };
  }

  async getOrderBook(tokenId: string): Promise<PolymarketOrderBookSnapshot> {
    const orderBook = this.fixture.orderBooks[tokenId];
    if (!orderBook) {
      throw new Error(`Fixture order book not found for token ${tokenId}`);
    }
    return orderBook;
  }

  getClassificationMap() {
    return this.fixture.classifications;
  }

  getFixtureMetadata() {
    return this.fixture.metadata;
  }
}

