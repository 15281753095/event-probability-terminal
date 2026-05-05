# Event Signal Console API

Status: RC-16 provider health observability, read-only research console. It defaults to live Binance
Spot public ticker/candles and keeps fixture data behind explicit dev mode.

This API returns one BTC/ETH short-horizon research console payload. It is not a trading API, not
investment advice, not a fair-probability pricing model, and not an order-generation system.

## Endpoint

```text
GET /signals/console
GET /signals/console?symbol=BTC&horizon=5m
GET /signals/console?symbol=BTC&horizon=5m&provider=binance
GET /signals/console?symbol=BTC&horizon=5m&provider=coinbase
GET /signals/console?symbol=BTC&horizon=5m&sourceMode=fixture
GET /signals/console?symbol=BTC&horizon=5m&profile=conservative
GET /signals/console?symbol=BTC&horizon=5m&includeObservationPreview=true
GET /market-data/live?symbol=BTC&provider=binance
GET /market-data/live?symbol=BTC&provider=coinbase
GET /market-data/live?symbol=BTC&interval=15m
GET /market-data/realtime?symbol=BTC&provider=binance
GET /market-data/realtime?symbol=ETH&provider=binance
```

Supported query filters:

- `symbol`: `BTC` or `ETH`; default `BTC`
- `horizon`: `5m` or `10m`; default `5m`
- `provider`: `binance`, `binance-spot-public`, `coinbase`, or `coinbase-exchange`; default `binance`
- `sourceMode`: `live` or `fixture`; default `live`
- `profile`: `balanced`, `conservative`, or `aggressive`; default `balanced`
- `includeObservationPreview`: `true` only when the user explicitly requests the preview
- `includeBacktest`: legacy alias for `includeObservationPreview`
- `/market-data/live interval`: `1m`, `5m`, `15m`, or `1h`; default `1m`
- `/market-data/realtime provider`: `binance` only; API Gateway uses Binance Spot public WebSocket internally

Unsupported filters return a typed `ept-api-v1` error with:

- `status: "unsupported"`
- `error: "out_of_scope"`

## Response

The response body is `EventSignalConsoleResponse` from `packages/shared-types`.

Top-level fields:

- `meta`: `event_signal_console` metadata
- `symbol`: selected `BTC` or `ETH`
- `horizon`: selected `5m` or `10m`
- `sourceMode`: `live` or `fixture`
- `dataProvenance`: source, `sourceType`, provider, product id, display symbol, candle interval, candle count, and live/mock/fixture flags
- `providerHealth`: requested/resolved provider, health status, latency, fallback, candle count,
  last candle, fail-closed reasons, and checked timestamp
- `profileName`: active research profile
- `eventWindow`: 5m/10m observation window metadata, including expected resolution time
- `observationCandidate`: local observation seed fields for the web UI
- `currentSignal`: current `ResearchSignal`
- `confluence`: current `ConfluenceScore`
- `riskFilters`: current `RiskFilterSummary`
- `recentCandles`: recent OHLCV candles only
- `recentMarkers`: recent signal markers only, capped at 10
- `observationPreview`: disabled unless `includeObservationPreview=true`
- `backtestPreview`: legacy-compatible alias of the observation preview metrics
- `researchStrategies`: registry count and research-only/backtest scaffold status; these strategies
  do not drive `currentSignal`
- `warnings`: user-facing research-only and fail-closed warnings

`GET /market-data/live` returns the current live market-data packet used by the console:

- `symbol`
- `source: "binance-spot-public"` or `"coinbase-exchange"`
- `sourceType: "live"` for real public provider data, or `"mock"` for deterministic CI/smoke packets
- `provider: "binance-spot-public"` or `"coinbase-exchange"`
- `productId`: `BTCUSDT`, `ETHUSDT`, `BTC-USD`, or `ETH-USD`
- `displaySymbol`: chart/product label such as `BTCUSDT`
- `fetchedAt`
- `latestPrice`
- `bid`
- `ask`
- `tickerTime`
- `tickerFreshnessSeconds`
- `candles`
- `candleInterval`
- `candleGranularity`
- `candleCount`
- `latestCandleTime`
- `lastCandleTime`
- `candleFreshnessSeconds`
- `isLive`
- `isMock`
- `isFixtureBacked`
- `provenance`
- `providerHealth`
- `warnings`
- `failClosedReasons`

