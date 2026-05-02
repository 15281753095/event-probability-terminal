# Event Probability Terminal

Read-only research terminal for BTC/ETH prediction-market event contracts, starting with Polymarket public market data.

## Current Status -test-2

This repository is in Phase 1 foundation work. It has a minimal local end-to-end read-only slice:

- `services/market-ingestor`: Polymarket public-read adapter boundary, fixture-first by default.
- `packages/shared-types`: shared contracts for `EventMarket`, `OrderBookSnapshot`, `MarketDetailResponse`, and placeholder scanner/pricing objects.
- `packages/research-signals`: deterministic technical-indicator, confluence, and research-signal engine with Coinbase Exchange public live ticker/candles for the terminal and explicit fixture dev mode.
- `apps/api-gateway`: Fastify read-only API for live market data, fixture-backed markets/scanner metadata, contract-backed market detail, research signals, Event Signal Console, and pricing placeholders.
- `apps/web`: Next.js RC-13 minimal live BTC/ETH 5m/10m prediction terminal, hidden legacy scanner route, and Market Detail RC-3 evidence views that read from the API gateway.
- `services/pricing-engine`: Python placeholder contract for fair-value output shape.

The current homepage is live-first. It uses Coinbase Exchange public `BTC-USD`/`ETH-USD` ticker and candles by default for local manual use. Fixture data remains available only through explicit dev mode or the legacy scanner route. A limited Polymarket Gamma/public-search live fixture capture was completed on 2026-04-21 to tighten contract tests, but it did not confirm active BTC/ETH 5m/10m market discovery for homepage display.
Pricing-engine v1 research docs now define the additional Up/Down payoff and reference-level
evidence required before any real fair-probability model can be implemented. A 2026-04-23 public
fixture capture strengthened 5M Up/Down payoff evidence, but it still does not open 10m/1h runtime
extraction or pricing.

## Phase 1 Scope

Supported research scope:

- Assets: `BTC`, `ETH`
- Windows: `10m`, `1h`
- Primary venue: Polymarket
- Secondary/reference venues: Predict.fun and Binance Wallet Prediction Markets are documented only; they are not implemented.
- Mode: read-only market discovery and display, with pricing-engine v0 placeholder outputs.
- Research signals: live-first BTC/ETH `5m`/`10m` technical research bias for the terminal, Event Signal Console confluence breakdown, recent-only markers capped at 10, balanced/conservative/aggressive research profiles, compact observation summary, and explicit fixture dev mode; not trade advice.
- Market contract: binary outcome markets only. The shared contract preserves upstream outcome labels, including fixture-backed `Yes`/`No` and observed `Up`/`Down`; it does not support multi-outcome markets.

Explicit exclusions:

- No real-money order placement, cancellation, settlement, wallet funding, withdrawal, or trading automation.
- No private/authenticated Polymarket adapter.
- No Predict.fun or Binance Wallet adapter.
- No real pricing model, paper broker, replay engine, or news-signal business implementation.
- No signal output that is a buy/sell instruction, order, leverage, position size, or real trading entry.
- No runtime Up/Down payoff extraction and no non-placeholder Up/Down fair probabilities.
- No multi-outcome market model.
- No inferred external API fields, schemas, authentication, signatures, or endpoint behavior.

## Technology Stack

- Web: Next.js, React, TypeScript, Tailwind, shadcn-style local UI package
- API gateway: Node.js, TypeScript, Fastify
- Market ingestion: TypeScript adapter boundary, fixture-first tests
- Research/pricing shell: Python 3.11+, pandas, polars, numpy, scipy, statsmodels
- Infrastructure: PostgreSQL and Redis through Docker Compose
- Tooling: pnpm, pytest, ruff, mypy

## Monorepo Layout

