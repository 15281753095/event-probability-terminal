# Event Signal Console API

Status: implemented as a fixture-default, live-optional, read-only research console with RC-11
runtime/profile fields.

This API returns one BTC/ETH short-horizon research console payload. It is not a trading API, not
investment advice, not a fair-probability pricing model, and not an order-generation system.

## Endpoint

```text
GET /signals/console
GET /signals/console?symbol=BTC&horizon=5m
GET /signals/console?symbol=BTC&horizon=5m&sourceMode=live
GET /signals/console?symbol=BTC&horizon=5m&includeBacktest=true
```

Supported query filters:

- `symbol`: `BTC` or `ETH`; default `BTC`
- `horizon`: `5m` or `10m`; default `5m`
- `sourceMode`: `fixture` or `live`; default `fixture`
- `includeBacktest`: `true` only when the user explicitly requests the preview

Unsupported filters return a typed `ept-api-v1` error with:

- `status: "unsupported"`
- `error: "out_of_scope"`

## Response

The response body is `EventSignalConsoleResponse` from `packages/shared-types`.

Top-level fields:

- `meta`: `event_signal_console` metadata
- `symbol`: selected `BTC` or `ETH`
- `horizon`: selected `5m` or `10m`
- `sourceMode`: `fixture` or `live`
- `profileName`: currently `balanced`
- `currentSignal`: current `ResearchSignal`
- `confluence`: current `ConfluenceScore`
- `riskFilters`: current `RiskFilterSummary`
- `recentCandles`: recent OHLCV candles only
- `recentMarkers`: recent signal markers only, capped at 20
- `backtestPreview`: disabled unless `includeBacktest=true`
- `warnings`: user-facing research-only and fail-closed warnings

`meta` always marks the response as:

- `contractVersion: "ept-api-v1"`
- `responseKind: "event_signal_console"`
- `source: "research_signal_engine"`
- `mode: "fixture"` or `"live"`
- `isReadOnly: true`
- `isResearchOnly: true`
- `isTradeAdvice: false`
- `modelVersion: "research-signal-engine-v0"`

## ConfluenceScore

`ConfluenceScore` contains:

- `profileName`
- `trendScore`
- `momentumScore`
- `volatilityScore`
- `volumeScore`
- `reversalRisk`
- `chopRisk`
- `totalScore`
- `direction`: `LONG`, `SHORT`, or `NO_SIGNAL`
- `confidence`
- `reasons`
- `vetoReasons`

Rules are multi-factor and use the `balanced` profile. A single RSI, MACD, Bollinger, volume, or
EMA condition cannot decide direction alone. Direction is emitted only when confluence clears the
5m/10m profile threshold and no veto is active.

## Risk Filters

The console exposes:

- data freshness
- volatility state
- volume confirmation
- chop state
- conflict state
- mean-reversion risk

`NO_SIGNAL` is expected when data is stale, insufficient, conflicted, choppy, too quiet, extremely
volatile, flat by EMA/MACD checks, missing confirmation, or blocked by manual event-risk context.

## Runtime UI Notes

The Web workbench can auto-refresh `/signals/console` from the browser, but this is display polling
only. It is off by default, supports 15s/30s/60s intervals, floors live 15s refreshes to 30s, and
does not place orders or connect accounts. Browser-local signal history is capped at 20 entries and
is not a trade log, replay engine, paper broker, or performance record.

## Markers

`recentMarkers` intentionally contains only recent markers. The API does not return full-history
signal markers and the web chart does not draw a full historical signal overlay. This prevents chart
performance problems and avoids implying long-horizon validation that does not exist in Phase 1.

Marker text is limited to:

- `LONG bias`
- `SHORT bias`
- `NO_SIGNAL`

## Backtest Preview

Backtest preview is disabled by default:

```json
{
  "enabled": false,
  "status": "not_loaded"
}
```

When `includeBacktest=true`, the API computes a lightweight local preview from the currently
available candle sample. It may include:

- `sampleSize`
- `winRate`
- `averageReturn`
- `maxDrawdownProxy`
- `caveats`

The preview is small-sample research diagnostics only. It does not model fees, slippage, fills,
order-book queue, funding, latency, settlement rules, or real trading performance. It is not a
predictive guarantee.

## Explicit Non-Goals

- No buy/sell/order output.
- No leverage, position size, or real entry price.
- No real-money trading.
- No private/authenticated endpoint.
- No wallet integration.
- No Predict.fun or Binance Wallet adapter.
- No paper broker.
- No full replay engine.
- No live X/news/macro dependency.
- No CI dependency on external network data.
