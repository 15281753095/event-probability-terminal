# Codex Handoff

Status: current after RC-5. Use this document to resume the next Codex thread without relying on
prior chat context.

## Project Positioning

Event Probability Terminal is a read-only research terminal for BTC/ETH prediction-market event
contracts. Phase 1 starts with Polymarket public market data and keeps all runtime behavior
fixture-first unless a live public fixture capture is explicitly approved.

The project is not a trading bot. The current product surface is a local scanner and market-detail
research workflow that makes inputs, evidence, placeholder status, assumptions, and limits visible.

## Current Technology Stack

- Web: Next.js, React, TypeScript, Tailwind, local shadcn-style UI primitives.
- API gateway: Node.js, TypeScript, Fastify.
- Market ingestion: TypeScript adapter boundary with fixture-first Polymarket public-read tests.
- Shared contracts: TypeScript package under `packages/shared-types`.
- Pricing shell: Python 3.11+ placeholder service with pandas, polars, numpy, scipy, statsmodels.
- Infrastructure: PostgreSQL and Redis through Docker Compose, not wired into the current slice.
- Tooling: pnpm, Node test runner, Playwright smoke tests, pytest, ruff, mypy, GitHub Actions CI.

## Completed Milestones

### RC-0 Initialization And GitHub Publication

- Monorepo layout established for `apps`, `services`, `packages`, `docs`, `infra`, and `research`.
- Fastify API gateway, Next.js web app, Python pricing shell, and shared TypeScript contracts were
  initialized.
- GitHub publication and CI foundation were added.

### Binary Outcomes Contract

- `EventMarket` uses `outcomeType: "binary"` with `outcomes.primary` and `outcomes.secondary`.
- Upstream labels such as `Yes`/`No` and observed `Up`/`Down` are preserved as labels only.
- The contract does not infer payoff direction, strategy side, or pricing semantics from label
  text.

### Pricing-Engine v0 Placeholder

- Pricing-engine v0 defines a placeholder HTTP contract with `GET /healthz` and
  `POST /v0/fair-value`.
- Fair probabilities, confidence, and edge remain `null` with explicit placeholder metadata.
- The API gateway preserves the same placeholder shape through a local fallback when the pricing
  service is unavailable.

### Pricing-Engine v1 Research Boundary

- v1 is research-only. It may not replace placeholder output until data source, freshness, payoff,
  and validation gates are documented and satisfied.
- Required future validation includes calibration evaluation, Brier score, log loss, reliability
  buckets, sample-window rules, and replay/backtest protocol.

### Up/Down Payoff Research Boundary

- Observed 5M Chainlink Up/Down payoff evidence is documented, but it does not unlock BTC/ETH
  10m/1h runtime extraction or non-placeholder pricing.
- Up/Down labels alone are not a payoff specification.
- Future non-placeholder pricing must fail closed until reference level, settlement level, source,
  comparator, and tie rule are confirmed for the accepted target family.

### RC-1 Read-Only Scanner/Detail

- Added read-only scanner filtering/sorting and initial market-detail inspection.
- Added scanner metadata for placeholder pricing, rejected count, rejection summary, and
  uncertainty.
- No live vendor expansion, pricing model, paper broker, replay, or trading workflow was added.

### RC-2 Evidence-First UX

- Added URL-persisted scanner query state.
- Added scanner research status strip and fail-closed reason matrix.
- Organized Market Detail evidence with research readiness, token trace, source trace, evidence
  trail, open gaps, and related fixture markets.

### RC-3 Market Detail Contract

- Added shared `MarketDetailResponse`.
- Added `GET /markets/:id/detail` as the single contract-backed payload for the Market Detail page.
- The page no longer assembles core research sections from several API calls.

### RC-4 API Snapshots And CI Hygiene

- Added fixture-backed snapshots for:
  - `GET /scanner/top`
  - `GET /markets/:id/detail`
- Snapshot tests use fixture mode, a fixed clock, and deterministic unavailable pricing-engine
  behavior.
- CI action versions were refreshed for cleaner GitHub Actions runtime behavior.

### RC-5 ept-api-v1 Response Contract Governance

- Added `API_CONTRACT_VERSION = "ept-api-v1"`.
- Added stable successful response metadata for scanner/detail responses.
- Added typed error response shape and taxonomy.
- Web UI consumes and displays the response contract version in scanner/detail workflows.

