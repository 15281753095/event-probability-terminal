# ADR 0023: RC-19 Fair Value Chart Markers

Date: 2026-05-06

## Status

Accepted for RC-19.

## Context

RC-17 added Binance Spot public realtime price and K-line data. RC-18 added read-only Polymarket
Gamma discovery and CLOB public odds diagnostics for active BTC/ETH markets. The next minimal
vertical slice is to put strategy research signals on the K-line chart, but only after a
fail-closed market eligibility gate proves that a market is suitable for a simple BTC/ETH
price-threshold calculation.

This project remains Phase 1 research infrastructure. It must not add authenticated endpoints,
wallets, API keys, private keys, account state, order placement, cancellation, balances, positions,
auto execution, or guaranteed-profit claims.

## Decision

RC-19 adds a research-only fair value engine and chart markers.

- The API endpoint is `GET /signals/fair-value?symbol=BTC|ETH|ALL`.
- The model is `realized-vol-terminal-probability-v1`.
- The model estimates terminal probability from recent closed-candle log-return realized
  volatility, current underlying price, extracted threshold, and time horizon.
- The output compares model probability with Polymarket Yes/No market probability after explicit
  fee/slippage buffers.
- The chart renders markers for `LONG_YES`, `LONG_NO`, `NO_SIGNAL`, and `REJECTED`.
- Markers are research annotations, not trade instructions.
- The console UI must show Research Only, Not Trading Advice, and No Auto Execution labels.

## Eligibility Gate

The eligibility gate is more important than the model. A market must be rejected before fair value
calculation unless it has:

- clear BTCUSDT or ETHUSDT binding;
- binary Yes/No token IDs;
- Yes/No price or midpoint evidence;
- spread within the configured maximum;
- known liquidity status meeting the configured minimum;
- explicit threshold price;
- clear terminal above/below direction;
- valid expiry/end date;
- no BTC+ETH ambiguity;
- sufficiently explicit resolution rule.

Path-dependent or vague markets, including examples like "Will bitcoin hit $1m before GTA VI?",
fail closed. `HIT`, `reach`, `touch`, and `trade above/below` events are not modeled by the v1
terminal-probability engine.

## Live Versus Mock

Live mode must never fabricate eligible markets or markers. If live Polymarket discovery returns no
eligible markets, the endpoint returns empty `snapshots`, explicit `rejectedMarkets` when present,
and warnings. Deterministic mock fixtures are allowed only for UI and CI smoke tests and must be
labeled `DEV MOCK`.

## Consequences

- The project now has the first chart-level strategy marker surface.
- The engine remains explainable: outputs include inputs, method, assumptions, warnings, rejection
  reasons, confidence, and `isResearchOnly: true`.
- No market that fails eligibility can receive edge computation.
- This does not implement real-money trading, authenticated Polymarket CLOB trading, Binance
  private endpoints, a paper broker, replay engine, wallet integration, or production execution.
