import type { Asset, TimeWindow } from "@ept/shared-types";
import { PolymarketFixtureTransport } from "./fixture-transport.js";
import { PolymarketHttpTransport } from "./http-transport.js";
import { extractMarkets, normalizeEventMarket } from "./normalizer.js";
import type {
  DiscoverEventMarketsInput,
  DiscoverEventMarketsResult,
  EventMarketCandidate,
  PolymarketAdapterConfig,
  PolymarketClassification,
  PolymarketOrderBookSnapshot,
  PolymarketPublicReadTransport
} from "./types.js";

const DEFAULT_SOURCE_IDS = ["polymarket-events-keyset", "polymarket-clob-public-read"];

export class PolymarketPublicReadAdapter {
  constructor(
    private readonly transport: PolymarketPublicReadTransport,
    private readonly options: {
      sourceMode: "fixture" | "live_public";
      classificationByMarketId: Record<string, PolymarketClassification>;
      sourceIds?: string[];
    }
  ) {}

  async discoverEventMarkets(input: DiscoverEventMarketsInput): Promise<DiscoverEventMarketsResult> {
    const page = await this.transport.listEventsKeyset({
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.cursor ? { afterCursor: input.cursor } : {}),
      closed: false
    });
    const requestedAssets = new Set<Asset>(input.assets);
    const requestedWindows = new Set<TimeWindow>(input.windows);
    const markets: EventMarketCandidate[] = [];
    const rejected: DiscoverEventMarketsResult["rejected"] = [];

    for (const event of page.events) {
      for (const market of extractMarkets(event)) {
        const marketId = typeof market.id === "string" ? market.id : undefined;
        const normalized = normalizeEventMarket({
          event,
          market,
          sourceMode: this.options.sourceMode,
          sourceIds: this.options.sourceIds ?? DEFAULT_SOURCE_IDS,
          ...(marketId && this.options.classificationByMarketId[marketId]
            ? { classification: this.options.classificationByMarketId[marketId] }
            : {})
        });

        if (normalized.rejection) {
          rejected.push(rejection(normalized.rejection, marketId));
          continue;
        }

        const candidate = normalized.candidate;
        if (!candidate) {
          rejected.push(rejection("normalizer returned no candidate", marketId));
          continue;
        }

        if (!requestedAssets.has(candidate.asset) || !requestedWindows.has(candidate.window)) {
          rejected.push(rejection("candidate outside requested asset/window scope", marketId));
          continue;
        }

        markets.push(candidate);
      }
    }

    return {
      markets,
      rejected,
      uncertainty: [
        "TODO: live classification requires approved public fixture capture and documented BTC/ETH 10m/1h taxonomy"
      ],
      ...(page.next_cursor ? { nextCursor: page.next_cursor } : {})
    };
  }

  async getMarketById(id: string): Promise<EventMarketCandidate | undefined> {
    const result = await this.discoverEventMarkets({
      assets: ["BTC", "ETH"],
      windows: ["10m", "1h"]
    });
    return result.markets.find((market) => market.id === id || market.market.id === id);
  }

  async getOrderBook(tokenId: string): Promise<PolymarketOrderBookSnapshot> {
    return this.transport.getOrderBook(tokenId);
  }
}

function rejection(reason: string, marketId?: string) {
  return {
    reason,
    ...(marketId ? { marketId } : {})
  };
}

export function createPolymarketPublicReadAdapter(config?: Partial<PolymarketAdapterConfig>) {
  const sourceMode = config?.sourceMode ?? "fixture";
  if (sourceMode === "live_public") {
    return new PolymarketPublicReadAdapter(
      new PolymarketHttpTransport({
        gammaBaseUrl: config?.gammaBaseUrl ?? "https://gamma-api.polymarket.com",
        clobBaseUrl: config?.clobBaseUrl ?? "https://clob.polymarket.com"
      }),
      {
        sourceMode,
        classificationByMarketId: {},
        sourceIds: DEFAULT_SOURCE_IDS
      }
    );
  }

  const fixtureTransport = new PolymarketFixtureTransport();
  return new PolymarketPublicReadAdapter(fixtureTransport, {
    sourceMode: "fixture",
    classificationByMarketId: fixtureTransport.getClassificationMap(),
    sourceIds: fixtureTransport.getFixtureMetadata().sourceIds
  });
}