## Current API Contract

Default local API base URL:

```text
http://localhost:4000
```

### `GET /scanner/top`

- Returns `ScannerTopResponse`.
- Current response kind: `scanner_top`.
- Uses `meta.contractVersion: "ept-api-v1"`.
- Returns fixture-backed candidates with normalized binary `EventMarket`, placeholder
  `fairValue`, placeholder `tradeCandidate`, and scanner metadata.
- `fairValue.fairProbabilityByOutcome.*.probability`, `confidence`, and
  `tradeCandidate.edge` are placeholders and must remain non-claims of real pricing.

### `GET /markets/:id/detail`

- Returns `MarketDetailResponse`.
- Current response kind: `market_detail`.
- Uses `meta.contractVersion: "ept-api-v1"`.
- Organizes normalized market data, optional placeholder scanner candidate, optional fixture-backed
  book, research readiness, token trace, source trace, evidence trail, open gaps, related fixture
  markets, and read-only placeholder metadata.

### `ept-api-v1`

Successful scanner/detail responses expose:

- `contractVersion`
- `responseKind`
- `generatedAt`
- `status: "ok"`
- `source: "polymarket"`
- `mode`
- `isFixtureBacked`
- `isReadOnly: true`
- `isPlaceholderPricing: true`
- `message`

### Typed Error Taxonomy

Shared taxonomy:

- Status values: `ok`, `not_found`, `unsupported`, `fail_closed`.
- Error codes: `market_not_found`, `unsupported_market`, `out_of_scope`.

Currently implemented typed error:

- `market_not_found` from `GET /markets/:id/detail` for ids absent from the current adapter result
  set, with optional `supportedIds`.

## Current CI And Tests

- Unit tests cover adapter normalization, pricing fallback/client behavior, scanner metadata, and
  market-detail contract shaping.
- API snapshots live under `apps/api-gateway/tests/snapshots/` and lock the stable fixture-backed
  projections for `/scanner/top` and `/markets/:id/detail`.
- Playwright smoke tests cover the scanner home page and one deterministic Market Detail URL
  through `/markets/:id/detail`.
- The latest checked GitHub Actions runs on `main` were green as of the handoff recovery check.

For documentation-only changes, `git diff --check` is usually enough. Run broader tests only when
API behavior, snapshots, web rendering, or shared contracts change.

## Current Prohibitions

- Do not implement real-money trading, order placement, cancellation, settlement, wallet funding,
  withdrawal, or trading automation.
- Do not implement private/authenticated vendor APIs.
- Do not implement Predict.fun or Binance adapters.
- Do not implement replay or paper broker workflows.
- Do not implement a real pricing model or non-placeholder fair probabilities.
- Do not infer external API fields, endpoint paths, auth headers, signatures, pagination, or
  schemas.
- Do not capture live fixtures or make public network calls without explicit approval.
- Do not expand the Polymarket adapter beyond approved public read paths without re-approval and
  source documentation updates.

## Current Next Step

RC-6 OpenAPI-like local contract publication.

The next slice should publish a lightweight local contract document for:

- `GET /scanner/top`
- `GET /markets/:id/detail`

It should document success examples, typed error examples, response versioning, placeholder
semantics, and fail-closed taxonomy. Examples should stay as close as practical to the existing API
snapshots. A lightweight consistency check may be added if it stays local and does not alter API
behavior or snapshots.

## How A New Codex Thread Should Resume

1. Start in research mode and read `AGENTS.md`, `README.md`, this handoff, and
   `docs/prompts/rc6-openapi-like-contract-publication.md`.
2. Confirm repository state with:
   - `git status --short --branch`
   - `git log --oneline --decorate -8`
   - `gh run list --branch main --limit 5`
3. Inspect the current contract sources before editing:
   - `docs/api/api-gateway.md`
   - `docs/adr/0010-rc5-response-versioning-and-error-taxonomy.md`
   - `packages/shared-types/src/index.ts`
   - `apps/api-gateway/tests/snapshots/scanner-top.fixture.json`
   - `apps/api-gateway/tests/snapshots/market-detail-btc-1h.fixture.json`
4. Implement only the RC-6 documentation slice. Do not run live vendor calls and do not change API
   behavior.
5. Validate at minimum with `git diff --check`. Add a small local consistency check only if the
   implementation includes one.
6. Commit and push a small, reviewable documentation change.