```text
apps/
  web/                 Next.js live terminal, legacy scanner route, and Market Detail RC-3
  api-gateway/         Fastify read-only API
services/
  market-ingestor/     Polymarket public-read adapter boundary and fixtures
  pricing-engine/      Python placeholder fair-value contract
  paper-broker/        Placeholder only
  replay-engine/       Placeholder only
  news-signal/         Placeholder only
packages/
  shared-types/        Shared TypeScript contracts
  research-signals/    Fixture-backed technical indicators, confluence, and research signal engine
  ui/                  Local UI primitives
  source-registry/     Source-registry helper package placeholder
  tsconfig/            Shared TypeScript config
docs/
  api/                 Official-source API notes
  adr/                 Architecture decisions
  prd/                 Product scope notes
  runbooks/            Local development and operational notes
```

## Quick Start

Install dependencies:

```bash
make install
```

Start the pricing-engine placeholder service:

```bash
make dev-pricing
```

Start the API gateway in another shell:

```bash
make dev-api
```

Start the web app in another shell:

```bash
make dev-web
```

Open:

```text
http://localhost:3000
```

Minimal terminal local URLs:

```text
http://localhost:3000/
http://localhost:3000/?symbol=ETH&horizon=10m
http://localhost:3000/market-data/live?symbol=BTC&interval=15m
http://localhost:3000/signals/console?symbol=BTC&horizon=5m
http://localhost:3000/?symbol=BTC&horizon=5m&sourceMode=fixture
http://localhost:3000/scanner
```

Default terminal mode is live. It reads public Coinbase Exchange ticker/candles through the
research-signals adapter and fails closed to `NO_SIGNAL` when data is stale, incomplete, or
unavailable. Fixture mode is explicit dev mode and must not be used to fill live chart or ticker
failures. CI/smoke mock packets are labeled `sourceType=mock` / `DEV MOCK`; only real Coinbase
public responses are labeled `sourceType=live`.

Optional local infrastructure:

```bash
make infra-up
make infra-down
```

PostgreSQL and Redis are available for local development but are not wired into the current read-only fixture slice.

Default pricing-engine URL:

```text
http://127.0.0.1:4100
```

The pricing-engine v0 endpoint is a placeholder contract only. It consumes binary outcomes and returns `null` fair probabilities with explicit placeholder metadata.

Pricing-engine v1 currently exists only as a research boundary and validation plan. It is not
implemented and does not compute real fair probabilities. For Up/Down markets, v1 also requires
confirmed target-window payoff specification, reference/start/strike level, settlement value
source, comparator, tie rule, and freshness before implementation.

## Current API

Default API base URL: `http://localhost:4000`

```bash
curl http://localhost:4000/healthz
curl http://localhost:4000/markets
curl http://localhost:4000/markets/polymarket%3Amkt-btc-1h-demo
curl http://localhost:4000/markets/polymarket%3Amkt-btc-1h-demo/book
curl http://localhost:4000/markets/polymarket%3Amkt-btc-1h-demo/detail
curl http://localhost:4000/scanner/top
curl "http://localhost:4000/market-data/live?symbol=BTC"
curl "http://localhost:4000/market-data/live?symbol=ETH"
curl http://localhost:4000/signals/research
curl "http://localhost:4000/signals/research?symbol=BTC&horizon=5m"
curl "http://localhost:4000/signals/research?symbol=BTC&horizon=5m&sourceMode=live"
curl "http://localhost:4000/signals/console?symbol=BTC&horizon=5m"
curl "http://localhost:4000/signals/console?symbol=ETH&horizon=10m&sourceMode=fixture"
curl "http://localhost:4000/signals/console?symbol=BTC&horizon=5m&sourceMode=fixture&profile=balanced"
curl "http://localhost:4000/signals/console?symbol=BTC&horizon=10m&profile=conservative"
curl "http://localhost:4000/signals/console?symbol=BTC&horizon=5m&includeObservationPreview=true"
```

Default pricing-engine base URL: `http://127.0.0.1:4100`

```bash
curl http://127.0.0.1:4100/healthz
```

`POST /v0/fair-value` accepts JSON; see `docs/api/pricing-engine.md` for the request body.

`/scanner/top` is read-only and returns explicit pricing-engine v0 placeholder `fairValue` and `tradeCandidate` fields plus scanner metadata such as rejected count, fail-closed summary, and uncertainty. It does not compute a real fair probability or model edge.

