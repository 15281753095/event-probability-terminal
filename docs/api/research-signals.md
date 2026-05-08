# Research Signals API

Status: implemented through RC-23 as fixture/default research signals, live/mock fair-value chart
markers, research-only signal replay metrics, Strategy Lab parameter validation, local research
data-store capture, and short-window BTC/ETH event-contract signal support.

This API publishes BTC/ETH 5m and 10m research signals. Fixture mode remains the default for this
list endpoint. Live mode must be explicitly requested and now defaults to Binance Spot public
candles. RC-9 adds confluence and
risk-filter fields to each `ResearchSignal`; the richer console payload is documented separately in
`docs/api/event-signal-console.md`. RC-19 adds a separate research-only fair value endpoint for
eligible BTC/ETH Polymarket price-threshold markets. This is not a trading API, not investment
advice, and not an execution system.

## Endpoint

```text
GET /signals/research
GET /signals/research?symbol=BTC&horizon=5m
GET /signals/research?symbol=BTC&horizon=5m&sourceMode=live
GET /signals/fair-value?symbol=BTC
GET /signals/fair-value?symbol=ETH
GET /signals/fair-value?symbol=ALL
GET /signals/replay?symbol=BTC&window=1w
GET /signals/replay?symbol=ETH&window=1w
GET /signals/replay?symbol=ALL&window=1w
GET /signals/replay?symbol=BTC&window=1d&interval=5m&strategy=fair-value-v1
GET /signals/replay?symbol=BTC&window=1w&mock=true
GET /signals/replay?symbol=BTC&window=1w&useStored=true
GET /signals/replay/stored?symbol=BTC&window=1w
GET /short-window/current?symbol=BTC&interval=5m&venue=proxy-generic
GET /short-window/current?symbol=ETH&interval=10m&venue=proxy-generic
GET /short-window/replay?symbol=BTC&interval=5m&window=1d&venue=proxy-generic
GET /short-window/replay?symbol=ETH&interval=10m&window=1w&venue=proxy-generic
GET /strategy-lab/sweep?symbol=BTC&window=1w
GET /strategy-lab/sweep?symbol=ETH&window=1w
GET /strategy-lab/sweep?symbol=ALL&window=1w
GET /strategy-lab/sweep?symbol=BTC&window=1w&mock=true&maxCombinations=50
GET /strategy-lab/stored?symbol=BTC&window=1w
GET /store/status
GET /capture/runs
POST /capture/run
```

Supported query filters:

- `symbol`: `BTC` or `ETH`
- `horizon`: `5m` or `10m`
- `sourceMode`: `fixture` or `live`

For `/signals/fair-value`, supported `symbol` values are `BTC`, `ETH`, and `ALL`.

For `/signals/replay`, supported filters are:

- `symbol`: `BTC`, `ETH`, or `ALL`; default `BTC`
- `window`: `1d`, `3d`, `1w`, or `1m`; default `1w`
- `interval`: `1m`, `5m`, `15m`, or `1h`; default `1m`
- `strategy`: `fair-value-v1` only
- `mock`: `true` or `false`; deterministic mock mode is for CI/smoke only
- `useStored`: `true` or `false`; when true, the endpoint checks the local research data store
  first and returns the latest stored replay result if available

For `/short-window/current` and `/short-window/replay`, supported filters are:

- `symbol`: `BTC` or `ETH`; default `BTC`
- `interval`: `5m`, `10m`, or `15m`; default `5m`
- `venue`: `proxy-generic`, `binance-wallet-prediction`, `hibit`, or `mock`; default
  `proxy-generic`
- `window` on replay: `1d`, `3d`, `1w`, or `1m`; default `1d`
- `mock`: `true` or `false`; deterministic mock mode is for CI/smoke only
- `useStored` on replay: `true` checks the local store for a prior short-window replay payload

`proxy-generic` is a proxy model over Binance Spot public data. It is not a verified Binance
Wallet, HiBit, Coinbase, or Kalshi settlement rule. `binance-wallet-prediction` and `hibit` default
to unknown-rule fail-closed behavior until reliable public documentation verifies exact settlement
rules.

For `/strategy-lab/sweep`, supported filters are:

