# Phase 1 Product Scope

## Goal

Provide a local, read-only research terminal for BTC/ETH prediction-market event contracts with a narrow Polymarket-first workflow.

## Supported Scope

- Assets: BTC and ETH.
- Windows: 10m and 1h.
- Venue: Polymarket as the primary research venue.
- Current mode: read-only market discovery and display.
- Scanner: minimal endpoint and page with pricing-engine v0 placeholder fair-value and edge fields.
- Market contract: binary outcome markets only. Outcome labels are preserved from upstream, so `Yes`/`No` and observed `Up`/`Down` labels can be represented. Multi-outcome markets are out of scope.
- Pricing-engine v1: research boundary only; no real probability model is implemented.

## Current User Workflow

1. Start the API gateway in fixture mode.
2. Start the pricing-engine placeholder service if testing scanner placeholder integration.
3. Start the web app.
4. View fixture-backed BTC/ETH markets in the Markets Scanner page.
5. Inspect API responses for normalized market, order-book, and placeholder fair-value shape.

## Non-Goals

- No real-money trading.
- No automated bot.
- No private/authenticated vendor APIs.
- No Predict.fun or Binance Wallet implementation.
- No real pricing model; pricing-engine v0 returns `null` fair probabilities and placeholder metadata.
- No non-placeholder pricing-engine v1 output until data freshness and validation standards are met.
- No paper broker.
- No replay engine.
- No market detail page.
- No multi-outcome market support.
- No full historical signal overlay on the primary chart.

## Acceptance Criteria For Current Slice

- Web page loads from the local API gateway.
- API gateway returns fixture-backed Polymarket markets.
- Contract tests prove binary outcome parsing and fail-closed behavior.
- Placeholder scanner fields are clearly marked and sourced from the pricing-engine v0 placeholder contract where available.
- Pricing-engine v1 research documents define required features, freshness rules, and calibration gates before any implementation.
- Documentation explains current limitations.

## TODO

- TODO: Capture approved live Polymarket public fixtures.
- TODO: Confirm BTC/ETH and 10m/1h identification rules from official/public evidence.
- TODO: Replace synthetic fixture classification with confirmed fixture-backed classification where possible.