`/markets/:id/detail` is read-only and returns a contract-backed `MarketDetailResponse` that organizes normalized market data, fixture-backed book data when available, placeholder pricing, related fixture markets, token trace, source trace, evidence trail, and open evidence gaps. It does not add new vendor access or pricing logic.

The current scanner/detail API contract version is `ept-api-v1`. Successful scanner/detail
responses expose a stable `meta` block with contract version, response kind, generated timestamp,
read-only/fixture/placeholder flags, and status. Typed error responses use the same contract
version and currently cover `market_not_found`.

`/signals/research` returns `ResearchSignal` objects for BTC/ETH 5m/10m research bias. Fixture mode
is the default. `sourceMode=live` explicitly uses Coinbase Exchange public candles with timeout,
safe parsing, incomplete-candle filtering, freshness checks, and fail-closed `NO_SIGNAL` behavior.
Directions are limited to `LONG`, `SHORT`, and `NO_SIGNAL`; they are explicitly research-only and
`isTradeAdvice: false`.

`/market-data/live` returns Coinbase Exchange public ticker and candle fields for `BTC` or `ETH`.
It supports `interval=1m|5m|15m|1h`, maps directly to Coinbase granularities `60|300|900|3600`,
includes source provenance, latest price, bid/ask, ticker time/freshness, candle count, latest
candle time/freshness, warnings, and fail-closed reasons. It uses no API key, wallet, private
endpoint, or account data.

`/signals/console` returns one `EventSignalConsoleResponse` for BTC/ETH 5m/10m and defaults to
`sourceMode=live`. It includes the current research signal, active research profile, confluence
scores, risk filters, event window, observation candidate, recent live candles, recent-only markers
capped at 10, warnings, and an on-demand Observation Preview. `sourceMode=fixture` is explicit dev
mode. `profile=balanced|conservative|aggressive` changes research thresholds only. It does not
return trade instructions, leverage, position size, order fields, or a real performance claim.

## Current Pages

- `/`: RC-14 real-data-first prediction terminal
  - BTC/ETH and 5m/10m controls
  - LIVE status, latest public ticker price, ticker freshness, candle freshness, and manual refresh
  - main candlestick chart from live candles only in live mode
  - compact prediction card with direction, confidence, score, reference/current price, distance,
    resolve time, top reasons, and veto/no-trade reasons
  - compact confluence, risk/no-trade, and observation summaries
  - collapsed Advanced drawer for fixture dev mode, old scanner link, diagnostics, and warnings
- `/scanner`: legacy Markets Scanner RC-2, moved out of the homepage first screen
- `/market-data/live`: Coinbase Exchange public ticker and real candle terminal with BTC/ETH and
  `1m`/`5m`/`15m`/`1h` controls
- `/signals/console`: live-default research signal console with experimental model labels and no
  trading action
- `/markets/:id`: Market Detail RC-3
  - binary outcomes, timing, liquidity, spread, and provenance
  - fixture-backed order-book snapshot when available
  - API-backed research readiness, token trace, source trace, related fixture markets
  - explicit placeholder pricing panel and open evidence gaps

No replay workflow, paper trading UI, or trading control exists. The RC-14 candlestick chart uses
real candles in live mode and does not load full historical signal markers.

## Local Workbench FAQ

- The workbench is research-only and not trade advice. It never returns or displays buy/sell,
  entry, leverage, position size, order placement, wallet, or private/authenticated controls.
- Signal markers are capped to recent markers from `/signals/console` and are not a replay of all
  historical signals.
- Observation Preview is collapsed by default. Open it only when needed; it is a small-sample
  directional check, not a backtest, predictive guarantee, or real trading performance.
- Manual refresh is display fetching only. Coinbase documents WebSocket feeds for realtime updates;
  this app does not high-frequency poll REST ticker/candles.
- The homepage observation area is a compact current-window summary. Larger local feedback tools
  are kept out of the default first screen.