- `symbol`: `BTC`, `ETH`, or `ALL`; default `BTC`
- `window`: `1d`, `3d`, `1w`, or `1m`; default `1w`
- `mode`: `mock` or `live`; default `live`
- `mock`: `true` or `false`; overrides mode for deterministic CI/smoke use
- `maxCombinations`: default `50`, capped at `100`
- `intervals`: comma-separated subset of `1m,5m,15m,1h`; default grid uses `5m,15m`
- `minEdgeBps`: comma-separated numbers; default `200,500,800`
- `maxSpread`: comma-separated numbers; default `0.05,0.10,0.15`
- `volatilityLookbackCandles`: comma-separated integers; default `20,50,100`
- `minConfidence`: comma-separated numbers; default `0.2,0.4`
- `feesBps` and `slippageBps`: comma-separated integers; defaults `0,50`

For `/capture/run`, supported `job` values are `snapshot`, `once`, `binance`, `polymarket`,
`fair-value`, `replay`, and `strategy-lab`. The default HTTP job is `snapshot`, which captures
Binance candles, Polymarket markets, and fair-value signals. Use `job=once` or CLI
`pnpm capture:once` for all capture jobs. In live default mode, replay and Strategy Lab jobs are
bounded fail-closed summaries unless `EPT_CAPTURE_FULL_LIVE_REPLAY=true` and
`EPT_CAPTURE_FULL_LIVE_STRATEGY_LAB=true` are explicitly set. Capture is local research capture over
public/read-only data only.

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
- `sourceName: "fixture"`, `"binance_spot_public"`, or `"coinbase_exchange"`
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
- `source`: `fixture`, `binance_spot_public`, or `coinbase_exchange`
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
are computed from Binance Spot public candles after safe parsing, closed-candle filtering, and
freshness checks. CI uses mocked live adapter responses and does not call Binance or Coinbase; mocked packets
must be marked as test/mock provenance and not displayed as real live data.

## Live OHLCV Source

RC-15 selects Binance Spot public candles as the default live OHLCV source:

- provider: `binance-spot-public`
- endpoint: `GET https://data-api.binance.vision/api/v3/klines`
- ticker endpoint used by the market-data packet: `GET /api/v3/ticker/24hr`
- products: `BTCUSDT`, `ETHUSDT`
- adapter intervals: `1m`, `5m`, `15m`, and `1h`
- no Authorization header, API key, wallet, account endpoint, signed parameter, or order endpoint is used

Coinbase Exchange remains available as a fallback display/source provider:

- endpoint: `GET https://api.exchange.coinbase.com/products/{product_id}/candles`
- product ids: `BTC-USD`, `ETH-USD`
- adapter intervals: `1m` maps to `granularity=60`, `5m` maps to `granularity=300`,
  `15m` maps to `granularity=900`, and `1h` maps to `granularity=3600`
- no Authorization header, API key, wallet, or private endpoint is used

The signal endpoint currently fetches 1m candles for both `5m` and `10m` horizons. This keeps the
event window more precise while the confluence model continues to compute 1m/3m/5m features. Live
mode is not a CI dependency.

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

RC-16 adds provider health metadata to the live market-data and event console payloads that feed
the signal UI. `providerHealth` reports requested provider, resolved provider, `sourceType`, health
status, latency, candle count versus expected minimum, last candle time, fixture/mock status,
fallback usage, fallback reason, fail-closed reasons, and `checkedAt`. A successful Binance public
request is `status: "ok"` and `fallbackUsed: false`. If Binance public data fails and Coinbase
Exchange supplies the live packet, the response is `status: "degraded"`, `fallbackUsed: true`, and
`resolvedProvider: "coinbase-exchange"`; it must not be presented as Binance success.

RC-17 adds `/market-data/realtime` for BTC/ETH SSE price ticks. API Gateway connects to Binance
Spot public WebSocket market streams (`trade`, `aggTrade`, `bookTicker`, and `kline`) and normalizes
them into `RealTimePriceTick`. The browser receives SSE from the local API boundary only. REST
candles remain the bootstrap chart path. Mock/smoke mode emits deterministic `sourceType: "mock"`
ticks and does not connect to Binance.

RC-18 adds read-only Polymarket active market odds at `/markets/polymarket/active`. Gamma public
data is used for active market discovery; CLOB public data is used for orderbook, midpoint, price,
and spread diagnostics. These market rows are displayed as event-contract context and are not used
to produce production signals. Missing resolution rules, token IDs, outcomes, or ambiguous BTC/ETH
binding must mark the market as research-ineligible.

RC-19 adds `/signals/fair-value`. The endpoint combines Binance public underlying candles/current
price with Polymarket public market odds, but only after `evaluateMarketEligibility` accepts the
market. The response is `FairValueSignalResponse`:

- `symbol`
- `checkedAt`
- `sourceType`
- `providerHealth`
- `snapshots`
- `markers`
- `rejectedMarkets`
- `warnings`
- `isResearchOnly: true`

