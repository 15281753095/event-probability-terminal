# Architecture

## Current Shape

Event Probability Terminal is a monorepo with separate boundaries for UI, API gateway, market ingestion, shared contracts, and research services.

```text
apps/web
  -> apps/api-gateway
    -> services/market-ingestor
      -> Polymarket public-read adapter boundary
        -> local fixtures by default
    -> services/pricing-engine
      -> placeholder fair-value contract

packages/shared-types
  -> shared contracts used by web, api-gateway, and market-ingestor

services/pricing-engine
  -> Python placeholder fair-value service

packages/research-signals
  -> deterministic technical indicators, confluence engine, fixture-backed signals, Event Signal Console, and explicit Coinbase Exchange live OHLCV adapter
```

## Service Boundaries

### Web

`apps/web` renders the Markets Scanner RC-2 and evidence-first Market Detail RC-3 view. It calls the local API gateway and does not call market vendors directly.

The scanner supports fixture-backed filtering, query state, and sorting across the normalized
candidate set. It also surfaces accepted, visible, rejected, placeholder, and open-gap state. The
detail page shows the selected market, binary outcomes, timings, fixture-backed book snapshot when
available, research readiness, token trace, source trace, provenance, open evidence gaps, related
fixture markets, and placeholder pricing state from a single `MarketDetailResponse` contract.

The scanner page also renders a Research Signal Panel. It shows fixture/default or explicit live
`LONG bias`, `SHORT bias`, and `NO_SIGNAL` outputs for BTC/ETH 5m/10m. It displays source mode,
source name, freshness, warnings, and fail-closed reasons. It does not show buy/sell language,
leverage, position size, order forms, or trading controls.

The scanner page also renders Event Signal Workbench RC-11. It provides BTC/ETH, 5m/10m, and
fixture/live selectors; a current research signal; confluence score breakdown; risk filters;
recent candlestick chart; recent-only signal markers capped at 20; low-frequency browser-local auto
refresh controls; local recent signal history; active profile display; and an on-demand backtest
preview. The backtest preview is collapsed by default and does not run unless requested by the
user. Auto refresh is display polling only and is not automated trading.

### API Gateway

`apps/api-gateway` exposes the minimal read-only API:

- `GET /healthz`
- `GET /markets`
- `GET /markets/:id`
- `GET /markets/:id/book`
- `GET /markets/:id/detail`
- `GET /scanner/top`
- `GET /signals/research`
- `GET /signals/console`

Scanner output currently calls the pricing-engine v0 placeholder contract for fair-value shape and still marks edge fields as placeholders. Scanner metadata includes rejected count, fail-closed summary, and uncertainty so the UI can explain why some upstream markets were not normalized.

Market detail output is organized server-side as `MarketDetailResponse`. It combines an accepted
normalized market, optional fixture-backed order-book snapshot, placeholder scanner candidate,
related fixture markets, token trace, source trace, evidence trail, open evidence gaps, and an
explicit read-only/placeholder message. This keeps research workflow semantics out of page-local
ad-hoc shaping and does not add new vendor endpoints.

The scanner and detail API contracts are protected by fixture-backed snapshot tests. These tests
lock stable response projections while leaving live vendor payloads, wall-clock time, and
machine-specific fetch errors out of the snapshot surface.

`GET /signals/research` exposes `ResearchSignalsResponse` for the research-signal slice. Fixture
mode uses deterministic OHLCV fixtures. `sourceMode=live` explicitly calls the
`@ept/research-signals` Coinbase Exchange OHLCV adapter and converts usable closed candles into the
same indicator and rule engine. The API gateway does not call vendor APIs directly. Live failures
return `NO_SIGNAL` with fail-closed reasons rather than HTTP 500 for expected data/source failures.
It does not call X, news, macro, wallet, or vendor trading APIs.

`GET /signals/console` exposes `EventSignalConsoleResponse` for one selected BTC/ETH 5m/10m
research console. Fixture mode is default. `sourceMode=live` uses the same Coinbase Exchange
adapter boundary and fail-closed behavior as `/signals/research`. `includeBacktest=true` is the
only path that computes the lightweight backtest preview. The endpoint returns recent candles and
recent markers only; it does not return a full historical signal overlay. RC-11 includes the active
`balanced` profile name in signal/console payloads.

### Market Ingestor

`services/market-ingestor` owns external market adapter boundaries. The current Polymarket adapter is fixture-first and fail-closed for unconfirmed classification.

Live public mode exists as an adapter transport path, but BTC/ETH and 10m/1h classification is not opened until approved public fixtures confirm the mapping.

### Shared Types

`packages/shared-types` owns the current cross-package TypeScript contracts:

- `API_CONTRACT_VERSION`
- `ApiResponseMeta`
- `ApiErrorResponse`
- `EventMarket`
- `OrderBookSnapshot`
- `MarketDetailResponse`
- `EvidenceTrailItem`
- `ResearchReadiness`
- `RelatedMarketSummary`
- `FairValueSnapshot` placeholder
- `TradeCandidate` placeholder
- `ResearchSignal`
- `ResearchSignalsResponse`
- `ConfluenceScore`
- `RiskFilterSummary`
- `SignalMarker`
- `BacktestPreview`
- `EventSignalConsoleResponse`

The types intentionally avoid encoding unconfirmed upstream Polymarket fields as stable domain contracts.

The current local API contract version is `ept-api-v1`. Scanner/detail success responses carry a
stable `meta` block with response kind, generation time, status, read-only/fixture/placeholder
flags, and source mode. Typed API errors use `ApiErrorResponse` and the same contract version.
Research-signal responses also use `ept-api-v1`, but mark `source: "research_signal_engine"`,
`isResearchOnly: true`, and `isTradeAdvice: false`.
Event Signal Console responses use the same contract version and research-only/not-trade-advice
flags.

