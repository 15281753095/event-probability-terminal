# ADR 0009: RC-4 API Contract Snapshots and CI Hygiene

Date: 2026-04-23

## Status

Accepted

## Context

RC-3 made Market Detail contract-backed through `MarketDetailResponse`, but the two most important
read-only responses were still only partially protected by explicit assertions:

- `GET /scanner/top`
- `GET /markets/:id/detail`

Those responses are now consumed by the web app and are effectively public local contracts. Future
refactors could accidentally change placeholder pricing shape, evidence fields, related market
summaries, or fail-closed metadata without breaking narrow assertions.

GitHub Actions also emitted a Node.js 20 deprecation annotation for JavaScript actions. The CI run
was green, but the annotation was noisy.

## Decision

Add fixture-backed API response contract snapshots under:

```text
apps/api-gateway/tests/snapshots/
```

The snapshots lock a stable contract projection, not every implementation detail. The tests:

- use fixture mode only;
- inject a fixed clock;
- inject a deterministic unavailable pricing-engine client so local fallback placeholder output is
  stable;
- lock normalized market, pricing placeholder, scanner metadata, detail evidence/provenance,
  token trace, related fixture markets, and book fields;
- avoid locking runtime wall-clock time or machine-specific network failure text.

For CI hygiene, set:

```yaml
FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"
```

at the CI job level. This is the smallest change that addresses the current Node.js 20 action
runtime annotation without changing the workflow shape.

## Consequences

- API response drift for scanner and detail contracts is caught in JavaScript tests.
- The snapshot files remain readable enough to review contract changes in PRs.
- The tests do not call live vendors and do not require pricing-engine to be running.
- Placeholder outputs remain explicit and are not upgraded to real pricing.
- The CI workflow remains otherwise unchanged.

## TODO

- TODO: Add a documented snapshot update workflow if the local contract intentionally changes.
- TODO: Revisit action versions when GitHub publishes a stable major-version upgrade path for the
  actions used here.
