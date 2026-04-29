# Local Development Runbook

## Prerequisites

- Node.js with `npx` available.
- Python 3.11 or newer.
- Docker and Docker Compose, only if starting PostgreSQL or Redis.

## Install Dependencies

```bash
make install
```

Equivalent commands:

```bash
npx --yes pnpm@10.0.0 install
python -m venv .venv
.venv/bin/pip install -e ".[dev]"
```

If the host exposes `python3` but not `python`, use `python3 -m venv .venv` for the same local
environment.

## Environment

Copy `.env.example` only if you need local overrides:

```bash
cp .env.example .env
```

Default fixture mode:

```text
POLYMARKET_USE_FIXTURES=true
```

Do not set `POLYMARKET_USE_FIXTURES=false` unless live public fixture work has been explicitly approved and the current task requires it.

## Start Local Infrastructure

PostgreSQL and Redis are defined for local development:

```bash
make infra-up
```

Stop them:

```bash
make infra-down
```

Important current status:

- PostgreSQL is not used by the current fixture-backed read-only flow.
- Redis is not used by the current fixture-backed read-only flow.
- `make infra-up` may pull Docker images on a fresh machine.

## Start API Gateway

Start the pricing-engine placeholder service first if you want `/scanner/top` to call it instead of using the API gateway fallback placeholder.

```bash
make dev-api
```

Default URL:

```text
http://localhost:4000
```

Health check:

```bash
curl http://localhost:4000/healthz
```

Current read-only endpoints:

```bash
curl http://localhost:4000/markets
curl http://localhost:4000/markets/polymarket%3Amkt-btc-1h-demo
curl http://localhost:4000/markets/polymarket%3Amkt-btc-1h-demo/book
curl http://localhost:4000/markets/polymarket%3Amkt-btc-1h-demo/detail
curl http://localhost:4000/scanner/top
curl http://localhost:4000/signals/research
curl "http://localhost:4000/signals/research?symbol=BTC&horizon=5m"
curl "http://localhost:4000/signals/research?symbol=BTC&horizon=5m&sourceMode=live"
curl "http://localhost:4000/signals/console?symbol=BTC&horizon=5m"
curl "http://localhost:4000/signals/console?symbol=ETH&horizon=10m&sourceMode=fixture"
curl "http://localhost:4000/signals/console?symbol=BTC&horizon=5m&sourceMode=live"
curl "http://localhost:4000/signals/console?symbol=BTC&horizon=5m&includeBacktest=true"
```

Research signals are fixture-backed by default. `sourceMode=live` explicitly uses Coinbase Exchange
public candles through the research-signals adapter boundary. It does not use API keys,
Authorization headers, wallet state, X, news, macro, or trading APIs. Coinbase historical rates may
be incomplete and should not be polled frequently, so this live path is for local manual smoke only.

Event Signal Console is also fixture-backed by default. It returns recent candles and recent-only
markers, not full-history marker overlays. The lightweight backtest preview is disabled unless
`includeBacktest=true` is explicitly requested.

## Start Web

Start the API gateway first if you want the scanner table to load fixture-backed data.

```bash
make dev-web
```

Default URL:

```text
http://localhost:3000
```

Current pages:

- `/`: Markets Scanner RC-2 with read-only filters, query state, sorting, summary cards, evidence
  status, the Research Signal Panel with Fixture/Live source-mode display, and Event Signal
  Workbench RC-10 with a top signal hero, BTC/ETH and 5m/10m controls, fixture/live source selector,
  refresh control, confluence cards, risk filters, recent chart markers, and on-demand backtest
  preview.
- `/markets/:id`: Market Detail RC-3 for a normalized fixture-backed market, backed by `GET /markets/:id/detail`.

Example detail URL:

```text
http://localhost:3000/markets/polymarket%3Amkt-btc-1h-demo
```

Workbench trial URLs:

```text
http://localhost:3000/?consoleSymbol=BTC&consoleHorizon=5m&consoleSourceMode=fixture
http://localhost:3000/?consoleSymbol=ETH&consoleHorizon=10m&consoleSourceMode=fixture
http://localhost:3000/?consoleSymbol=BTC&consoleHorizon=5m&consoleSourceMode=live
http://localhost:3000/?consoleSymbol=BTC&consoleHorizon=5m&consoleSourceMode=fixture&consoleBacktest=1
```

Use fixture URLs for repeatable local checks. Use live URLs only for explicit manual inspection of
public Coinbase Exchange candles; live failures fail closed and do not imply a trading signal.

## Start Pricing Engine Placeholder Service

```bash
make dev-pricing
```

Default URL:

```text
http://127.0.0.1:4100
```

Health check:

```bash
curl http://127.0.0.1:4100/healthz
```

