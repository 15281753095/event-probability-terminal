# ADR 0021: RC-17 Realtime Price and Strategy Research

Date: 2026-05-05

## Status

Accepted for RC-17.

## Decision

RC-17 prioritizes realtime BTC/ETH price visibility before any claim about profitable strategies. The production path is:

- Binance Spot public WebSocket market streams for realtime BTCUSDT/ETHUSDT ticks.
- API Gateway Server-Sent Events at `/market-data/realtime` so the browser connects to the local API boundary rather than directly to an exchange.
- REST ticker/candles remain bootstrap and fallback inputs for the existing chart and console payloads.
- Deterministic mock realtime ticks are used for smoke and local mock mode and are labeled `DEV MOCK`.
- Strategy work is limited to a research-only registry and offline backtest scaffold.

## Boundaries

Allowed Binance streams are public market data only: `trade`, `aggTrade`, `bookTicker`, `kline_1m`, and `kline_5m` for BTCUSDT/ETHUSDT. The implementation does not use Binance signed REST endpoints, User Data Stream, listen keys, API keys, secrets, account data, balances, positions, orders, or trading operations.

Polymarket remains public discovery/read only. No authenticated Polymarket trading endpoint is added.

## Rationale

Realtime price is an observable data-quality prerequisite. A strategy UI without a trustworthy live price path would create a false sense of precision. SSE keeps browser integration simple, makes cleanup explicit on client disconnect, and preserves the API Gateway as the adapter boundary.

Research strategies are not production-enabled because the project has not validated settlement rules, fees, slippage, spread, liquidity, sample size, or out-of-sample robustness. The backtest scaffold includes anti-cheat checks for future candles and entry after outcome time, but it is not evidence of profitability.

## Consequences

The chart still uses REST candles as bootstrap. Kline realtime metadata is parsed and carried in ticks, but full historical gap filling and chart backfill are not guaranteed in this slice.

No yield, win rate, or profit claim is made. High apparent win rates with small samples must remain warnings, not viability labels.