Each `FairProbabilitySnapshot` includes model probability, market probability, Yes/No edge,
prices, spread, confidence, method, assumptions, warnings, reject reasons, and
`isResearchOnly: true`. Each fair-value marker has side `LONG_YES`, `LONG_NO`, `NO_SIGNAL`, or
`REJECTED`. These side labels are research annotations for chart display and are not instructions
to execute.

The fair-value v1 method is `realized-vol-terminal-probability-v1`. It uses recent closed-candle
log-return realized volatility to estimate terminal probability relative to an extracted threshold.
It ignores jump risk, resolution disputes, and market impact beyond configured buffers. It does not
claim risk-neutral pricing or profitability.

Eligibility is fail-closed. A market is rejected unless it has a clear BTCUSDT/ETHUSDT binding,
binary Yes/No tokens, usable Yes/No price or midpoint, acceptable spread, known liquidity status,
explicit threshold, terminal above/below direction, valid expiry, and sufficiently explicit
resolution rule. Ambiguous BTC+ETH text, missing threshold, missing resolution rule, unknown
liquidity, high spread, and path-dependent `hit/reach/trade above` wording are rejected. Long vague
events such as "Will bitcoin hit $1m before GTA VI?" are out of scope.

When live discovery has no eligible market, `/signals/fair-value` must return empty `snapshots`
and no fabricated live marker. Deterministic mock fair-value fixtures are allowed only for UI/CI and
must be labeled `DEV MOCK`.

RC-20 adds `/signals/replay`. The endpoint replays fair-value v1 over historical windows and
returns `SignalReplayResponse`:

- `symbol`
- `window`
- `checkedAt`
- `sourceType`
- `providerHealth`
- `metrics`
- `signals`
- `results`
- `markers`
- `warnings`
- `isResearchOnly: true`

Replay uses Binance Spot public historical klines with `startTime` and `endTime`, paginating within
Binance's documented `limit` boundary. It can query Polymarket Gamma closed markets and CLOB public
`prices-history`, but historical Polymarket prices after `signalTime` are not allowed to influence
signal generation.

Outcome status is one of `WIN`, `LOSS`, `PENDING`, `UNRESOLVED`, `REJECTED`, or `NO_SIGNAL`.
Realized win rate is computed only as:

```text
winRate = winCount / (winCount + lossCount)
```

`PENDING`, `UNRESOLVED`, `REJECTED`, and `NO_SIGNAL` are excluded from the win-rate denominator.
They are still counted in separate metrics such as pending count, rejection rate, and coverage
rate. If `actionableCount == 0` or there are no completed `WIN`/`LOSS` samples, `winRate` is
`null`, not `0%` or `100%`.

`theoreticalPnl` is explicitly hypothetical. It is not a real trade return, does not prove fill
quality, and does not observe fees, balances, positions, order books at historical depth, or
execution. If `sampleCount < 20`, replay returns `LOW_SAMPLE_SIZE`.

Live replay must never fabricate completed samples. If Polymarket closed-market outcome evidence or
Binance threshold reconstruction is unclear, results are `UNRESOLVED`. If only active markets are
available, results are `PENDING` and realized win rate remains `null`.

`NO_SIGNAL` remains a model output. It is not by itself a provider failure. Provider failure is
expressed through `providerHealth.status`, `providerHealth.failClosedReasons`, and data-quality
fields.

## Short-Window Event Contracts

RC-23 adds `/short-window/current` and `/short-window/replay`.

`/short-window/current` returns:

- `event`: current event window with start/end time, countdown, phase, start reference, current
  price, distance, rule, and `isResearchOnly=true`
- `signal`: `LONG_UP`, `LONG_DOWN`, `WAIT`, or `REJECTED` with confidence, score, score
  breakdown, reasons, reject reasons, phase, and `isResearchOnly=true`
- `realtimePrice`: the underlying Binance Spot public market-data packet
- `providerHealth`
- `sourceType`
- `rule`
- `warnings`
- `isResearchOnly=true`

`/short-window/replay` returns:

- `metrics`: total events, actionable count, wins/losses, wait/rejected/pending counts, win rate,
  long-up/long-down win rates, average confidence, average distance, max drawdown, warnings, and
  `isResearchOnly=true`
- `signals`
- `results`
- `markers`
- `warnings`
- `proxyBacktest`
- `sourceType`
- `rule`
- `isResearchOnly=true`

