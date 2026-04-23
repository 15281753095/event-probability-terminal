# Troubleshooting

## `make install` Fails

Check that Node.js, Python, and `npx` are available:

```bash
node --version
python --version
npx --version
```

If Python creates a virtual environment with a newer interpreter than CI, that is acceptable as long as tests and type checks pass locally. CI uses Python 3.11.

## Web Page Shows API Unavailable

Start the API gateway first:

```bash
make dev-api
```

Then verify:

```bash
curl http://localhost:4000/healthz
curl http://localhost:4000/markets
```

If the API runs on a non-default port, update `NEXT_PUBLIC_API_BASE_URL`.

## Port Already In Use

Use a different port:

```bash
WEB_PORT=3001 make dev-web
API_GATEWAY_PORT=4001 make dev-api
```

For the web app to call a non-default API port:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4001 WEB_PORT=3001 make dev-web
```

## Docker Images Are Missing

`make infra-up` can pull `postgres:16-alpine` and `redis:7-alpine` on first use. Run it only when Docker access and image pulls are acceptable.

The current fixture-backed app can run without PostgreSQL and Redis.

## Empty Market List

Default fixture mode should return synthetic BTC/ETH fixture markets:

```bash
curl http://localhost:4000/markets
```

If `POLYMARKET_USE_FIXTURES=false`, live classification may fail closed because BTC/ETH and 10m/1h identification has not been confirmed by approved public fixtures.

## Python Checks Cannot Import `pricing_engine`

Install the editable Python package:

```bash
.venv/bin/pip install -e ".[dev]"
```

Or set `PYTHONPATH` explicitly:

```bash
PYTHONPATH=services/pricing-engine/src .venv/bin/python -m pytest services/pricing-engine/tests
```

## Fixture Capture

Do not run live Polymarket fixture capture without explicit approval. Use `docs/runbooks/polymarket-fixture-capture.md` for the approved command list and storage rules.

## Playwright Smoke Tests Fail Before Launching Chromium

Install the Chromium browser used by the smoke suite:

```bash
make install-smoke-browsers
```

Then rerun:

```bash
make smoke
```

The smoke suite starts the local API gateway on `4000` and the web app on `3000`. If either port is
already occupied by an unrelated process, stop that process before rerunning. These tests are
fixture-backed and should not require live vendor network access.
