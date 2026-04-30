# ADR 0015: RC-11 Signal Runtime And Tuning

Status: accepted

## Context

RC-10 made the Event Signal Console usable as a local workbench. RC-11 adds runtime usability and
tuning without changing the product boundary: research-only signals, no trading, no accounts, no
orders, no wallet integration, and no paper broker.

## Decision

- Add browser-local auto refresh controls with `Off`, `15s`, `30s`, and `60s`.
- Keep auto refresh off by default. Live mode floors 15s to 30s to avoid high-frequency public
  OHLCV polling.
- Add browser-local recent signal history capped at 20 entries.
- Move confluence thresholds into a `balanced` signal profile with separate 5m and 10m settings.
- Return `profileName: "balanced"` in research signal and console payloads.
- Strengthen no-trade vetoes for flat EMA slope, flat MACD histogram, narrow volatility, extreme
  volatility, stale/insufficient data, and module conflicts.

## Consequences

Auto refresh is UI display polling only. It does not submit orders, connect accounts, manage
positions, or automate trading. Signal history is not persisted and is not a trade log, replay
engine, performance record, or backtest. The profile is a research parameter set, not user-facing
execution configuration.

CI remains fixture-backed and uses mocked live OHLCV coverage only.

