# Architecture

## Current Shape

Event Probability Terminal is a monorepo with separate boundaries for UI, API gateway, market ingestion, shared contracts, and research services.

```text
apps/web
  -> apps/api-gateway
    -> services/market-ingestor
      -> Polymarket public-read adapter boundary
        -> local fixtures by default

packages/shared-types
  -> shared contracts used by web, api-gateway, and market-ingestor

services/pricing-engine
  -> Python health shell only
```

## Service Boundaries

### Web

`apps/web` renders the Markets Scanner v0. It calls the local API gateway and does not call market vendors directly.

### API Gateway

`apps/api-gateway` exposes the minimal read-only API:

- `GET /healthz`
- `GET /markets`
- `GET /markets/:id`
- `GET /markets/:id/book`
- `GET /scanner/top`

Scanner output currently includes explicit placeholder fair-value and edge fields.

### Market Ingestor

`services/market-ingestor` owns external market adapter boundaries. The current Polymarket adapter is fixture-first and fail-closed for unconfirmed classification.

Live public mode exists as an adapter transport path, but BTC/ETH and 10m/1h classification is not opened until approved public fixtures confirm the mapping.

### Shared Types

`packages/shared-types` owns the current cross-package TypeScript contracts:

- `EventMarket`
- `OrderBookSnapshot`
- `FairValueSnapshot` placeholder
- `TradeCandidate` placeholder

The types intentionally avoid encoding unconfirmed upstream Polymarket fields as stable domain contracts.

`EventMarket` currently models only binary markets. It preserves upstream outcome labels and token IDs as `outcomes.primary` and `outcomes.secondary`, so both `Yes`/`No` and observed `Up`/`Down` labels can be represented without creating a general multi-outcome model. The contract does not infer pricing, trading direction, or strategy side from those labels.

### Pricing Engine

`services/pricing-engine` is a Python health shell. It does not compute fair probability, edge, or trade recommendations.

## Data Flow

1. Web requests scanner data from `apps/api-gateway`.
2. API gateway calls the Polymarket public-read adapter.
3. Adapter reads local fixtures by default.
4. Adapter normalizes accepted markets into `EventMarket`.
5. API gateway strips raw upstream payloads before returning API responses.

## Current Infrastructure

`docker-compose.yml` defines local PostgreSQL and Redis. They are available for later persistence and caching work but are not used by the current fixture-backed flow.

## Constraints

- No real-money trading.
- No private/authenticated vendor endpoints.
- No business-layer raw vendor HTTP requests.
- No Predict.fun or Binance Wallet implementation in the current slice.
- No multi-outcome market support in the current domain contract.
- All unconfirmed external details must remain marked `TODO`.

## TODO

- TODO: Confirm BTC/ETH 10m/1h live discovery rules before opening live classification.
- TODO: Add persistence ADR before using PostgreSQL.
- TODO: Add cache/data freshness ADR before using Redis.
- TODO: Design pricing-engine service contract before adding any model implementation.
