# Polymarket Fixtures

## Current Fixture

`local-discovery.json` is synthetic and exists only for local contract tests and fixture-backed UI/API smoke tests.

It is not proof of live Polymarket BTC/ETH or 10m/1h classification.

`live-public-gamma-samples.json` is a promoted, reviewed subset of approved public Gamma/public-search captures from 2026-04-21. It confirms selected runtime field shapes, but it does not confirm BTC/ETH 10m/1h classification.

`live-target-discovery-samples.json` is a promoted, reviewed subset of approved target-discovery captures from 2026-04-22. It confirms BTC/ETH short-window Up/Down family evidence for `5M`, a closed Bitcoin `1H` sample, and absence of observed `10m` target hits in the approved request set. It does not open live BTC/ETH 10m/1h classification.

## Live Public Fixtures

Live public fixtures must be captured only after explicit approval. Use:

- `docs/runbooks/polymarket-fixture-capture.md`

Temporary raw captures belong in:

```text
services/market-ingestor/fixtures/polymarket/live-capture-tmp/
```

Reviewed fixtures can be promoted into tracked JSON files only after redaction and metadata review.

## Rules

- No API keys, cookies, auth headers, signatures, wallet data, or private credentials.
- Keep raw public IDs, token IDs, condition IDs, prices, sizes, and timestamps only when needed for contract tests.
- Mark classification as `TODO` unless BTC/ETH and 10m/1h evidence is explicit and documented.
- Adapter tests must fail closed when classification or token mapping is ambiguous.