`EventMarket` currently models only binary markets. It preserves upstream outcome labels and token IDs as `outcomes.primary` and `outcomes.secondary`, so both `Yes`/`No` and observed `Up`/`Down` labels can be represented without creating a general multi-outcome model. The contract does not infer pricing, trading direction, or strategy side from those labels.

### Pricing Engine

`services/pricing-engine` is a Python placeholder HTTP service. It exposes `GET /healthz` and `POST /v0/fair-value`.

The v0 fair-value endpoint consumes normalized binary `EventMarket` input, including `outcomes.primary` and `outcomes.secondary`, and returns `null` probabilities with explicit placeholder metadata. It does not compute fair probability, confidence, edge, or trade recommendations.

Pricing-engine v1 is currently research documentation only. The v1 boundary defines required
features, freshness rules, and validation standards, but no non-placeholder model code exists.
ADR 0005 further defines Polymarket Up/Down payoff and reference-level extraction as a
research-only contract. The 2026-04-23 fixture confirms 5M Chainlink payoff wording, but Up/Down
labels still cannot produce non-placeholder pricing until the accepted 10m/1h target family has
fixture-backed reference/start value, settlement source, comparator, tie-rule, and freshness
evidence.

### Research Signals

`packages/research-signals` is a TypeScript package for deterministic research signals. It computes
EMA, RSI, MACD, Bollinger bands, ATR, realized volatility, short-horizon momentum, and volume
z-score from local OHLCV fixtures by default. RC-8 adds a Coinbase Exchange public-read OHLCV
adapter for explicit local live mode.

The v0 engine combines multiple weighted factors into a `ResearchSignal` with direction `LONG`,
`SHORT`, or `NO_SIGNAL`. RC-9 adds a confluence evaluator that separately scores trend, momentum,
volatility, volume, reversal risk, and chop risk. It emits reasons, confidence, score, feature
snapshots, data quality, risk filters, invalidation notes, and fail-closed reasons. It is not a
pricing engine and does not produce fair probabilities, trade advice, orders, leverage, or position
sizing.

RC-11 moves key confluence thresholds into the `balanced` signal profile with separate 5m and 10m
thresholds. The no-trade filter vetoes flat EMA slope, flat MACD histogram, narrow volatility,
extreme volatility, stale/insufficient data, and module conflicts before any directional bias can
be emitted.

The Coinbase Exchange adapter maps `BTC` to `BTC-USD` and `ETH` to `ETH-USD`, maps `1m` to
`granularity=60`, safe-parses candle arrays, sorts by start time, drops incomplete candles, enforces
freshness, and fails closed on network, timeout, parse, stale, or insufficient-data failures. CI
uses mocked fetches only.

## Data Flow

1. Web requests scanner or market detail data from `apps/api-gateway`.
2. API gateway calls the Polymarket public-read adapter.
3. Adapter reads local fixtures by default.
4. Adapter normalizes accepted markets into `EventMarket` and returns rejected records separately.
5. API gateway calls pricing-engine v0 for placeholder fair-value shape when serving scanner and detail candidate output.
6. API gateway summarizes fail-closed rejection reasons for scanner metadata.
7. API gateway organizes detail evidence/provenance fields into `MarketDetailResponse`.
8. API gateway computes fixture-backed research signals through `@ept/research-signals` for
   `/signals/research` by default.
9. If `sourceMode=live` is explicitly requested, API gateway calls the research-signals OHLCV
   adapter boundary for Coinbase Exchange public candles, then uses the same indicator/rule engine.
10. API gateway computes Event Signal Console payloads through `@ept/research-signals`, returning
    recent candles, recent markers, confluence, risk filters, and optionally a small backtest
    preview.
11. Web runtime controls may poll the same console endpoint at user-selected low-frequency
    intervals and keep a browser-local recent signal history capped at 20 entries.
12. API gateway strips raw upstream payloads before returning API responses.

## Current Infrastructure

`docker-compose.yml` defines local PostgreSQL and Redis. They are available for later persistence and caching work but are not used by the current fixture-backed flow.

## Constraints

- No real-money trading.
- No private/authenticated vendor endpoints.
- No business-layer raw vendor HTTP requests.
- No Predict.fun or Binance Wallet implementation in the current slice.
- No multi-outcome market support in the current domain contract.
- No real pricing model; pricing-engine v0 is contract plus placeholder output only.
- Research signals are research-only and must not be presented as investment advice or trade
  instructions.
- Live OHLCV mode is explicit local/manual use. Fixture remains the default, and CI must mock live
  adapter responses.
- Event Signal Console markers must remain recent-only; full-history signal display belongs in
  future replay/stats workflows, not the primary chart.
- Backtest preview must remain on-demand, small-sample, and explicitly non-predictive.
- Auto refresh must remain UI polling only; it must not submit orders, connect accounts, or imply
  automated trading. Signal history must remain browser-local and must not become a trade log.
- Pricing-engine v1 is research-only until data freshness and validation gates are satisfied.
- No non-placeholder Up/Down pricing without confirmed payoff specification, reference level, and
  settlement rule.
- Market Detail RC-3 is read-only inspection only; it has no trade, order, replay, or charting action.
- All unconfirmed external details must remain marked `TODO`.

## TODO

- TODO: Confirm BTC/ETH 10m/1h live discovery rules before opening live classification.
- TODO: Confirm Polymarket Up/Down payoff/reference/settlement extraction before pricing v1.
- TODO: Add persistence ADR before using PostgreSQL.
- TODO: Add cache/data freshness ADR before using Redis.
- TODO: Satisfy pricing-engine v1 data, freshness, and calibration gates before replacing placeholder probabilities.
