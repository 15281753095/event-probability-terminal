# Research Signals API

Status: implemented for RC-7 as a fixture-backed, read-only research signal slice.

This API publishes deterministic BTC/ETH 5m and 10m research signals. It is not a trading API, not
investment advice, not a fair-probability pricing model, and not an order-generation system.

## Endpoint

```text
GET /signals/research
GET /signals/research?symbol=BTC&horizon=5m
```

Supported query filters:

- `symbol`: `BTC` or `ETH`
- `horizon`: `5m` or `10m`

Unsupported filters return a typed `ept-api-v1` error with:

- `status: "unsupported"`
- `error: "out_of_scope"`

## Response

The response body is `ResearchSignalsResponse` from `packages/shared-types`:

```ts
interface ResearchSignalsResponse {
  signals: ResearchSignal[];
  meta: ResearchSignalsMeta;
}
```

`meta` always marks the response as:

- `contractVersion: "ept-api-v1"`
- `responseKind: "research_signals"`
- `source: "research_signal_engine"`
- `mode: "fixture"`
- `isFixtureBacked: true`
- `isReadOnly: true`
- `isResearchOnly: true`
- `isTradeAdvice: false`
- `modelVersion: "research-signal-engine-v0"`

## ResearchSignal Contract

Each signal includes:

- `symbol`: `BTC` or `ETH`
- `horizon`: `5m` or `10m`
- `generatedAt`
- `direction`: `LONG`, `SHORT`, or `NO_SIGNAL`
- `confidence`: bounded research confidence score
- `score`: weighted directional score
- `reasons`: explainable rule contributions and limits
- `features`: technical indicator snapshot
- `context`: manual fixture context snapshot
- `dataQuality`: freshness and completeness report
- `sourceMode: "fixture"`
- `isResearchOnly: true`
- `isTradeAdvice: false`
- `modelVersion: "research-signal-engine-v0"`
- `invalidation`
- `failClosedReasons`

## Indicator Features

The v0 engine computes local deterministic formulas for:

- EMA fast/slow and EMA slope;
- RSI;
- MACD line, signal line, histogram, and histogram slope;
- Bollinger bands, band position, bandwidth, squeeze, and expansion;
- ATR and realized-volatility proxy;
- 1m/3m/5m momentum;
- volume z-score and abnormal-volume flag.

These indicators are computed from fixture OHLCV samples. They do not depend on live vendors in
default runtime or CI.

## Rule Semantics

`LONG` means the weighted research rules lean upward.

`SHORT` means the weighted research rules lean downward.

`NO_SIGNAL` means evidence is insufficient, conflicting, stale, or blocked by fail-closed risk.

Rules are multi-factor. A single RSI, MACD, or Bollinger condition cannot decide direction by
itself. Conflicting contributions reduce confidence. Stale or insufficient candles fail closed to
`NO_SIGNAL`.

## Context Adapter Contract

RC-7 defines context inputs for future adapters:

- `newsScore`
- `xSignalScore`
- `macroRiskState`
- `marketEventRiskFlag`
- `notes`
- `sourceMode`

Current default context is manual fixture data. Live X Recent Search is not used because X requires
developer credentials and Bearer-token authorization. No X/news/macro environment variable is read
by default.

## Explicit Non-Goals

- No buy/sell/order output.
- No leverage, position size, or entry price for real trading.
- No real-money trading.
- No private/authenticated endpoints.
- No wallet integration.
- No Predict.fun or Binance adapter.
- No paper broker.
- No replay engine.
- No production pricing model.
- No CI dependency on external network data.
