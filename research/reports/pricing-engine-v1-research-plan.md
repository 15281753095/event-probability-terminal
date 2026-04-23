# Pricing Engine v1 Research Plan

Status: research plan only; no model implementation.

Date: 2026-04-23 Asia/Shanghai

## Research Scope

Pricing-engine v1 should estimate fair probabilities for BTC/ETH binary outcome markets in a
read-only Polymarket-first workflow.

The first v1 candidate must remain narrow:

- one normalized `EventMarket`;
- one binary outcome pair;
- one market snapshot;
- one underlying BTC/ETH price snapshot;
- one timestamped feature vector;
- one fair probability per outcome.

It must not output a trading strategy, order size, paper fill, or automated action.

## Inputs Already Available

- `EventMarket.id`, venue, asset, window, question.
- Binary `outcomes.primary` and `outcomes.secondary` labels and token IDs.
- Fixture-backed Gamma-style metrics: bid, ask, spread, liquidity, volume.
- Event/market time fields where present.
- Pricing-engine v0 placeholder response shape.

These are enough for contract plumbing, but not enough for a real probability model.

## Inputs Still Missing

- Confirmed BTC/ETH 10m/1h live discovery rule.
- Timestamped market snapshot source with freshness metadata.
- Official or reliable source for underlying BTC/ETH spot price.
- Reference/start/strike level for Up/Down payoff evaluation.
- Payoff specification parser with fail-closed behavior.
- Volatility or uncertainty proxy.
- Historical snapshots plus settled outcomes for calibration.

## Minimal Feature Layers

### 1. Current Market Features

Required for v1:

- primary outcome bid;
- primary outcome ask;
- observed midpoint;
- spread;
- liquidity;
- time to expiry.

Current status: partly available from fixture/Gamma fields, but freshness and canonical source are
not yet confirmed.

### 2. Market Microstructure Features

Required for v1 eligibility or confidence:

- top-of-book bid/ask freshness;
- liquidity/depth proxy;
- spread width.

Current status: only shallow Gamma-style fields are available. CLOB public order book data is not
part of the current approved v1 input set.

### 3. Underlying Price And Volatility Features

Required for v1 probability:

- current BTC/ETH price;
- reference price or strike;
- time to expiry;
- volatility proxy over a documented lookback.

Current status: missing.

### 4. Deferred Extensions

Out of v1:

- news;
- social signals;
- cross-venue data;
- Predict.fun;
- Binance Wallet;
- user inventory;
- paper broker fills;
- strategy sizing.

## Freshness Rules

The model should produce no non-placeholder quote unless required inputs meet freshness rules.

Initial research targets:

- 10m market snapshot age: 15 seconds or less.
- 1h market snapshot age: 60 seconds or less.
- 10m underlying price age: 5 seconds or less.
- 1h underlying price age: 15 seconds or less.
- feature vector must be computed after required source observations.

These are research targets, not implemented checks.

## Validation Plan

Before any non-placeholder probability is exposed:

- collect timestamped market snapshots;
- collect underlying price snapshots;
- collect final resolved outcomes;
- run time-split backtests;
- compute Brier score;
- compute log loss;
- produce reliability buckets;
- document sample-size limits before interpreting calibration.

No scanner UI or API should describe v1 as live until this validation exists.

## Implementation Gate

The project can enter v1 implementation only after:

- data contracts are documented;
- fixtures/datasets exist;
- freshness checks are specified;
- payoff parsing is fail-closed;
- validation metrics are defined;
- replay/backtest storage shape is approved.
