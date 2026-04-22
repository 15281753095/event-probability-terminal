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
curl http://localhost:4000/scanner/top
```

## Start Web

Start the API gateway first if you want the scanner table to load fixture-backed data.

```bash
make dev-web
```

Default URL:

```text
http://localhost:3000
```

The current page is `/`, the Markets Scanner v0.

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

## Validation

Fast local checks:

```bash
make typecheck
make test
make lint
```

Full build:

```bash
make build
```

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
- TODO: No paper broker, replay, or real pricing model implementation.

## Related Runbooks

- Troubleshooting: `docs/runbooks/troubleshooting.md`
- GitHub publishing: `docs/runbooks/github-publish.md`
- Polymarket fixture capture: `docs/runbooks/polymarket-fixture-capture.md`
