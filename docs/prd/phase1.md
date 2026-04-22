# Phase 1 Product Scope

## Goal

Provide a local, read-only research terminal for BTC/ETH prediction-market event contracts with a narrow Polymarket-first workflow.

## Supported Scope

- Assets: BTC and ETH.
- Windows: 10m and 1h.
- Venue: Polymarket as the primary research venue.
- Current mode: read-only market discovery and display.
- Scanner: minimal endpoint and page with placeholder fair-value and edge fields.
- Market contract: binary outcome markets only. Outcome labels are preserved from upstream, so `Yes`/`No` and observed `Up`/`Down` labels can be represented. Multi-outcome markets are out of scope.

## Current User Workflow

1. Start the API gateway in fixture mode.
2. Start the web app.
3. View fixture-backed BTC/ETH markets in the Markets Scanner page.
4. Inspect API responses for normalized market and order-book shape.

## Non-Goals

- No real-money trading.
- No automated bot.
- No private/authenticated vendor APIs.
- No Predict.fun or Binance Wallet implementation.
- No real pricing model.
- No paper broker.
- No replay engine.
- No market detail page.
- No multi-outcome market support.
- No full historical signal overlay on the primary chart.

## Acceptance Criteria For Current Slice

- Web page loads from the local API gateway.
- API gateway returns fixture-backed Polymarket markets.
- Contract tests prove binary outcome parsing and fail-closed behavior.
- Placeholder scanner fields are clearly marked.
- Documentation explains current limitations.

## TODO

- TODO: Capture approved live Polymarket public fixtures.
- TODO: Confirm BTC/ETH and 10m/1h identification rules from official/public evidence.
- TODO: Replace synthetic fixture classification with confirmed fixture-backed classification where possible.
