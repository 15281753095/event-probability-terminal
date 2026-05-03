# ADR 0019: RC-15 Binance Public Kline Terminal

Date: 2026-05-03

## Status

Accepted.

## Context

RC-14 separated `sourceType=live|mock|fixture` and prevented mock/fixture data from being presented
as live. The next product slice needs a terminal that feels closer to a crypto event-contract
environment while staying read-only and research-only.

Official Binance Spot documentation verifies public market-data endpoints for klines and ticker
statistics. Binance request security documents `NONE` endpoints as public market data and scopes
signed/private behavior to secure endpoint types such as `TRADE` and `USER_DATA`.

## Decision

RC-15 makes `binance-spot-public` the default live provider for the terminal:

- symbols: `BTC -> BTCUSDT`, `ETH -> ETHUSDT`
- candle intervals: `1m`, `5m`, `15m`, `1h`
- ticker: Binance Spot public `24hr` ticker for latest price, bid, ask, volume, and ticker time
- candles: Binance Spot public `klines`
- console event window: default 1m candles for 5m/10m horizons
- chart: TradingView Lightweight Charts candlestick series with recent markers and volume

Coinbase Exchange remains an optional fallback provider:

- `BTC -> BTC-USD`
- `ETH -> ETH-USD`
- granularities: `60`, `300`, `900`, `3600`

Mock data is allowed only for CI/smoke and must be marked `sourceType=mock`, `isLive=false`,
`isMock=true`, and displayed as `DEV MOCK`. Fixture data remains explicit dev mode only and must be
displayed as `DEV FIXTURE`.

## Boundaries

RC-15 does not connect Binance accounts, create or read API keys, read balances/assets, call signed
endpoints, call order endpoints, place/cancel orders, use leverage, calculate position size, or
integrate wallets. It also does not implement Predict.fun, Binance Wallet Prediction Markets, paper
broker, replay engine, or real fair-probability pricing.

Live failures fail closed. The API may return HTTP 200 with unavailable live fields and
`failClosedReasons`, and the signal must become `NO_SIGNAL` with confidence `0`. It must not
silently substitute fixture candles.

## Consequences

The homepage now defaults to `BTCUSDT`, `5m`, `provider=binance`, and `sourceType=live`. The UI
shows live/provider/product/freshness provenance in the primary terminal and keeps mock, fixture,
legacy scanner, and raw diagnostics behind Advanced.

The terminal is still research-only. `LONG BIAS` and `SHORT BIAS` are directional research labels,
not trade instructions or performance claims.
