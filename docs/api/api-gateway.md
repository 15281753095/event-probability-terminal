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

## Contract Version

Current successful scanner/detail responses use:

```json
{
  "contractVersion": "ept-api-v1",
  "status": "ok",
  "isReadOnly": true,
  "isPlaceholderPricing": true
}
```

These fields live under the response `meta` block. `contractVersion` changes only when the local
API response contract changes in a way that requires consumer review.

Current response kinds:

- `scanner_top`
- `market_detail`

Current status taxonomy:

- `ok`: request succeeded;
- `not_found`: requested local resource id is not in the current adapter result set;
- `unsupported`: request shape is recognized but not supported by the current Phase 1 slice;
- `fail_closed`: data exists but must not be emitted because required evidence is missing.

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

Minimal meta example:

```json
{
  "contractVersion": "ept-api-v1",
  "responseKind": "market_detail",
  "generatedAt": "2026-04-23T00:00:00.000Z",
  "status": "ok",
  "source": "polymarket",
  "mode": "fixture",
  "isFixtureBacked": true,
  "isReadOnly": true,
  "isPlaceholderPricing": true,
  "message": "Market detail is read-only and contract-backed. Pricing, confidence, and edge remain placeholders."
}
```

## Error Responses

Typed errors use `ApiErrorResponse` from `packages/shared-types`.

Current implemented error:

```json
{
  "contractVersion": "ept-api-v1",
  "status": "not_found",
  "error": "market_not_found",
  "message": "Market not found in current Polymarket public-read adapter result set.",
  "generatedAt": "2026-04-23T00:00:00.000Z",
  "supportedIds": ["polymarket:mkt-btc-1h-demo"]
}
```

Reserved but not broadly emitted yet:

- `unsupported_market`
- `out_of_scope`

## Contract Snapshots

The two most important local read-only API contracts are locked by fixture-backed tests:

- `apps/api-gateway/tests/snapshots/scanner-top.fixture.json`
- `apps/api-gateway/tests/snapshots/market-detail-btc-1h.fixture.json`

The tests use fixture mode, a fixed clock, and a deterministic unavailable pricing-engine client.
They lock stable contract fields, including normalized market identity, binary outcomes,
placeholder fair value shape, scanner metadata, research readiness, token/source/evidence trace,
open gaps, related fixture markets, and fixture-backed book fields.

They intentionally do not lock live vendor responses, real wall-clock time, or machine-specific
network error text.

## Explicit Non-Goals

- No real pricing model.
- No trading, order placement, cancellation, wallet, funding, or settlement action.
- No private/authenticated vendor endpoint.
- No Predict.fun or Binance adapter.
- No live fixture capture or external API expansion from this endpoint.
- No raw upstream payload in API responses.

## TODO

- TODO: Keep `MarketDetailResponse` synchronized with shared types and Playwright smoke coverage.
- TODO: Update snapshot files only when a contract change is intentional and documented.
- TODO: Add a persistence/cache ADR before backing these endpoints with PostgreSQL or Redis.
- TODO: Add an `ept-api-v2` migration note if a breaking response change is introduced.
