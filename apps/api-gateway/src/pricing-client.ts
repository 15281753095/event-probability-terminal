import type {
  BinaryOutcome,
  EventMarket,
  FairValueSnapshot,
  PricingInputFeatures,
  PricingQuoteRequest
} from "@ept/shared-types";

const MODEL_VERSION = "pricing-engine-v0-placeholder";

export class PricingEngineClient {
  constructor(private readonly baseUrl: string) {}

  async quoteFairValue(market: EventMarket, requestedAt: string): Promise<FairValueSnapshot> {
    const request: PricingQuoteRequest = {
      market,
      requestedAt
    };
    const response = await fetch(`${this.baseUrl}/v0/fair-value`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`pricing-engine returned HTTP ${response.status}`);
    }

    const payload = await response.json() as { fairValue?: FairValueSnapshot };
    if (!payload.fairValue || payload.fairValue.isPlaceholder !== true) {
      throw new Error("pricing-engine response missing placeholder fairValue");
    }
    return payload.fairValue;
  }
}

export function localPricingFallback(market: EventMarket, createdAt: string, reason: string): FairValueSnapshot {
  return {
    marketId: market.id,
    outcomeType: "binary",
    fairProbabilityByOutcome: {
      primary: outcomePlaceholder(market.outcomes.primary),
      secondary: outcomePlaceholder(market.outcomes.secondary)
    },
    confidence: null,
    reasons: [
      reason,
      "Local fallback preserves the pricing-engine v0 placeholder shape; no fair probability is computed."
    ],
    inputFeatures: pricingInputFeatures(market),
    modelVersion: MODEL_VERSION,
    isPlaceholder: true,
    createdAt
  };
}

export function pricingInputFeatures(market: EventMarket): PricingInputFeatures {
  return {
    ...(market.metrics.bestBid !== undefined ? { bestBid: market.metrics.bestBid } : {}),
    ...(market.metrics.bestAsk !== undefined ? { bestAsk: market.metrics.bestAsk } : {}),
    ...(market.metrics.spread !== undefined ? { spread: market.metrics.spread } : {}),
    ...(market.metrics.liquidity !== undefined ? { liquidity: market.metrics.liquidity } : {}),
    ...(market.metrics.volume !== undefined ? { volume: market.metrics.volume } : {}),
    ...(market.metrics.bestBid !== undefined && market.metrics.bestAsk !== undefined
      ? { observedMidpoint: (market.metrics.bestBid + market.metrics.bestAsk) / 2 }
      : {}),
    outcomeLabels: {
      primary: market.outcomes.primary.label,
      secondary: market.outcomes.secondary.label
    }
  };
}

function outcomePlaceholder(outcome: BinaryOutcome) {
  return {
    outcomeRole: outcome.role,
    outcomeLabel: outcome.label,
    probability: null,
    isPlaceholder: true as const
  };
}
