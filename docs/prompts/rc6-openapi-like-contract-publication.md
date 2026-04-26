# RC-6 OpenAPI-like Local Contract Publication Prompt

Copy this whole prompt into a new Codex thread from the repository root:

```text
You are working in:

/Users/wenwei/program/projects/event-probability-terminal

Task:

Implement only RC-6: OpenAPI-like local contract publication.

Do not implement new product features.
Do not change API behavior.
Do not change snapshots unless there is an explicit, documented contract reason and I approve it.
Do not change pages.
Do not capture new fixtures.
Do not make external network research calls.
Do not implement real pricing, trading, a new venue, replay, or paper broker.

Repository rules:

- Read `AGENTS.md` first.
- Start in research mode before implementation mode.
- Prefer existing repo contracts, ADRs, snapshots, and official-source notes already in the repo.
- Every unconfirmed interface detail, schema, behavior, or assumption must be marked `TODO`.
- Business logic must not call vendor APIs directly.
- Phase 1 forbids real-money automated trading.
- Model output must remain explainable: show inputs, assumptions, method, and limits.

Initial recovery checks:

1. Run and report:
   - `git status --short --branch`
   - `git log --oneline --decorate -8`
   - `gh run list --branch main --limit 5`
2. Confirm these files exist and read the relevant sections:
   - `README.md`
   - `AGENTS.md`
   - `docs/runbooks/codex-handoff.md`
   - `docs/api/api-gateway.md`
   - `docs/adr/0010-rc5-response-versioning-and-error-taxonomy.md`
   - `packages/shared-types/src/index.ts`
   - `apps/api-gateway/tests/api-snapshots.test.ts`
   - `apps/api-gateway/tests/snapshots/scanner-top.fixture.json`
   - `apps/api-gateway/tests/snapshots/market-detail-btc-1h.fixture.json`

Goal:

Publish a lightweight OpenAPI-like local contract document for the current local API contract:

- `GET /scanner/top`
- `GET /markets/:id/detail`

The contract publication must make local consumers understand:

- success response shapes;
- success examples;
- typed error response shapes;
- typed error examples;
- response versioning through `ept-api-v1`;
- placeholder pricing semantics;
- fail-closed taxonomy and boundaries;
- which fields are stable local contract fields versus fixture/example values;
- which behavior remains explicitly out of scope.

Expected output:

Create or update a documentation file under `docs/api/`, preferably a focused local contract file
such as:

- `docs/api/ept-api-v1-local-contract.md`

Then add links from the existing docs index locations if appropriate:

- `README.md`
- `docs/api/api-gateway.md`

Keep the change documentation-only unless you add the optional lightweight consistency check below.

Minimum contract content:

1. Title and status

- State that this is a local OpenAPI-like contract publication for the fixture-backed Phase 1 API.
- State that it is not a live vendor API specification and not a trading API.
- State current contract version: `ept-api-v1`.

2. Base URL and content type

- Local base URL: `http://localhost:4000`.
- JSON responses.
- Fixture mode is the current default for this contract.

3. Shared success metadata

Document the success `meta` fields used by `/scanner/top` and `/markets/:id/detail`:

- `contractVersion`
- `responseKind`
- `generatedAt`
- `status`
- `source`
- `mode`
- `isFixtureBacked`
- `isReadOnly`
- `isPlaceholderPricing`
- `message`

Make clear that `generatedAt` is runtime-generated except in snapshot tests where the clock is
fixed.

4. Shared typed error shape

Document the typed error fields:

- `contractVersion`
- `status`
- `error`
- `message`
- `generatedAt`
- optional `supportedIds`

Document the current taxonomy:

- status: `ok`, `not_found`, `unsupported`, `fail_closed`
- error: `market_not_found`, `unsupported_market`, `out_of_scope`

Make clear that `market_not_found` is currently implemented for detail lookup and the other codes
are reserved until an endpoint actually needs them.

5. `GET /scanner/top`

Document:

- Purpose: read-only scanner candidate publication from the local fixture-backed adapter.
- Response kind: `scanner_top`.
- Success status: `200`.
- Response body: `ScannerTopResponse`.
- Top-level fields: `candidates`, `meta`.
- Candidate shape: `market`, `fairValue`, `tradeCandidate`, `isPlaceholder`.
- Placeholder semantics:
  - fair probabilities are `null`;
  - confidence is `null`;
  - edge is `null`;
  - `isPlaceholder` is `true`;
  - this is not a model output and not trading advice.
- Include a success example derived from
  `apps/api-gateway/tests/snapshots/scanner-top.fixture.json`. The example may be trimmed, but it
  must preserve the important contract fields and must not invent fields.

6. `GET /markets/:id/detail`

Document:

- Purpose: contract-backed Market Detail payload for read-only research inspection.
- Path parameter: `id`, URL-encoded normalized market id such as
  `polymarket:mkt-btc-1h-demo`.
- Response kind: `market_detail`.
- Success status: `200`.
- Response body: `MarketDetailResponse`.
- Top-level fields:
  - `market`
  - `relatedMarkets`
  - `researchReadiness`
  - `tokenTrace`
  - `sourceTrace`
  - `evidenceTrail`
  - `openGaps`
  - `meta`
  - optional `candidate`
  - optional `book`
- Include a success example derived from
  `apps/api-gateway/tests/snapshots/market-detail-btc-1h.fixture.json`. The example may be trimmed,
  but it must preserve the important contract fields and must not invent fields.
- Include a typed `market_not_found` example that matches `docs/api/api-gateway.md` and shared
  `ApiErrorResponse`.

7. Fail-closed and placeholder semantics

Document these rules explicitly:

- Missing or ambiguous evidence must remain `TODO` or fail closed.
- Up/Down labels are labels, not payoff specifications.
- No non-placeholder pricing may appear until payoff, reference, settlement, freshness, and
  validation gates are documented and satisfied.
- The contract exposes evidence gaps rather than silently filling them.

8. Out of scope

State that RC-6 must not add:

- real-money trading;
- private/authenticated Polymarket access;
- Predict.fun adapter;
- Binance adapter;
- replay engine;
- paper broker;
- real pricing model;
- external network calls;
- live fixture capture;
- API behavior changes;
- snapshot changes;
- page changes.

9. Optional lightweight consistency check

You may add a local documentation consistency check only if it is very small and low risk.
Acceptable examples:

- a script or test that verifies documented example JSON blocks parse; or
- a script or test that verifies referenced snapshot files exist; or
- a script or test that compares a few documented contract version strings to
  `API_CONTRACT_VERSION`.

Do not add a broad schema generator, OpenAPI toolchain, runtime validation library, or new external
dependency for RC-6.

Validation:

- If the change is documentation-only, run:
  - `git diff --check`
- If you add a lightweight consistency check, run that check and the narrow relevant test command.
- Do not run live vendor commands.

Commit and push:

- Review `git diff`.
- Commit with a concise message such as:
  - `Publish ept-api-v1 local contract`
- Push to `origin main` only after the working tree is clean except for the intended changes.

Final report:

Report:

1. current branch;
2. whether `main` and `origin/main` match after push;
3. latest CI status before your change;
4. files changed;
5. validation run;
6. whether commit succeeded;
7. whether push succeeded;
8. what remains out of scope.

Stop after RC-6. Do not start pricing, trading, replay, paper broker, new venue, or external
research work.
```
