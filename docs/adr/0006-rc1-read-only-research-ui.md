# ADR 0006: RC-1 Read-Only Research UI

Date: 2026-04-23

## Status

Accepted

## Context

The repository already has a fixture-first Polymarket adapter, binary `EventMarket` contract,
pricing-engine v0 placeholder contract, and a minimal scanner page. Public product research shows
that the next useful step is not a real model or trading workflow, but better inspection and
explainability for the read-only research loop.

Current constraints still apply:

- no real-money trading;
- no private/authenticated adapter;
- no Predict.fun or Binance adapter;
- no real pricing-engine model;
- no replay or paper broker;
- no unverified live target discovery rule.

## Decision

RC-1 adds only read-only research UI and metadata improvements:

1. Scanner filter and sort controls for the current normalized candidates.
2. Market Detail v0 for a single normalized market.
3. Evidence/provenance and fail-closed summary metadata surfaced through the API and web UI.

Pricing output remains placeholder-only. The UI must make that visible wherever fair probability,
confidence, edge, or candidate language appears.

## Consequences

- `GET /scanner/top` includes scanner metadata describing pricing placeholder mode, rejected count,
  rejection summary, and uncertainty.
- The web app supports `/` as the scanner and `/markets/:id` as a read-only detail page.
- Market Detail v0 may display an existing fixture-backed order-book snapshot, but it does not add
  new CLOB capture, polling, or trading behavior.
- Up/Down payoff extraction and pricing-engine v1 remain research-only until their evidence gates
  are satisfied.

## Non-Goals

- No pricing v1 implementation.
- No market detail charting workflow.
- No order placement, paper trading, or wallet action.
- No additional venue adapter.
- No new live fixture capture in this ADR.

## TODO

- TODO: Add browser-level smoke coverage when local/CI Playwright infrastructure is intentionally
  introduced.
- TODO: Replace fixture-first scanner data only after live BTC/ETH 10m/1h discovery evidence is
  confirmed.
