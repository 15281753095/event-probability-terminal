# Event Probability Terminal

Read-only research terminal for BTC/ETH prediction-market event contracts, starting with Polymarket public market data.

## Current Status

This repository is in Phase 1 foundation work. It has a minimal local end-to-end read-only slice:

- `services/market-ingestor`: Polymarket public-read adapter boundary, fixture-first by default.
- `packages/shared-types`: first shared contracts for `EventMarket`, `OrderBookSnapshot`, and placeholder scanner/pricing objects.
- `apps/api-gateway`: Fastify read-only API for fixture-backed markets and pricing placeholders.
- `apps/web`: Next.js Markets Scanner v0 that reads from the API gateway.
- `services/pricing-engine`: Python placeholder contract for fair-value output shape.

The current app market data is synthetic fixture data unless explicitly configured otherwise. A limited Polymarket Gamma/public-search live fixture capture was completed on 2026-04-21 to tighten contract tests, but it did not confirm BTC/ETH 10m/1h live classification.
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
- Market contract: binary outcome markets only. The shared contract preserves upstream outcome labels, including fixture-backed `Yes`/`No` and observed `Up`/`Down`; it does not support multi-outcome markets.

Explicit exclusions:

- No real-money order placement, cancellation, settlement, wallet funding, withdrawal, or trading automation.
- No private/authenticated Polymarket adapter.
- No Predict.fun or Binance Wallet adapter.
- No real pricing model, paper broker, replay engine, or news-signal business implementation.
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
  web/                 Next.js Markets Scanner v0
  api-gateway/         Fastify read-only API
services/
  market-ingestor/     Polymarket public-read adapter boundary and fixtures
  pricing-engine/      Python placeholder fair-value contract
  paper-broker/        Placeholder only
  replay-engine/       Placeholder only
  news-signal/         Placeholder only
packages/
  shared-types/        Shared TypeScript contracts
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
curl http://localhost:4000/scanner/top
```

Default pricing-engine base URL: `http://127.0.0.1:4100`

```bash
curl http://127.0.0.1:4100/healthz
```

`POST /v0/fair-value` accepts JSON; see `docs/api/pricing-engine.md` for the request body.

`/scanner/top` is read-only and returns explicit pricing-engine v0 placeholder `fairValue` and `tradeCandidate` fields. It does not compute a real fair probability or model edge.

## Current Page

- `/`: Markets Scanner v0
  - left filter summary
  - market list for BTC/ETH fixture markets
  - right summary panels
  - loading/error/empty states through server-side API fetch handling

No Market Detail page, charting workflow, replay workflow, or paper trading UI exists yet.

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

## Documentation

- Local development: `docs/runbooks/local-dev.md`
- Troubleshooting: `docs/runbooks/troubleshooting.md`
- Architecture: `docs/architecture.md`
- Phase 1 scope: `docs/prd/phase1.md`
- Polymarket notes: `docs/api/polymarket.md`
- Pricing-engine v0 contract: `docs/api/pricing-engine.md`
- Pricing-engine v1 research: `docs/api/pricing-engine-v1-research.md`
- Pricing research plan: `research/reports/pricing-engine-v1-research-plan.md`
- Fixture capture plan: `docs/runbooks/polymarket-fixture-capture.md`
- Source registry: `docs/source_registry.md`
- Collaboration rules: `AGENTS.md`

## License

MIT. See `LICENSE`.
