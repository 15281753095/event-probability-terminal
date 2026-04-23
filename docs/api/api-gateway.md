# API Gateway

Status: implemented for the local read-only fixture-backed slice.

The API gateway is the only HTTP surface consumed by the web app. It owns scanner/detail response
organization and calls adapter boundaries internally. The web app must not call vendor APIs
directly.

## Current Endpoints

Base URL in local development:

```text
http://localhost:4000
```

| Method | Path | Status | Notes |
| --- | --- | --- | --- |
| `GET` | `/healthz` | Current | Service health only. |
| `GET` | `/markets` | Current | Fixture-backed normalized Polymarket `EventMarket[]` plus rejection metadata. |
| `GET` | `/markets/:id` | Current | Single normalized market by internal normalized id. |
| `GET` | `/markets/:id/book` | Current | Fixture-backed order-book snapshot for the market primary outcome token. |
| `GET` | `/markets/:id/detail` | Current | RC-3 `MarketDetailResponse` for read-only research workflow. |
| `GET` | `/scanner/top` | Current | Read-only scanner response with placeholder fair value and edge fields. |

## `GET /markets/:id/detail`

Purpose: provide a single contract-backed payload for Market Detail. This prevents the web page
from independently stitching together scanner, market, book, provenance, and placeholder pricing
state.

Current response shape is `MarketDetailResponse` from `packages/shared-types`:

- `market`: normalized binary `EventMarket`;
- `candidate`: optional placeholder `ScannerCandidate`;
- `book`: optional fixture-backed `OrderBookSnapshot`;
- `relatedMarkets`: small server-organized list of other normalized fixture markets;
- `researchReadiness`: binary outcome contract state, pricing placeholder status, classification
  source, open evidence gap count, and notes;
- `tokenTrace`: outcome token ids plus condition/question ids;
- `sourceTrace`: source id evidence items;
- `evidenceTrail`: classification/provenance evidence items;
- `openGaps`: uncertainty items that must remain fail-closed;
- `meta`: source, source mode, and read-only placeholder message.

## Explicit Non-Goals

- No real pricing model.
- No trading, order placement, cancellation, wallet, funding, or settlement action.
- No private/authenticated vendor endpoint.
- No Predict.fun or Binance adapter.
- No live fixture capture or external API expansion from this endpoint.
- No raw upstream payload in API responses.

## TODO

- TODO: Keep `MarketDetailResponse` synchronized with shared types and Playwright smoke coverage.
- TODO: Add a persistence/cache ADR before backing these endpoints with PostgreSQL or Redis.
- TODO: Add explicit versioning if external clients begin consuming this API outside local
  development.
