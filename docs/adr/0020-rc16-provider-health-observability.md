# ADR 0020: RC-16 Provider Health Observability

Date: 2026-05-05

## Status

Accepted.

## Context

RC-15 added the Binance Spot public K-line terminal and provider-aware live market-data flow. That
made live Binance, Coinbase fallback, and deterministic mock packets visible in the product, but the
health state was still spread across provenance, candle counts, and fail-closed reasons.

RC-16 hardens observability rather than changing the strategy model. The goal is to make provider
health, data quality, fallback, mock/live separation, and UI empty states directly verifiable.

## Decision

Add `providerHealth` to live market-data and event signal console payloads. It reports requested
provider, resolved provider, source type, status, latency, candle count, expected candle minimum,
last candle time, fixture-backed flag, fallback usage, fallback reason, fail-closed reasons, and
checked timestamp.

Binance Spot public remains the default live provider. It may use only public market-data endpoints
such as `klines`, ticker price/statistics, or book ticker. No signed, private, trading, account,
wallet, balance, order, leverage, position, funding, settlement, or withdrawal endpoint is in scope.

Coinbase Exchange remains the transparent public fallback. If Binance fails and Coinbase supplies
the response, the payload must show `fallbackUsed=true`, keep the Binance failure in
`fallbackReason`, and expose `resolvedProvider=coinbase-exchange`. It must not be presented as a
successful Binance response.

Deterministic mock provider packets remain isolated to CI/smoke and local dev checks. They must be
marked `sourceType=mock`, shown as `DEV MOCK`, and must not request real Binance or Coinbase.

## Consequences

The `/market-data/live` and `/signals/console` pages now show provider health, source type,
latency, candle count, last candle time, fallback state, fallback reason, fail-closed reasons, and
last checked time. Empty chart states surface the data-quality reason instead of silently showing a
blank chart.

`NO_SIGNAL` remains a model output. It can come from momentum, volatility, volume, chop, conflict,
or profile vetoes even when provider health is `ok`. Provider failure is represented by
`providerHealth.status`, `providerHealth.failClosedReasons`, and data-quality fields.

## Limits

RC-16 does not guarantee Binance availability. It does not add a cache, polling scheduler,
probability calibration, strategy optimization, paper broker, real-money trading, Polymarket CLOB,
Predict.fun, or any private/authenticated vendor integration.
