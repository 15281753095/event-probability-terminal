# ADR 0014: RC-9 Event Signal Console And Confluence Engine

Date: 2026-04-26

## Status

Accepted

## Context

RC-7 introduced fixture-backed BTC/ETH 5m/10m research signals. RC-8 added explicit local live
OHLCV mode through a Coinbase Exchange public-read adapter. The next product slice needs a local
event-contract research console that is more explainable than a single directional label, while
preserving Phase 1 constraints: no trading, no wallet, no private/auth endpoint, no paper broker,
no replay engine, no real ML model, no X/news realtime dependency, and no full-history signal
overlay on the chart.

Targeted product research on 2026-04-26 was limited to product shape, not strategy truth claims.
Useful patterns were: a clear top control area, a recent candlestick chart, grouped indicator
panels, trend/status labels, and a separate backtest/summary section. TradingView documentation was
used only as a taxonomy reference for common technical-analysis families such as EMA, MACD, RSI,
Bollinger bands, ATR, and volume inputs.

## Decision

Add RC-9 Event Signal Console:

- `GET /signals/console`;
- shared `ConfluenceScore`, `RiskFilterSummary`, `SignalMarker`, `BacktestPreview`, and
  `EventSignalConsoleResponse` contracts;
- a confluence evaluator inside `packages/research-signals`;
- a web console section with BTC/ETH, 5m/10m, and fixture/live selectors;
- a recent candlestick chart using the existing `lightweight-charts` dependency;
- recent-only signal markers capped at 20;
- an on-demand lightweight backtest preview, disabled by default.

The confluence engine groups signals into:

- trend: fast/slow EMA, EMA slope, and price relative to EMA;
- momentum: 1m/3m/5m return cluster, MACD histogram, and MACD histogram slope;
- RSI/reversal: RSI and Bollinger extension as risk only, never as a standalone trigger;
- volatility: Bollinger position/bandwidth, ATR, and realized-volatility regime;
- volume: volume z-score and abnormal-volume confirmation;
- chop/no-trade: EMA flatness, MACD flatness, short-term return conflict, low range, and module
  disagreement.

Directional output remains limited to `LONG`, `SHORT`, and `NO_SIGNAL`, rendered in the UI as
`LONG bias`, `SHORT bias`, and `NO_SIGNAL`. It is research-only and not trade advice.

## Rule Summary

Initial thresholds:

- 5m requires absolute confluence score at least `0.68`;
- 10m requires absolute confluence score at least `0.65` and stronger trend alignment;
- stale data, insufficient data, event-risk context, too-low volatility, extreme volatility, high
  chop, or module conflict vetoes directional output;
- no volume confirmation reduces confidence and can veto moderate momentum setups;
- RSI/reversal risk reduces confidence but cannot create direction by itself.

## Consequences

- Users can inspect why a signal is present or vetoed.
- `NO_SIGNAL` is an explicit first-class state for stale, conflicted, choppy, or low-quality
  evidence.
- The chart remains responsive because it receives only recent candles and recent markers.
- Backtest preview is intentionally small and on-demand. It does not model fees, slippage, fills,
  order-book queue, funding, settlement, or real trading performance.
- CI remains deterministic because fixture mode is default and live OHLCV tests use mocks.

## Non-Goals

- No real-money trading.
- No automated order placement, cancellation, settlement, funding, withdrawal, wallet action, or
  trading controls.
- No buy/sell/order wording, leverage, position size, or real entry output.
- No Predict.fun adapter.
- No Binance Wallet Prediction adapter.
- No paper broker.
- No full replay engine.
- No real ML model.
- No live X/news/macro ingestion.
- No full-history signal marker overlay on the primary chart.

## TODO

- TODO: Define a cache/polling policy before repeated live Coinbase Exchange use.
- TODO: Define a separate validation protocol before any larger historical backtest or calibration
  claim.
- TODO: Revisit marker density only after replay/stats workflows exist.