Expected health shape:

```json
{"mode": "placeholder", "modelVersion": "pricing-engine-v0-placeholder", "ok": true, "service": "pricing-engine"}
```

Placeholder quote endpoint:

```bash
curl -fsS http://localhost:4000/scanner/top
```

`/scanner/top` calls `POST /v0/fair-value` through the API gateway when pricing-engine is running. If pricing-engine is unavailable, the API gateway returns the same placeholder response shape with `meta.pricing` set to `local-placeholder-fallback`.

The pricing-engine v0 service does not compute fair probability, confidence, edge, or trade recommendations. It only proves the contract shape for binary outcomes.

Pricing-engine v1 is not implemented. Its current materials are research documents only:

- `docs/api/pricing-engine-v1-research.md`
- `research/reports/pricing-engine-v1-research-plan.md`

## Validation

Fast local checks:

```bash
make typecheck
make test
make lint
```

`make test` includes fixture-backed API contract snapshots for:

- `GET /scanner/top`
- `GET /markets/:id/detail`
- `GET /signals/research`
- `GET /signals/console`

It also includes mocked Coinbase Exchange adapter coverage for live `sourceMode=live`. CI must not
call live Coinbase endpoints.

Treat snapshot diffs as API contract diffs. Update them only when the shared/API response contract
intentionally changes.

Current scanner/detail contract version:

```text
ept-api-v1
```

When testing consumers manually, check that successful scanner/detail/signal responses include
`meta.contractVersion`, `meta.responseKind`, `meta.status`, and explicit read-only/fixture/
placeholder flags. Research signal responses also include `isResearchOnly: true` and
`isTradeAdvice: false`. Typed not-found or out-of-scope responses include `contractVersion`,
`status`, `error`, `message`, and `generatedAt`.

Full build:

```bash
make build
```

Browser smoke checks:

```bash
make install-smoke-browsers
make smoke
```

Current smoke coverage is intentionally small:

- `/` must render the Markets Scanner RC-2, read-only filters, query URL state, placeholder pricing
  text, evidence/fail-closed matrix, Research Signal Panel, Event Signal Workbench, controls, signal
  hero, confluence cards, recent chart, default-collapsed backtest drawer, and backtest preview
  after user action.
- `/markets/polymarket%3Amkt-btc-1h-demo` must render Market Detail RC-3 with outcomes, research
  readiness, token trace, source trace, related fixture markets, provenance, placeholder pricing,
  and open evidence gaps.

The smoke suite starts the API gateway and web app with fixture-backed data. It does not use live
vendor data, real pricing, CLOB expansion, paper trading, replay, or any authenticated endpoint.
The visible Live selector on the web page is not exercised against the real network in smoke.

Root package equivalent:

```bash
npx --yes pnpm@10.0.0 check
```

## Current Limitations

- TODO: Polymarket adapter defaults to synthetic local fixtures.
- TODO: Live Polymarket public-read mode has no approved BTC/ETH 10m/1h classification fixture yet and must fail closed where classification is missing.
- TODO: PostgreSQL has no schema and is not used by the current app flow.
- TODO: Redis is not used by the current app flow.
- TODO: Scanner fair probability, confidence, and edge are placeholders.
- TODO: Research signals are fixture-default and live-optional research outputs, not trade advice.
- TODO: Coinbase Exchange live OHLCV has no cache layer; use explicit local manual requests only.
- TODO: Event Signal Console backtest preview is small-sample and on-demand only; it is not a
  predictive guarantee or real trading performance.
- TODO: Pricing-engine v1 data freshness and calibration requirements are not implemented.
- TODO: No paper broker, replay, or real pricing model implementation.

## Common Local Issues

- API data is missing on the web page: start `make dev-api` before `make dev-web`, then reload
  `http://localhost:3000`.
- Live source mode returns `NO_SIGNAL`: check warnings and fail-closed reasons. Live mode is allowed
  to fail closed when Coinbase candles are stale, incomplete, unreachable, or outside supported
  BTC/ETH 5m/10m scope.
- Backtest preview is hidden: this is the default. Click `Show backtest preview` or add
  `consoleBacktest=1` to the local URL.
- Chart has no candles: verify `GET /signals/console` returns `recentCandles`; otherwise use
  fixture mode while investigating local API availability.
- Trading controls are absent by design. The project does not implement order placement, wallets,
  private/auth endpoints, position sizing, leverage, paper broker, or full replay workflows.

## Related Runbooks

- Troubleshooting: `docs/runbooks/troubleshooting.md`
- GitHub publishing: `docs/runbooks/github-publish.md`
- Polymarket fixture capture: `docs/runbooks/polymarket-fixture-capture.md`
