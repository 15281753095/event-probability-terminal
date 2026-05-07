# ADR 0025: RC-21 Strategy Lab And Walk-Forward Validation

Date: 2026-05-07

Status: accepted

## Context

RC-19 introduced `fair-value-v1` as a research-only model for eligible BTC/ETH terminal
price-threshold Polymarket markets. RC-20 added signal replay, outcome labeling, win-rate metrics,
theoretical PnL, coverage, rejection, pending, and drawdown diagnostics.

The next research question is not "which new strategy should be added?" It is whether the existing
`fair-value-v1` parameters are stable enough to keep researching:

- `minEdgeBps`
- `maxSpread`
- volatility lookback candles
- OHLCV interval
- direction stability for `LONG_YES` versus `LONG_NO`
- fee and slippage assumptions
- in-sample versus out-of-sample degradation

Adding more strategies before this would increase surface area without proving that the first
probability/edge path is measurable, explainable, and resistant to overfitting.

## Decision

RC-21 adds a research-only Strategy Lab:

- bounded parameter grid for `fair-value-v1`;
- parameter sweep over RC-20 replay metrics;
- ranking with low-sample, drawdown, coverage, pending, null win-rate, negative PnL, and overfit
  penalties;
- rolling walk-forward validation with explicit train/test windows;
- `/strategy-lab/sweep` API endpoint;
- `/strategy-lab` dashboard;
- deterministic mock coverage for CI and smoke.

The Strategy Lab produces research candidates only. A top candidate is not a production strategy,
not a trading instruction, not a profitability claim, and not approval for automated execution.

## In-Sample And Out-Of-Sample

In-sample metrics are generated on train windows and may be used to choose parameters within that
window. Out-of-sample metrics are generated on the following test window and must not be used to
choose that same window's parameter.

This separation matters because a parameter set can look good on the same data used to select it
while failing on later data. RC-21 therefore reports degradation:

- test win rate minus train win rate;
- test theoretical PnL minus train theoretical PnL;
- test max drawdown minus train max drawdown;
- test coverage minus train coverage.

## Why Score Is Not Just Win Rate

Win rate alone is too easy to abuse:

- one or two resolved samples can produce 100%;
- high pending rate can hide unresolved failures;
- low coverage can mean the model rarely acts;
- high drawdown can make a superficially positive win rate unstable;
- negative theoretical PnL can coexist with a decent win rate if losses are larger than wins.

RC-21 score combines win rate, theoretical PnL, and coverage, then subtracts penalties for drawdown,
low sample, pending rate, and overfit risk. `winRate = null` cannot be top-ranked.

## Overfit And Stability Rules

The Strategy Lab marks:

- `LOW_SAMPLE_SIZE` when resolved samples are below 20;
- low actionable count when `actionableCount < minSampleCount`;
- high overfit risk when train win rate is high but test win rate is low;
- high overfit risk when train PnL is positive but test PnL is negative;
- high overfit risk when fewer than half of walk-forward windows pass;
- unknown or medium risk when train/test samples are too thin.

Top candidates must remain `isResearchOnly: true`, have non-null win rate, meet minimum actionable
count, avoid negative theoretical PnL, avoid high overfit risk, and avoid low walk-forward
consistency.

## Boundaries

RC-21 does not add:

- real-money trading;
- order placement or cancellation;
- wallet, private key, API key, secret, or passphrase handling;
- account, balance, position, or execution workflows;
- authenticated Polymarket, Binance, Predict.fun, or wallet endpoints;
- guaranteed-profit claims;
- use of all historical data for both parameter selection and validation.

Live public mode may return warnings and no candidates if samples are insufficient. It must not
fabricate resolved samples or promote in-sample winners into production strategies.

## Consequences

Positive:

- parameter research is now auditable and repeatable;
- RC-20 replay metrics are reused instead of inventing a separate backtest metric language;
- mock smoke remains deterministic and does not call live vendors;
- overfit risk is visible before any strategy expansion.

Costs:

- live sweeps can be slow because each parameter set still uses the replay adapter path;
- public historical Polymarket spread/liquidity evidence remains incomplete, so live candidates may
  be rejected or low-sample;
- Strategy Lab can identify research candidates, but it cannot prove production viability.