- If live mode shows `NO_SIGNAL`, inspect warnings and fail-closed reasons first. Fixture mode is an
  explicit dev path, not the default terminal data path.

## Development Workflow

Before adding or changing any external market adapter:

1. Update `docs/source_registry.md`.
2. Update the relevant `docs/api/*.md` file.
3. Capture or update fixtures before relying on runtime schemas.
4. Keep business code behind an adapter boundary.
5. Mark every unconfirmed field, schema, or classification rule as `TODO`.

Default checks:

```bash
npx --yes pnpm@10.0.0 typecheck
npx --yes pnpm@10.0.0 build
make test
make lint-python
```

Browser smoke checks:

```bash
make install-smoke-browsers
make smoke
```

The smoke suite starts the API gateway and web app with deterministic mocked Coinbase packets, then
checks that the homepage, `/market-data/live`, and `/signals/console` mark those packets as
`DEV MOCK`, plus the moved `/scanner` route and one deterministic Market Detail URL. It does not
call live vendors, compute real pricing, or test trading behavior.

API contract snapshots are part of `make test`. They lock stable fixture-backed projections for
`/scanner/top`, `/markets/:id/detail`, `/signals/research`, and `/signals/console` under
`apps/api-gateway/tests/snapshots/`. Snapshot changes
should be reviewed as public local API contract changes, not incidental formatting churn.

## Documentation

- Local development: `docs/runbooks/local-dev.md`
- Codex handoff: `docs/runbooks/codex-handoff.md`
- RC-6 prompt: `docs/prompts/rc6-openapi-like-contract-publication.md`
- Troubleshooting: `docs/runbooks/troubleshooting.md`
- Architecture: `docs/architecture.md`
- Phase 1 scope: `docs/prd/phase1.md`
- API gateway contract: `docs/api/api-gateway.md`
- EPT API v1 local contract: `docs/api/ept-api-v1-local-contract.md`
- Research signals API: `docs/api/research-signals.md`
- Event Signal Console API: `docs/api/event-signal-console.md`
- Polymarket notes: `docs/api/polymarket.md`
- Pricing-engine v0 contract: `docs/api/pricing-engine.md`
- Pricing-engine v1 research: `docs/api/pricing-engine-v1-research.md`
- Pricing research plan: `research/reports/pricing-engine-v1-research-plan.md`
- RC-1 product research: `research/reports/rc1-product-research.md`
- RC-2 evidence-first UX research: `research/reports/rc2-evidence-first-ux-research.md`
- Fixture capture plan: `docs/runbooks/polymarket-fixture-capture.md`
- RC-1 read-only UI decision: `docs/adr/0006-rc1-read-only-research-ui.md`
- RC-2 evidence-first UX decision: `docs/adr/0007-rc2-evidence-first-ux.md`
- RC-3 market detail contract decision: `docs/adr/0008-rc3-market-detail-contract.md`
- RC-4 API contract snapshot decision: `docs/adr/0009-rc4-api-contract-snapshots-and-ci-hygiene.md`
- RC-5 response versioning decision: `docs/adr/0010-rc5-response-versioning-and-error-taxonomy.md`
- RC-7 research signal decision: `docs/adr/0012-rc7-research-signal-engine-v0.md`
- RC-8 live OHLCV adapter decision: `docs/adr/0013-rc8-live-ohlcv-source-adapter.md`
- RC-9 event signal console decision: `docs/adr/0014-rc9-event-signal-console-and-confluence-engine.md`
- RC-11 signal runtime decision: `docs/adr/0015-rc11-signal-runtime-and-tuning.md`
- RC-12 reality observation decision: `docs/adr/0016-rc12-reality-observation-and-strategy-tuning.md`
- RC-13 real data first terminal decision: `docs/adr/0017-rc13-real-data-first-terminal.md`
- RC-14 real data integrity decision: `docs/adr/0018-rc14-real-data-integrity.md`
- Source registry: `docs/source_registry.md`
- Collaboration rules: `AGENTS.md`

## License

MIT. See `LICENSE`.
