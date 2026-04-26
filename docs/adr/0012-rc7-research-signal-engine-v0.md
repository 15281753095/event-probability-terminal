# ADR 0012: RC-7 Research Signal Engine v0

Date: 2026-04-26

## Status

Accepted

## Context

The repository now has fixture-backed API contracts, snapshots, typed errors, and read-only scanner
and market-detail pages. The next useful Phase 1 product slice is a deterministic research signal
surface for BTC/ETH short horizons, while preserving the existing prohibitions on trading,
private/authenticated endpoints, wallet behavior, paper broker, replay, and production pricing.

External-source review on 2026-04-26 reconfirmed:

- Polymarket Gamma/Data are public/no-auth surfaces, while CLOB trading endpoints require
  authentication and remain out of scope.
- X Recent Search requires developer credentials and a Bearer token, so live X data cannot be a
  default dependency.
- TradingView Pine Script documents the relevant technical-analysis function categories, but RC-7
  implements local deterministic formulas rather than copying proprietary implementations.
- Coinbase Exchange candles are a possible future OHLCV source, but are not a live default.

## Decision

Add a read-only `ResearchSignal` vertical slice:

- shared `ResearchSignal` contract and `ResearchSignalsResponse`;
- `@ept/research-signals` package with deterministic OHLCV fixtures, technical indicators, and a
  rule-based signal engine;
- `GET /signals/research` in the API gateway;
- Research Signal Panel on the scanner page;
- fixture-backed tests, API snapshot, and smoke coverage.

Signal directions are limited to:

- `LONG`
- `SHORT`
- `NO_SIGNAL`

These are research biases, not trade instructions. The UI labels them as `LONG bias`,
`SHORT bias`, and `NO_SIGNAL`.

## Rule Engine

The v0 engine is rule-based and explainable. It computes:

- EMA fast/slow and EMA slope;
- RSI;
- MACD line, signal line, histogram, and histogram slope;
- Bollinger middle/upper/lower, bandwidth, band position, squeeze, and expansion;
- ATR and realized-volatility proxy;
- 1m/3m/5m momentum;
- volume z-score and abnormal-volume flag.

Rules combine weighted contributions from trend, momentum, MACD, RSI, Bollinger position, volume,
volatility, and optional context. RSI is explicitly weak and cannot decide direction by itself.
Conflicts reduce confidence. Stale or insufficient OHLCV data and event-risk context fail closed
to `NO_SIGNAL`.

## Context Boundary

News, X, and macro data are represented as a research-only context contract:

- `newsScore`;
- `xSignalScore`;
- `macroRiskState`;
- `marketEventRiskFlag`;
- provenance notes and `sourceMode`.

RC-7 uses manual fixture context only. No live X/news/macro adapter is implemented, and no
environment variable such as an X bearer token is consumed by default.

## Consequences

- The project now has a real business-facing read-only research signal slice.
- Signal output is deterministic and CI-safe.
- The existing `ept-api-v1` scanner/detail contracts remain intact.
- The new signal endpoint has its own fixture-backed snapshot.
- The feature does not compute fair probabilities, does not price Polymarket outcomes, does not
  place orders, and does not open private/authenticated vendor paths.

## Non-Goals

- No real-money trading.
- No automated order placement, cancellation, settlement, funding, withdrawal, or wallet action.
- No Predict.fun or Binance adapter.
- No paper broker.
- No replay engine.
- No production pricing model or non-placeholder fair probability.
- No live X/news/macro dependency in default runtime or CI.

## TODO

- TODO: Confirm a live OHLCV provider, product ids, interval semantics, freshness policy, and
  fixture-capture process before enabling any live adapter.
- TODO: Define a separate calibration/validation standard before turning research signals into any
  production model claim.
- TODO: Add live context adapters only after source-specific auth, rate limits, storage policy, and
  compliance constraints are documented.
