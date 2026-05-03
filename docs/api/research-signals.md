# Research Signals API

Status: implemented through RC-9 as a fixture-default, live-optional, read-only research signal and
confluence slice.

This API publishes BTC/ETH 5m and 10m research signals. Fixture mode remains the default. Live mode
must be explicitly requested and uses Coinbase Exchange public candles. RC-9 adds confluence and
risk-filter fields to each `ResearchSignal`; the richer console payload is documented separately in
`docs/api/event-signal-console.md`. This is not a trading API, not investment advice, not a
fair-probability pricing model, and not an order-generation system.

## Endpoint

```text
GET /signals/research
GET /signals/research?symbol=BTC&horizon=5m
GET /signals/research?symbol=BTC&horizon=5m&sourceMode=live
```

Supported query filters:

- `symbol`: `BTC` or `ETH`
- `horizon`: `5m` or `10m`
- `sourceMode`: `fixture` or `live`

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
- `responseKind: "research_signal"`
- `source: "research_signal_engine"`
- `mode: "fixture"` or `"live"`
- `sourceName: "fixture"` or `"coinbase_exchange"`
- `isFixtureBacked: boolean`
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
- `source`: `fixture` or `coinbase_exchange`
- `sourceMode`: `fixture` or `live`
- `isResearchOnly: true`
- `isTradeAdvice: false`
- `modelVersion: "research-signal-engine-v0"`
- `invalidation`
- `failClosedReasons`
- `confluence`: trend, momentum, volatility, volume, reversal-risk, chop-risk, total score,
  confidence, reasons, and veto reasons
- `riskFilters`: data freshness, volatility, volume confirmation, chop, conflict, and
  mean-reversion filter states

## Indicator Features

The v0 engine computes local deterministic formulas for:

- EMA fast/slow and EMA slope;
- RSI;
- MACD line, signal line, histogram, and histogram slope;
- Bollinger bands, band position, bandwidth, squeeze, and expansion;
- ATR and realized-volatility proxy;
- 1m/3m/5m momentum;
- volume z-score and abnormal-volume flag.

These indicators are computed from fixture OHLCV samples by default. With `sourceMode=live`, they
are computed from Coinbase Exchange public candles after safe parsing, closed-candle filtering, and
freshness checks. CI uses mocked live adapter responses and does not call Coinbase; mocked packets
must be marked as test/mock provenance and not displayed as real live data.

## Live OHLCV Source

RC-8 selects Coinbase Exchange public candles as the default live OHLCV source:

- endpoint: `GET https://api.exchange.coinbase.com/products/{product_id}/candles`
- product ids: `BTC-USD`, `ETH-USD`
- adapter intervals: `1m` maps to `granularity=60`, `5m` maps to `granularity=300`,
  `15m` maps to `granularity=900`, and `1h` maps to `granularity=3600`
- no Authorization header, API key, wallet, or private endpoint is used

The signal endpoint currently fetches 1m candles for both `5m` and `10m` horizons so the existing
1m/3m/5m feature set remains comparable with fixture mode. Coinbase Exchange historical rates may
be incomplete and should not be polled frequently, so live mode is for explicit local/manual use.
It is not a CI dependency.

The standalone `/market-data/live` endpoint and web page can request `1m`, `5m`, `15m`, and `1h`
candles for display. The signal model remains experimental and continues to use 1m underlying
candles until the feature model is explicitly revalidated for wider bars.

## Fail-Closed Behavior

Live mode returns HTTP 200 with `NO_SIGNAL` when OHLCV evidence is unusable, including:

- network or timeout failure;
- non-array or unparsable candle response;
- missing or non-numeric OHLCV fields;
- insufficient closed candles;
- incomplete latest candle after filtering;
- stale latest closed candle.

The response surfaces `dataQuality.warnings`, `dataQuality.freshness`, and `failClosedReasons` so
the UI can explain why no directional research bias was emitted. It must not synthesize missing
candles or turn weak evidence into `LONG`/`SHORT`.

## Rule Semantics

`LONG` means the weighted research rules lean upward.

`SHORT` means the weighted research rules lean downward.

`NO_SIGNAL` means evidence is insufficient, conflicting, stale, or blocked by fail-closed risk.

Rules are multi-factor. A single RSI, MACD, or Bollinger condition cannot decide direction by
itself. RC-9 combines trend, momentum, volatility, volume confirmation, reversal risk, chop risk,
and optional context. Conflicts reduce confidence or veto direction. Stale or insufficient candles,
too-low volatility, extreme volatility, high chop risk, module conflict, and event-risk context fail
closed to `NO_SIGNAL`.

Initial RC-9 confluence thresholds are:

- 5m: absolute total score at least `0.68`;
- 10m: absolute total score at least `0.65`, with stronger trend alignment required.

`LONG` and `SHORT` are research biases only. The UI renders them as `LONG bias` and `SHORT bias`.

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
- No default live polling; `sourceMode=live` is explicit local/manual use only.
- No full historical signal marker overlay; recent markers belong to the Event Signal Console and
  replay/stats workflows remain out of scope.
- No default backtest execution on page open; RC-9 preview is on-demand and small-sample only.
