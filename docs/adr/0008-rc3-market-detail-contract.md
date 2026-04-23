# ADR 0008: RC-3 Market Detail Response Contract

Date: 2026-04-23

## Status

Accepted

## Context

RC-2 added an evidence-first Market Detail page. The page was useful, but it assembled research
readiness, token trace, source trace, evidence trail, related fixture markets, order-book snapshot,
and placeholder pricing by calling multiple API endpoints and shaping those sections locally.

That made the UI harder to test and made the research workflow semantics implicit in the page
instead of explicit in shared contracts.

## Decision

Add a shared `MarketDetailResponse` contract and serve it from:

```text
GET /markets/:id/detail
```

The response organizes:

- normalized binary `EventMarket`;
- optional placeholder `ScannerCandidate`;
- optional fixture-backed `OrderBookSnapshot`;
- `ResearchReadiness`;
- token trace;
- source trace;
- evidence trail;
- open evidence gaps;
- related fixture-market summaries;
- read-only placeholder metadata.

The web Market Detail page consumes this single endpoint. The legacy `/markets/:id`,
`/markets/:id/book`, and `/scanner/top` endpoints remain available for narrower API inspection and
scanner workflows.

## Consequences

- Market Detail research semantics now live in shared/API contracts instead of page-local ad-hoc
  shaping.
- API tests can validate detail response shape without browser rendering.
- Playwright smoke can remain small and check that the page renders the contract-backed sections.
- This does not add live vendor access, CLOB expansion, real pricing, trading, paper broker, or
  replay behavior.
- Pricing, confidence, and edge remain placeholder-only.

## TODO

- TODO: Keep future detail sections contract-backed instead of assembling them only in the web
  layer.
- TODO: Add response versioning if this local API becomes a public external contract.
