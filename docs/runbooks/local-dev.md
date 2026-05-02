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

Research signals are fixture-backed by default. `sourceMode=live` explicitly uses Coinbase Exchange
public candles through the research-signals adapter boundary. It does not use API keys,
Authorization headers, wallet state, X, news, macro, or trading APIs. Coinbase historical rates may
be incomplete and should not be polled frequently, so this live path is for local manual smoke only.

Event Signal Console defaults to live Coinbase Exchange public ticker/candles. It returns recent
candles and recent-only markers capped at 10, not full-history marker overlays. Fixture mode is an
explicit dev path via `sourceMode=fixture`; it must not fill live ticker or chart failures.
Observation Preview is disabled unless `includeObservationPreview=true` is explicitly requested.

## Start Web

Start the API gateway first so the terminal can load live market data.

```bash
make dev-web
```

Default URL:

```text
http://localhost:3000
```

Current pages:

- `/`: RC-13 minimal live prediction terminal with BTC/ETH and 5m/10m controls, LIVE status,
  latest public ticker price, freshness, live candlestick chart, compact prediction card,
  confluence/risk/observation summaries, manual refresh, and collapsed Advanced drawer.
- `/scanner`: legacy Markets Scanner RC-2, moved out of the homepage first screen.
- `/markets/:id`: Market Detail RC-3 for a normalized fixture-backed market, backed by `GET /markets/:id/detail`.

Example detail URL:

```text
http://localhost:3000/markets/polymarket%3Amkt-btc-1h-demo
```

Terminal trial URLs:

```text
http://localhost:3000/
http://localhost:3000/?symbol=ETH&horizon=10m
http://localhost:3000/?symbol=BTC&horizon=5m&sourceMode=fixture
http://localhost:3000/scanner
```

Default terminal URLs use live Coinbase Exchange public ticker/candles. Use fixture URLs only for
explicit dev checks. Live failures fail closed to `NO_SIGNAL` and do not imply a trading signal.
Manual refresh is display fetching only and should not be used as high-frequency polling.

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

- `/` must render the minimal live prediction terminal with LIVE badge, latest price, 5m/10m and
  BTC/ETH controls, chart, prediction card, compact confluence/risk/observation summaries, and a
  collapsed Advanced drawer. The old scanner must not appear on the homepage.
- `/scanner` must render the legacy fixture-backed scanner route.
- `/markets/polymarket%3Amkt-btc-1h-demo` must render Market Detail RC-3 with outcomes, research
  readiness, token trace, source trace, related fixture markets, provenance, placeholder pricing,
  and open evidence gaps.

The smoke suite starts the API gateway and web app with mocked Coinbase live market data. It does
not use live vendor data, real pricing, CLOB expansion, paper trading, replay, or any authenticated
endpoint.

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
- TODO: `/signals/research` remains fixture-default; `/signals/console` and the homepage are
  live-first research outputs, not trade advice.
- TODO: Coinbase Exchange live ticker/candles have no cache layer; use explicit local manual
  requests only and avoid high-frequency REST polling.
- TODO: Event Signal Console Observation Preview is small-sample and on-demand only; it is not a
  predictive guarantee, backtest, or real trading performance.
- TODO: Pricing-engine v1 data freshness and calibration requirements are not implemented.
- TODO: No paper broker, replay, or real pricing model implementation.

## Common Local Issues

- API data is missing on the web page: start `make dev-api` before `make dev-web`, then reload
  `http://localhost:3000`.
- Live source mode returns `NO_SIGNAL`: check warnings and fail-closed reasons. Live mode is allowed
  to fail closed when Coinbase candles are stale, incomplete, unreachable, or outside supported
  BTC/ETH 5m/10m scope.
- Advanced data is hidden: this is the default. Open the Advanced drawer for fixture mode, legacy
  scanner access, and diagnostics.
- Chart has no candles: verify `GET /market-data/live` and `GET /signals/console` return live
  candles. Do not use fixture candles to fill a live chart failure.
- Trading controls are absent by design. The project does not implement order placement, wallets,
  private/auth endpoints, position sizing, leverage, paper broker, or full replay workflows.

## Related Runbooks

- Troubleshooting: `docs/runbooks/troubleshooting.md`
- GitHub publishing: `docs/runbooks/github-publish.md`
- Polymarket fixture capture: `docs/runbooks/polymarket-fixture-capture.md`