Replay uses historical Binance Spot public klines or deterministic mock fixtures. For each event
window, signal generation uses only candles available at signal time. `WAIT` and `REJECTED` are not
included in the win-rate denominator. Unverified live rules must return `proxyBacktest=true` and
warnings.

RC-23 short-window output is manual decision support only. It does not use browser page data, wallet
state, API keys, signed/private/account/order endpoints, balances, positions, fills, or automated
execution.

## Strategy Lab

RC-21 adds `/strategy-lab/sweep` for fair-value v1 parameter research. The response contains:

- `report: StrategyLabReport`
- `parameterResults`
- `topCandidates`
- `walkForwardResults`
- `rejectedParameterSets`
- `warnings`
- `isResearchOnly: true`

`StrategyParameterSet` includes strategy id, interval, `minEdgeBps`, `maxSpread`,
`volatilityLookbackCandles`, `minConfidence`, `minSampleCount`, `feesBps`, `slippageBps`, notes,
and `isResearchOnly: true`.

`ParameterSweepResult` wraps RC-20 `ReplayMetrics` plus rank, score, score breakdown, warnings,
rejection reasons, overfit risk, source type, and `isResearchOnly: true`. Ranking is not based only
on win rate. It rewards win rate, theoretical PnL, and coverage, then penalizes drawdown, low
sample, high pending rate, null win rate, and overfit risk.

`WalkForwardResult` reports rolling train/test windows, aggregate train metrics, aggregate test
metrics, degradation, passed/failed windows, consistency score, overfit risk, warnings, and
`isResearchOnly: true`. Train windows choose parameters before test windows are evaluated. Test
metrics must not be used to select the same window's parameter.

Top candidates are research candidates only. They cannot have null win rate, insufficient
actionable count, negative theoretical PnL, high overfit risk, or low walk-forward consistency.
They are not production strategies and must not be interpreted as a guaranteed or executable edge.

## Research Data Store and Capture

RC-22 adds a local research data store for durable public/read-only research samples. The default
path is `.var/ept-research.sqlite` when Node's built-in SQLite is available; JSONL is the fallback.
Local database files are ignored by git.

The stored tables are:

- `underlying_candles`: Binance Spot public BTCUSDT/ETHUSDT candles by interval.
- `market_snapshots`: Polymarket Gamma/CLOB public market odds snapshots.
- `fair_value_signals`: fair-value v1 marker snapshots, including `REJECTED` rows.
- `replay_results`: replay metrics by symbol/window/strategy.
- `strategy_lab_results`: Strategy Lab summary rows by symbol/window/strategy.
- `capture_runs`: job status, counts, warnings, and errors.

`/store/status` reports counts, latest timestamps, recent `1d`/`3d`/`1w`/`1m` coverage counts, and
the latest capture run. `/capture/runs` returns recent capture health records.

`POST /capture/run` defaults to lightweight `snapshot` capture. It can also trigger the full
`job=once` capture or one job. In live mode, replay capture writes fail-closed `winRate=null`
summaries unless `EPT_CAPTURE_FULL_LIVE_REPLAY=true` is set, and Strategy Lab capture writes warning
rows without top candidates unless `EPT_CAPTURE_FULL_LIVE_STRATEGY_LAB=true` is set. These jobs are
research data capture jobs, not bots. They never use private/authenticated endpoints and never
place, cancel, or manage orders. If live Polymarket has no available market, the job records success
or partial health with warnings and zero records instead of fabricating a market.

`/signals/replay/stored` and `/strategy-lab/stored` return the latest local result for the selected
symbol/window. If no stored row exists, they return `NO_STORED_REPLAY_RESULT` or
`NO_STORED_STRATEGY_LAB_RESULT`. Stored results preserve their original `sourceType`; mock rows are
not relabeled as live.

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
- No Predict.fun adapter, Binance Wallet adapter, Binance account connection, or signed Binance endpoint.
- No paper broker.
- No production replay engine, paper broker, or execution simulator.
- No production pricing model.
- No CI dependency on external network data.
- No default live polling; `sourceMode=live` is explicit local/manual use only.
- No full historical signal marker overlay; recent markers belong to the Event Signal Console and
  replay/stats workflows remain out of scope.
- No default backtest execution on page open; RC-9 preview is on-demand and small-sample only.
- No production strategy enablement. RC-17 strategy candidates and backtest runner are research-only
  scaffolds and cannot drive live signals.
- No Polymarket odds-driven production signal. RC-18 odds binding is read-only context and data
  sufficiency diagnostics only.
- No forced fair-value calculation for ineligible Polymarket markets. RC-19 chart markers are
  research-only annotations and must fail closed with rejected reasons.
