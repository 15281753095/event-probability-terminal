# ADR 0003: Pricing Engine v0 Placeholder Contract

Status: Accepted

Date: 2026-04-22 Asia/Shanghai

## Context

`EventMarket` now uses a minimal binary-outcome contract with `outcomes.primary` and `outcomes.secondary`. The scanner MVP previously produced placeholder fair probability and edge fields inside the API gateway without a pricing-engine boundary.

That made the UI usable, but it did not define how pricing code will consume binary outcomes later.

## Decision

Define pricing-engine v0 as a read-only placeholder HTTP contract:

- `GET /healthz`
- `POST /v0/fair-value`

The request accepts one normalized binary `EventMarket` and `requestedAt`.

The response returns one `FairValueSnapshot` with:

- `fairProbabilityByOutcome.primary.probability: null`
- `fairProbabilityByOutcome.secondary.probability: null`
- `confidence: null`
- `reasons`
- `inputFeatures`
- `modelVersion: "pricing-engine-v0-placeholder"`
- `isPlaceholder: true`

The API gateway calls this service for `GET /scanner/top`. If the service is unavailable, the gateway returns the same placeholder shape through a local fallback and marks that fallback in response metadata.

## Rationale

This contract is sufficient for the current read-only scanner MVP because it:

- explicitly consumes `outcomes.primary` and `outcomes.secondary`;
- keeps probability estimation separate from trade-candidate and edge semantics;
- makes placeholder status visible in type, API, and UI layers;
- avoids implementing a model before live discovery, data freshness, and validation rules are known.

## Consequences

- Scanner output now has a stable fair-value response shape.
- The web page can display placeholder pricing metadata without implying real model output.
- The pricing-engine remains isolated from vendor adapters and external APIs.
- No real fair probability, confidence, or edge exists yet.

## TODO

- TODO: Define real pricing input features after market-data freshness and historical data contracts are confirmed.
- TODO: Add model validation criteria before returning non-null probabilities.
- TODO: Keep paper trading and strategy decisions outside pricing-engine v0.
