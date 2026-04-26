# Phase 1 Product Scope

## Goal

Provide a local, read-only research terminal for BTC/ETH prediction-market event contracts with a narrow Polymarket-first workflow.

## Supported Scope

- Assets: BTC and ETH.
- Windows: 10m and 1h.
- Venue: Polymarket as the primary research venue.
- Current mode: read-only market discovery and display.
- Scanner: RC-2 endpoint and page with filtering, URL query state, sorting, pricing-engine v0 placeholder fair-value, edge fields, and evidence metadata.
- Market Detail: read-only RC-3 page backed by `MarketDetailResponse` for normalized fixture-backed markets with evidence-first provenance organization.
- Research Signals: fixture-default BTC/ETH 5m/10m technical research bias with explicit
  `isResearchOnly: true` and `isTradeAdvice: false`. RC-8 adds explicit local live mode using
  Coinbase Exchange public OHLCV candles.
- Event Signal Console: RC-9 local research console with BTC/ETH, 5m/10m, fixture/live selectors,
  multi-strategy confluence breakdown, risk filters, recent candlestick chart, recent-only signal
  markers capped at 20, and an on-demand lightweight backtest preview.
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
5. Filter, search, or sort the current fixture-backed candidate set with shareable URL state.
6. Open a read-only Market Detail page to inspect outcomes, timing, provenance, token trace, source trace, related fixture markets, book snapshot, placeholder pricing, and evidence gaps from the API gateway detail contract.
7. Inspect the Event Signal Console for current `LONG bias`, `SHORT bias`, or `NO_SIGNAL`
   research output, including confluence scores, risk filters, reasons, veto reasons, and recent
   signal markers.
8. Open the backtest preview only when needed; treat it as small-sample diagnostics, not a
   predictive guarantee.
9. Inspect API responses for normalized market, order-book, rejection summary, and placeholder fair-value shape.

## Non-Goals

- No real-money trading.
- No automated bot.
- No private/authenticated vendor APIs.
- No Predict.fun or Binance Wallet implementation.
- No real pricing model; pricing-engine v0 returns `null` fair probabilities and placeholder metadata.
- No research signal may be displayed as investment advice, buy/sell instruction, order, leverage,
  position size, or real trading entry.
- No non-placeholder pricing-engine v1 output until data freshness and validation standards are met.
- No non-placeholder Up/Down quote until payoff specification, reference/start/strike level,
  settlement source, comparator, tie rule, and freshness are confirmed for the accepted 10m/1h
  target family.
- No paper broker.
- No replay engine.
- No advanced market detail charting, trading action, or replay workflow.
- No multi-outcome market support.
- No full historical signal overlay on the primary chart.
- No default backtest load on page open.
- No CI dependency on live OHLCV vendors; live signal tests must mock Coinbase Exchange.
- No frequent polling of Coinbase Exchange historical rates.

## Acceptance Criteria For Current Slice

- Web page loads from the local API gateway.
- API gateway returns fixture-backed Polymarket markets.
- Contract tests prove binary outcome parsing and fail-closed behavior.
- Scanner supports read-only filtering, query state, sorting, and fail-closed metadata display.
- Market Detail RC-3 exposes normalized binary outcomes, provenance, token/source trace, related fixture markets, placeholder pricing, and open evidence gaps through a shared API/domain contract without trade controls.
- Fixture-backed API snapshot tests lock stable `/scanner/top` and `/markets/:id/detail` contract projections.
- Scanner/detail responses expose `ept-api-v1` contract metadata and typed `market_not_found`
  errors for local consumers.
- Research signal responses expose `ept-api-v1` metadata, fixture-default or explicit live signals,
  data-quality state, freshness, source mode, warnings, fail-closed reasons, and
  research-only/not-trade-advice flags.
- Event Signal Console exposes `ept-api-v1` metadata, current signal, confluence breakdown, risk
  filters, recent candles, recent-only markers, default-disabled backtest preview, warnings, and
  research-only/not-trade-advice flags.
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
- TODO: Confirm a cache/polling policy before any live Coinbase Exchange OHLCV polling beyond
  explicit local manual use.
