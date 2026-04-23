# Pricing Engine v0 Placeholder Contract

Status: implemented as placeholder contract only.

Date: 2026-04-22 Asia/Shanghai

## Scope

This document defines the local pricing-engine v0 contract used by the read-only scanner MVP.

The contract is intentionally narrow:

- one normalized binary `EventMarket` in;
- one placeholder `FairValueSnapshot` out;
- no real probability model;
- no edge calculation;
- no strategy decision;
- no vendor HTTP calls.

## Endpoint

```text
GET /healthz
POST /v0/fair-value
```

Default local URL:

```text
http://127.0.0.1:4100
```

## Request

`POST /v0/fair-value` accepts:

```ts
interface PricingQuoteRequest {
  market: EventMarket;
  requestedAt: string;
}
```

Required market contract:

- `market.outcomeType` must be `"binary"`.
- `market.outcomes.primary.label` and `market.outcomes.secondary.label` must be present.
- `market.outcomes.primary.tokenId` and `market.outcomes.secondary.tokenId` are carried through the shared market contract, but the placeholder model does not price tokens.

Input features recorded by v0:

- `bestBid`
- `bestAsk`
- `spread`
- `liquidity`
- `volume`
- `observedMidpoint`, derived only when `bestBid` and `bestAsk` are present
- `outcomeLabels.primary`
- `outcomeLabels.secondary`

These are recorded for explainability. They are not a model.

## Response

```ts
interface FairValueSnapshot {
  marketId: string;
  outcomeType: "binary";
  fairProbabilityByOutcome: {
    primary: {
      outcomeRole: "primary";
      outcomeLabel: string;
      probability: null;
      isPlaceholder: true;
    };
    secondary: {
      outcomeRole: "secondary";
      outcomeLabel: string;
      probability: null;
      isPlaceholder: true;
    };
  };
  confidence: null;
  reasons: string[];
  inputFeatures: PricingInputFeatures;
  modelVersion: "pricing-engine-v0-placeholder";
  isPlaceholder: true;
  createdAt: string;
}
```

## API Gateway Integration

`apps/api-gateway` calls pricing-engine v0 when serving `GET /scanner/top`.

If pricing-engine is unavailable, the API gateway returns the same placeholder shape through a local fallback and marks:

```json
{
  "meta": {
    "pricing": "local-placeholder-fallback"
  }
}
```

When pricing-engine responds successfully, `meta.pricing` is:

```json
{
  "meta": {
    "pricing": "pricing-engine-v0-placeholder"
  }
}
```

## Explicit Non-Goals

- No real fair probability.
- No model confidence.
- No edge calculation.
- No trade candidate ranking beyond existing read-only placeholder output.
- No paper trading.
- No replay.
- No CLOB or external API call.

## TODO

- TODO: Define real pricing features only after live discovery, freshness, and historical data contracts are confirmed.
- TODO: Define calibration and validation criteria before replacing `probability: null`.
- TODO: Decide whether pricing-engine should remain HTTP in local development or move to a typed RPC boundary later.

## Related Research

- `docs/api/pricing-engine-v1-research.md` defines the v1 research-only contract, feature
  requirements, freshness rules, and validation gate.
- `research/reports/pricing-engine-v1-research-plan.md` summarizes the implementation preconditions
  for any future non-placeholder model.
