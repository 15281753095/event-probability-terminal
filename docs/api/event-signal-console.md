# Event Signal Console API

Status: implemented as a fixture-default, live-optional, read-only research console with RC-12
Reality Mode, strategy profiles, event windows, and local observation support.

This API returns one BTC/ETH short-horizon research console payload. It is not a trading API, not
investment advice, not a fair-probability pricing model, and not an order-generation system.

## Endpoint

```text
GET /signals/console
GET /signals/console?symbol=BTC&horizon=5m
GET /signals/console?symbol=BTC&horizon=5m&sourceMode=live
GET /signals/console?symbol=BTC&horizon=5m&profile=conservative
GET /signals/console?symbol=BTC&horizon=5m&includeObservationPreview=true
```

Supported query filters:

- `symbol`: `BTC` or `ETH`; default `BTC`
- `horizon`: `5m` or `10m`; default `5m`
- `sourceMode`: `fixture` or `live`; default `fixture`
- `profile`: `balanced`, `conservative`, or `aggressive`; default `balanced`
- `includeObservationPreview`: `true` only when the user explicitly requests the preview
- `includeBacktest`: legacy alias for `includeObservationPreview`

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
- `profileName`: active research profile
- `eventWindow`: 5m/10m observation window metadata, including expected resolution time
- `observationCandidate`: local observation seed fields for the web UI
- `currentSignal`: current `ResearchSignal`
- `confluence`: current `ConfluenceScore`
- `riskFilters`: current `RiskFilterSummary`
- `recentCandles`: recent OHLCV candles only
- `recentMarkers`: recent signal markers only, capped at 20
- `observationPreview`: disabled unless `includeObservationPreview=true`
- `backtestPreview`: legacy-compatible alias of the observation preview metrics
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

Rules are multi-factor and use the selected research profile. A single RSI, MACD, Bollinger,
volume, or EMA condition cannot decide direction alone. Direction is emitted only when confluence
clears the profile's 5m/10m threshold and no veto is active.

Profiles are research parameters, not trading strategies:

- `balanced`: current default behavior.
- `conservative`: higher threshold, higher minimum confidence, stricter chop and volume confirmation.
- `aggressive`: lower threshold and weaker volume requirement, while still retaining stale,
  extreme-volatility, chop, and conflict vetoes.

5m and 10m use separate profile settings. 5m is stricter on freshness, momentum, and volume.
10m gives more weight to trend stability and EMA slope.

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

## Event Window And Observation Candidate

`eventWindow` describes the local observation window:

- `horizon`
- `expectedResolveAt`
- `windowStart`
- `windowEnd`
- `referencePrice`
- `currentPrice`
- `distanceFromReferencePct`
- `canObserve`
- `referencePriceSource`
- `isReferenceApproximation`
- `warnings`

The reference price currently uses the latest closed candle close. It is explicitly marked as an
approximation and is not official event-contract settlement.

`observationCandidate` is used by the web UI to create a localStorage observation. It is not a
trade record and is not persisted server-side.

## Runtime UI Notes

The Web workbench can auto-refresh `/signals/console` from the browser, but this is display polling
only. It is off by default, supports 15s/30s/60s intervals, floors live 15s refreshes to 30s, and
does not place orders or connect accounts.

Signal Observation Log is browser-local. It keeps the latest 100 observations, displays the latest
20, and resolves pending 5m/10m observations close-to-close after refresh. `NO_SIGNAL` observations
are recorded as `no_signal` but excluded from directional match rate. Directional match rate is not
return, win rate, settlement accuracy, or real trading performance.

## Markers

`recentMarkers` intentionally contains only recent markers. The API does not return full-history
signal markers and the web chart does not draw a full historical signal overlay. This prevents chart
performance problems and avoids implying long-horizon validation that does not exist in Phase 1.

Marker text is limited to:

- `LONG bias`
- `SHORT bias`

`NO_SIGNAL` is not drawn as a primary chart marker. Pending/hit/miss observation status can be
shown in the observation log; hit/miss does not need to be drawn across the K-line chart.

## Observation Preview

Observation Preview is disabled by default:

```json
{
  "enabled": false,
  "status": "not_loaded"
}
```

When `includeObservationPreview=true`, the API computes a lightweight local directional check from
the currently available candle sample. It may include:

- `sampleSize`
- `directionalMatchRate`
- `pendingCount`
- `invalidatedCount`
- `caveats`

The preview is small-sample research diagnostics only. It is not a backtest, does not model fees,
slippage, fills, order-book queue, funding, latency, settlement rules, or real trading performance,
and is not a predictive guarantee.

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
