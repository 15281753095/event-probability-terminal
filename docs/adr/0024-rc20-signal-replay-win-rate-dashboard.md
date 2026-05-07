# ADR 0024: RC-20 Signal Replay And Win Rate Dashboard

Date: 2026-05-07

## Status

Accepted for RC-20.

## Context

RC-19 added fair-value v1 chart markers for eligible BTC/ETH terminal threshold markets. The next
useful research step is not another strategy. The system first needs to answer whether existing
`LONG_YES`, `LONG_NO`, `NO_SIGNAL`, and `REJECTED` outputs can be replayed, labeled, counted, and
explained without look-ahead bias.

This remains Phase 1 research infrastructure. RC-20 must not add wallet integration, private keys,
API keys, secrets, authenticated trading endpoints, account state, balances, positions, order
placement, cancellation, settlement, auto execution, or guaranteed-profit claims.

## Decision

RC-20 adds a research-only replay engine, `/signals/replay`, deterministic mock replay fixtures,
and a Signal Replay & Win Rate Dashboard.

- Replay windows: `1d`, `3d`, `1w`, `1m`.
- Strategy: `fair-value-v1` only.
- Symbols: `BTC`, `ETH`, `ALL`.
- Public historical candles: Binance Spot `GET /api/v3/klines`.
- Public Polymarket data: Gamma active/closed markets and CLOB public `prices-history`.
- Outcome statuses: `WIN`, `LOSS`, `PENDING`, `UNRESOLVED`, `REJECTED`, `NO_SIGNAL`.
- Realized win rate is `winCount / (winCount + lossCount)`.

`PENDING`, `UNRESOLVED`, `REJECTED`, and `NO_SIGNAL` never enter the realized win-rate denominator.
They are still counted separately for coverage, rejection, and pending-rate diagnostics.

## Outcome Labeling

Resolved binary outcomes are authoritative only when the replay has an explicit `YES` or `NO`
outcome from closed-market data, or when a terminal threshold market can be reconstructed from
already-known eligibility fields and Binance price at expiry.

Rules:

- `LONG_YES` + resolved `YES` => `WIN`.
- `LONG_YES` + resolved `NO` => `LOSS`.
- `LONG_NO` + resolved `NO` => `WIN`.
- `LONG_NO` + resolved `YES` => `LOSS`.
- Not yet expired => `PENDING`.
- Expired but unclear => `UNRESOLVED`.
- `REJECTED` and `NO_SIGNAL` stay outside win-rate math.

Path-dependent markets such as "hit before date" cannot be reconstructed from one terminal expiry
price. They are `UNRESOLVED` or `REJECTED` unless a future adapter proves the complete path and
resolution rule. Exact threshold ties are not guessed when tie semantics are not confirmed.

## Anti-Cheat Boundary

Replay generation uses only candles at or before `signalTime`. Resolution data and expiry prices
are used only after the signal has been generated, inside outcome labeling. Polymarket historical
prices after `signalTime` are not used to create entry-side signals.

Closed markets can therefore still produce no completed sample if historical entry odds, spread,
liquidity, or resolution evidence are insufficient. The correct behavior is to warn and fail
closed, not to fabricate a win rate.

## Metrics

`ReplayMetrics` includes sample count, actionable count, win/loss counts, pending, unresolved,
rejected, `NO_SIGNAL`, coverage rate, rejection rate, pending rate, average edge, average
confidence, theoretical PnL, cumulative theoretical PnL, and max drawdown.

`theoreticalPnl` is not actual trading performance. It is a replay assumption using signal-time
probability and binary settlement value. No real fees, fills, slippage, balances, or positions are
observed. If `sampleCount < 20`, the response includes `LOW_SAMPLE_SIZE`.

## Consequences

- RC-20 makes fair-value v1 auditable over history before adding more strategy complexity.
- Live mode can return `winRate: null` when completed samples are unavailable.
- Mock mode is deterministic for CI and smoke tests and must be labeled as mock data.
- No smoke test may depend on live Binance or Polymarket availability.
- This does not implement a broker, paper broker, order routing, private wallet access, or
  production execution.
