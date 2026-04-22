import type {
  GammaEventsKeysetParams,
  GammaEventsKeysetResponse,
  PolymarketOrderBookSnapshot,
  PolymarketPublicReadTransport
} from "./types.js";

export class PolymarketHttpTransport implements PolymarketPublicReadTransport {
  constructor(
    private readonly config: {
      gammaBaseUrl: string;
      clobBaseUrl: string;
    }
  ) {}

  async listEventsKeyset(params: GammaEventsKeysetParams): Promise<GammaEventsKeysetResponse> {
    const url = new URL("/events/keyset", this.config.gammaBaseUrl);
    if (params.limit !== undefined) {
      url.searchParams.set("limit", String(params.limit));
    }
    if (params.afterCursor) {
      url.searchParams.set("after_cursor", params.afterCursor);
    }
    if (params.closed !== undefined) {
      url.searchParams.set("closed", String(params.closed));
    }

    return this.getJson<GammaEventsKeysetResponse>(url);
  }

  async getOrderBook(tokenId: string): Promise<PolymarketOrderBookSnapshot> {
    const url = new URL("/book", this.config.clobBaseUrl);
    url.searchParams.set("token_id", tokenId);

    return this.getJson<PolymarketOrderBookSnapshot>(url);
  }

  private async getJson<T>(url: URL): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Polymarket public read failed with HTTP ${response.status}`);
    }
    return response.json() as Promise<T>;
  }
}

