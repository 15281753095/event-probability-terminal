# ADR 0018: RC-14 Real Data Integrity And Candlestick Terminal Polish

Date: 2026-05-02

## Status

Accepted

## Context

RC-13 made the homepage live-first, but deterministic smoke data and fixed 1m candle display could
still read as real market data. The product default must be real-data-first: homepage,
`/market-data/live`, and `/signals/console` should use Coinbase Exchange public data by default,
show clear source provenance, and fail closed instead of substituting generated candles.

Official-source notes in `docs/source_registry.md` support Coinbase Exchange public ticker and
candles for `BTC-USD` and `ETH-USD`, with candle granularities `60`, `300`, `900`, and `3600`
seconds. Phase 1 remains read-only research; no private/auth endpoints, wallets, or orders are in
scope.

## Decision

- Keep `sourceMode=live` as the default product path.
- Add `sourceType` provenance so actual data can be `live`, `mock`, or `fixture`.
- Mark deterministic CI/smoke packets as `sourceType=mock`, `isLive=false`, and DEV-only in the UI.
- Expand Coinbase candle support to `1m`, `5m`, `15m`, and `1h` for `/market-data/live`.
- Add dedicated `/market-data/live` and `/signals/console` pages.
- Keep fixture mode behind explicit Advanced/DEV links and never use fixtures to fill live failures.

## Consequences

- Real live validation can assert `sourceType=live`, `isLive=true`, `isFixtureBacked=false`, and
  nonzero candle counts.
- CI remains deterministic without pretending mock packets are real live data.
- The signal model remains experimental and read-only; it displays confidence and vetoes but no
  trading action, fair probability, order instruction, wallet action, or real-money execution.

## Non-Goals

- No Coinbase private/auth integration.
- No Binance Wallet, Predict.fun, wallet, or trading adapter.
- No real-money order placement, cancellation, settlement, funding, or withdrawal.
- No generated fallback candles for live chart failures.
