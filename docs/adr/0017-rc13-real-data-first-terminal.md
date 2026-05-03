# ADR 0017: RC-13 Real Data First Terminal

Date: 2026-05-01

## Status

Accepted

## Context

RC-12 exposed useful signal diagnostics, but the homepage read like a research/debug workbench:
fixture markets, placeholder pricing, evidence matrices, and the old scanner competed with the
actual user need: a fast BTC/ETH 5m/10m event-direction snapshot.

Official-source review in `docs/source_registry.md` supports Coinbase Exchange public ticker and
candles as the default live price source:

- `GET /products/{product_id}/ticker`
- `GET /products/{product_id}/candles`
- product ids `BTC-USD` and `ETH-USD`
- candle granularities `60` and `300`
- max 300 candles
- historical rates may be incomplete and should not be polled frequently

Predict.fun is not a default live source because its mainnet API requires an API key. Polymarket is
still a public prediction-market source boundary, but active BTC/ETH 5m/10m market discovery is not
confirmed enough to show live prediction-market contracts on the homepage.

## Decision

Make the homepage a minimal live-first terminal:

- default `sourceMode=live`;
- fetch latest price from Coinbase Exchange public ticker;
- fetch chart candles from Coinbase Exchange public candles;
- expose `GET /market-data/live?symbol=BTC|ETH`;
- make `GET /signals/console` default to live;
- keep `sourceMode=fixture` explicit and visually marked as dev mode;
- move the old scanner out of the first screen to `/scanner`;
- cap chart signal markers to recent-only, max 10;
- collapse fixture mode, legacy scanner, diagnostics, and raw status into Advanced.

Live failures fail closed. The UI must show unavailable state and `NO_SIGNAL`; it must not fill live
ticker or chart gaps with fixture candles.

## Consequences

- The first screen answers the core question faster: BTC/ETH, 5m/10m, latest price, freshness,
  current bias, score, reasons, vetoes, and chart.
- CI remains deterministic through mocked Coinbase live market data.
- Local manual validation can call Coinbase public endpoints, but high-frequency polling remains
  out of scope.
- Fixture data is still available for development and contract tests, but it is no longer the
  homepage default.

## Non-Goals

- No real-money trading.
- No order placement or cancellation.
- No wallet, account, private/auth endpoint, API key, or secret handling.
- No Predict.fun adapter.
- No Binance Wallet or trading integration.
- No paper broker or full replay engine.
- No live X/news/macro dependency.
- No investment advice or guaranteed outcome claims.

## TODO

- TODO: Define an approved cache or WebSocket policy before repeated Coinbase live refreshes.
- TODO: Confirm active BTC/ETH 5m/10m prediction-market contract discovery before showing live
  Polymarket markets on the homepage.
- TODO: Keep scanner and placeholder pricing out of the default terminal flow unless the user opens
  Advanced or `/scanner`.