`providerHealth` fields:

- `requestedProvider`: `binance`, `coinbase`, or `mock`
- `resolvedProvider`: `binance-spot-public`, `coinbase-exchange`, or `mock`
- `sourceType`: `live`, `mock`, or `fixture`
- `status`: `ok`, `degraded`, or `failed`
- `latencyMs`
- `candleCount`
- `expectedMinCandles`
- `lastCandleTime`
- `isFixtureBacked`
- `fallbackUsed`
- `fallbackReason`
- `failClosedReasons`
- `checkedAt`

Fallback must be explicit. When Binance public data fails and Coinbase Exchange supplies the
packet, `resolvedProvider` changes to `coinbase-exchange`, `fallbackUsed` is `true`, and
`fallbackReason` preserves the Binance failure. The UI must not silently label that payload as
Binance success.

`GET /market-data/realtime` is an SSE stream:

- `Content-Type: text/event-stream`
- event names: `price`, `health`, `stale`, and `error`
- browser clients connect to API Gateway, not directly to Binance
- live mode uses Binance Spot public market streams only
- mock mode uses deterministic local ticks and marks `sourceType: "mock"`

Each realtime payload includes `symbol`, `displaySymbol`, `provider`, `sourceType`, `price`,
`bidPrice`, `askPrice`, `eventTime`, `receivedAt`, `latencyMs`, `connectionStatus`, `stale`,
`providerHealth`, and the normalized `tick` when available. `stale` or `error` events may keep the
last price for display, but the UI must not label that price as healthy live data.

Binance Spot public interval mapping:

- `1m` -> `interval=1m`
- `5m` -> `interval=5m`
- `15m` -> `interval=15m`
- `1h` -> `interval=1h`

Coinbase Exchange fallback interval mapping follows the official historical-rates granularities:

- `1m` -> `granularity=60`
- `5m` -> `granularity=300`
- `15m` -> `granularity=900`
- `1h` -> `granularity=3600`

The adapter does not synthesize missing candles. If the real candle request fails or returns too few
usable closed candles, the API returns a fail-closed payload with warning reasons; it does not
silently substitute fixture or generated bars.

`meta` always marks the response as:

- `contractVersion: "ept-api-v1"`
- `responseKind: "event_signal_console"`
- `source: "research_signal_engine"`
- `mode: "fixture"` or `"live"`
- `sourceType: "live"`, `"mock"`, or `"fixture"`
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

In live mode, `referencePrice` uses the latest closed 1m candle close while `currentPrice` uses the
latest public ticker price from the selected provider. `distanceFromReferencePct` is computed from those two values. The
reference remains an approximation and is not official event-contract settlement.

`observationCandidate` is used by the web UI to create a localStorage observation. It is not a
trade record and is not persisted server-side.

## Runtime UI Notes

The Web terminal can manually refresh `/signals/console` from the browser. It is display fetching
only and does not place orders, connect accounts, read assets, create API keys, or call signed
endpoints. RC-15 does not add a WebSocket client and must not high-frequency poll public REST ticker
or candles.

CI and smoke tests may run the API gateway with deterministic mocked provider packets. Those packets
must be marked `sourceType: "mock"`, `isLive: false`, `providerHealth.resolvedProvider: "mock"`,
and displayed with a DEV marker. Product default mode uses real Binance public data and fails
closed or transparently falls back to Coinbase Exchange when Binance is unavailable. Coinbase is a
public live fallback provider, not a fixture fallback.

`NO_SIGNAL` is distinct from provider health. It can be emitted because of momentum, volatility,
volume, chop, or profile vetoes even when `providerHealth.status` is `ok`.

The homepage shows a compact observation summary by default. The larger browser-local observation
feedback tools are kept out of the first screen and may be reached only from dev/advanced surfaces.
Directional match rate is not return, win rate, settlement accuracy, or real trading performance.

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
- No Binance account, asset, signed, order, position, leverage, or trading endpoint.
- No paper broker.
- No full replay engine.
- No live X/news/macro dependency.
- No CI dependency on external network data.
