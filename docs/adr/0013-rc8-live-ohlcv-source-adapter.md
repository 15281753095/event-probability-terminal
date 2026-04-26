# ADR 0013: RC-8 Live OHLCV Source Adapter

Date: 2026-04-26

## Status

Accepted

## Context

RC-7 added a fixture-backed Research Signal Engine v0 for BTC/ETH 5m and 10m horizons. The next
minimal business slice is explicit local live OHLCV input while preserving Phase 1 prohibitions:
no trading, no wallet, no private/auth endpoint, no paper broker, no replay engine, no live X/news
dependency, and no CI dependency on external network data.

Official-source review recorded in `docs/source_registry.md` supports Coinbase Exchange public
candles as the RC-8 default live OHLCV source:

- `GET https://api.exchange.coinbase.com/products/{product_id}/candles`
- `BTC-USD` and `ETH-USD` product ids
- `granularity=60` for 1m and `granularity=300` for 5m
- maximum 300 candles
- historical rates may be incomplete and should not be polled frequently

Coinbase Advanced Trade candles are not selected as default because the official public endpoint
overview and specific public candles page disagree about Bearer-token authorization. Binance Spot
klines are documented as a future candidate only and are not a Binance Wallet Prediction Markets
adapter.

## Decision

Add a Coinbase Exchange OHLCV adapter inside `@ept/research-signals` and expose it only through:

```text
GET /signals/research?symbol=BTC&horizon=5m&sourceMode=live
```

Fixture mode remains the default. The API gateway calls the research-signals adapter boundary and
does not issue raw vendor HTTP requests directly.

The adapter:

- maps `BTC` to `BTC-USD` and `ETH` to `ETH-USD`;
- maps `1m` to `granularity=60` and `5m` to `granularity=300`;
- uses no Authorization header, API key, wallet, or trading endpoint;
- applies timeout, safe JSON parsing, numeric validation, ascending sort, incomplete-candle
  filtering, freshness checks, and insufficient-data checks;
- returns fail-closed `OHLCVFetchResult` objects instead of throwing for expected source/data
  failures.

The signal engine converts live OHLCV results into `ResearchSignal` using the same technical
indicator and rule engine. If live data is unusable, the response remains HTTP 200 with
`NO_SIGNAL`, `confidence: 0`, and explicit `failClosedReasons`.

## Consequences

- Local manual runtime can generate research signals from live BTC/ETH candles.
- CI remains deterministic because all live adapter tests mock fetch.
- The Research Signal Panel can display Fixture/Live mode, source name, freshness, warnings, and
  fail-closed reasons.
- Coinbase incomplete historical rates are treated as a fail-closed risk, not silently backfilled
  or synthesized.

## Non-Goals

- No trading, order placement, wallet, private/auth endpoint, leverage, position sizing, or entry
  price.
- No Predict.fun adapter.
- No Binance Wallet Prediction Markets adapter.
- No paper broker or replay engine.
- No production pricing model or fair-probability model.
- No X/news/macro realtime adapter.
- No CI call to Coinbase Exchange.

## TODO

- TODO: Define a cache/polling policy before repeated live Coinbase Exchange use.
- TODO: Confirm through approved manual smoke whether Coinbase Exchange consistently emits volume
  for BTC/ETH candle rows.
- TODO: Revisit Binance Spot as a second OHLCV candidate only in a separate, explicit slice.
