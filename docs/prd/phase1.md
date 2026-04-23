# Phase 1 Product Scope

## Goal

Provide a local, read-only research terminal for BTC/ETH prediction-market event contracts with a narrow Polymarket-first workflow.

## Supported Scope

- Assets: BTC and ETH.
- Windows: 10m and 1h.
- Venue: Polymarket as the primary research venue.
- Current mode: read-only market discovery and display.
- Scanner: RC-1 endpoint and page with filtering, sorting, pricing-engine v0 placeholder fair-value, edge fields, and evidence metadata.
- Market Detail: read-only v0 page for normalized fixture-backed markets.
- Market contract: binary outcome markets only. Outcome labels are preserved from upstream, so `Yes`/`No` and observed `Up`/`Down` labels can be represented. Multi-outcome markets are out of scope.
- Pricing-engine v1: research boundary only; no real probability model is implemented.
- Up/Down payoff/reference-level extraction: research contract only. The observed 5M Chainlink
  samples have stronger payoff evidence, but no runtime extraction or non-placeholder pricing is
  implemented.

## Current User Workflow

1. Start the API gateway in fixture mode.
2. Start the pricing-engine placeholder service if testing scanner placeholder integration.
3. Start the web app.
4. View fixture-backed BTC/ETH markets in the Markets Scanner page.
5. Filter or sort the current fixture-backed candidate set.
6. Open a read-only Market Detail page to inspect outcomes, timing, provenance, book snapshot, placeholder pricing, and evidence gaps.
7. Inspect API responses for normalized market, order-book, rejection summary, and placeholder fair-value shape.

## Non-Goals

- No real-money trading.
- No automated bot.
- No private/authenticated vendor APIs.
- No Predict.fun or Binance Wallet implementation.
- No real pricing model; pricing-engine v0 returns `null` fair probabilities and placeholder metadata.
- No non-placeholder pricing-engine v1 output until data freshness and validation standards are met.
- No non-placeholder Up/Down quote until payoff specification, reference/start/strike level,
  settlement source, comparator, tie rule, and freshness are confirmed for the accepted 10m/1h
  target family.
- No paper broker.
- No replay engine.
- No advanced market detail charting, trading action, or replay workflow.
- No multi-outcome market support.
- No full historical signal overlay on the primary chart.

## Acceptance Criteria For Current Slice

- Web page loads from the local API gateway.
- API gateway returns fixture-backed Polymarket markets.
- Contract tests prove binary outcome parsing and fail-closed behavior.
- Scanner supports read-only filtering, sorting, and fail-closed metadata display.
- Market Detail v0 exposes normalized binary outcomes, provenance, placeholder pricing, and open evidence gaps without trade controls.
- Placeholder scanner fields are clearly marked and sourced from the pricing-engine v0 placeholder contract where available.
- Pricing-engine v1 research documents define required features, freshness rules, and calibration gates before any implementation.
- Up/Down payoff research documents define fail-closed evidence requirements before extraction or
  pricing implementation.
- Documentation explains current limitations.

## TODO

- TODO: Capture approved live Polymarket public fixtures.
- TODO: Confirm BTC/ETH and 10m/1h identification rules from official/public evidence.
- TODO: Replace synthetic fixture classification with confirmed fixture-backed classification where possible.
- TODO: Confirm Polymarket Up/Down payoff, reference level, settlement source, comparator, and tie
  rule before pricing-engine v1 implementation.
