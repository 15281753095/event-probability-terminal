# ADR 0004: Pricing Engine v1 Research Boundary

Status: Accepted

Date: 2026-04-23 Asia/Shanghai

## Context

Pricing-engine v0 is implemented as a placeholder contract. It consumes a normalized binary
`EventMarket` and returns `null` fair probabilities with explicit placeholder metadata.

The next step is not a model implementation. The next step is to define what a minimal,
explainable v1 model would be allowed to consume, how fresh those inputs must be, and how a
non-placeholder probability output must be validated before it can appear in scanner output.

## Decision

Pricing-engine v1 is a research boundary only until the preconditions in this ADR are met.

The v1 research scope is:

- Polymarket-first.
- Read-only.
- BTC/ETH first.
- Binary outcomes only.
- One market snapshot in, one fair-value snapshot out.
- Probability estimation only; no trade execution, no order placement, no paper broker, and no
  strategy side decision.

The v1 research contract must preserve `outcomes.primary` and `outcomes.secondary` from
`EventMarket`. It must return probabilities by outcome role, not by hard-coded Yes/No names.

## Minimal Required Inputs

V1 cannot return non-null probabilities unless these inputs are present and fresh:

- normalized binary `EventMarket`;
- explicit payoff specification for the two outcomes;
- market snapshot with bid, ask, spread, liquidity, and source timestamp;
- time to expiry with confirmed market end-time semantics;
- BTC/ETH underlying spot price with source timestamp;
- event reference level or start price when the market asks an up/down question;
- volatility or uncertainty proxy with documented source and lookback;
- model input timestamp and feature freshness report.

## Validation Gate

Before v1 implementation can replace placeholder probabilities, the project must define and run:

- calibration evaluation;
- Brier score;
- log loss;
- reliability buckets;
- sample-window and minimum-sample rules;
- replay/backtest protocol for historical market snapshots and outcomes.

## Consequences

- The current repository remains v0 placeholder-only.
- Scanner output must keep labeling fair probability, confidence, and edge as placeholder.
- No v1 model code should be added until data-source, freshness, and validation contracts exist.
- Strategy decisions remain outside pricing-engine.

## TODO

- TODO: Confirm a reliable source for BTC/ETH underlying spot prices.
- TODO: Confirm how to extract payoff specification and reference level for Polymarket Up/Down markets.
- TODO: Add timestamped market snapshots before computing freshness.
- TODO: Define replay storage before running calibration or backtests.
