# ADR 0016: RC-12 Reality Observation And Strategy Tuning

Date: 2026-04-30

## Status

Accepted

## Context

RC-11 added runtime refresh and recent signal history, but the main page still read like a debug
workbench. It did not clearly separate live public candles from deterministic fixtures, did not
create a local observation loop, and still used backtest-style wording that could imply more
validation than the Phase 1 sample supports.

Phase 1 remains read-only research. The system must not place orders, connect wallets, read
accounts, automate trading, or present directional output as investment advice.

## Decision

RC-12 changes the Event Signal Console into Reality Mode:

- The web UI shows prominent `LIVE` and `DEV FIXTURE` labels.
- `/signals/console` accepts `profile=balanced|conservative|aggressive`.
- Profiles are research parameters with separate 5m and 10m thresholds.
- The response includes `eventWindow` and `observationCandidate` fields.
- The web UI stores Signal Observation Log entries in localStorage only.
- Pending observations resolve close-to-close after the selected 5m/10m window.
- `NO_SIGNAL` observations are recorded as `no_signal` but excluded from directional match rate.
- Cooldown/dedupe prevents repeated logging within 120s for 5m and 180s for 10m unless direction
  changes or score moves materially.
- Observation Feedback suggests profile changes locally but never applies parameters automatically.
- Backtest wording is replaced with Observation Preview / small-sample directional check.
- Chart markers remain recent-only and capped. Observation hit/miss state can be shown in the log
  without painting full-history overlays.

## Consequences

The console now supports a practical local observation loop without a database, paper broker, or
replay engine. Directional match rate is explicitly not return, settlement accuracy, win rate, or
trading performance.

Fixture data remains deterministic and must not be presented as live. Live mode remains explicit,
uses public Coinbase Exchange OHLCV through the adapter boundary, and fails closed on stale,
insufficient, or unavailable data.

Observation Feedback can help choose a profile for local research, but it does not optimize profit,
does not auto-tune server parameters, and does not constitute investment advice.

## Non-Goals

- No automatic trading.
- No order placement, cancellation, settlement, wallet, or account integration.
- No paper broker.
- No full replay engine.
- No default X/news/macro live data.
- No claim that a small local sample predicts future outcomes.
