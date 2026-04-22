# AGENTS.md

These rules apply to all Codex work in this repository.

## Operating Mode

1. Start in research mode before implementation mode.
2. Prefer official documentation, official SDKs, official help centers, and first-party repositories.
3. Before writing any external adapter, update `docs/source_registry.md` and the relevant `docs/api/*.md` file.
4. Every external API must be accessed through an adapter boundary.
5. Business logic must not make raw vendor HTTP requests.
6. Every unconfirmed interface detail, schema, behavior, or assumption must be marked `TODO`.
7. Work on one minimal vertical slice at a time.
8. Phase 1 forbids real-money automated trading.
9. Historical signal display belongs in replay/stats workflows, not dense overlays on the primary chart.
10. Model output must be explainable: show inputs, assumptions, method, and limits.

## Current Scope

The repository currently has a minimal fixture-first, read-only end-to-end slice:

- Polymarket public-read adapter boundary in `services/market-ingestor`.
- Local synthetic fixtures and fixture-based contract tests.
- Shared `EventMarket` and order-book contracts.
- Fastify read-only API endpoints.
- Next.js Markets Scanner v0.
- Python pricing-engine health shell.

Allowed implementation work must remain small, researched, and adapter-based. Live public fixture capture requires explicit approval before running network commands.

## Prohibited Without Explicit Re-Approval

- Any expansion of the Polymarket adapter beyond approved public read paths.
- Any live Polymarket fixture capture or public network call.
- Predict.fun adapter implementation.
- Binance Wallet or Binance trading integration.
- Real-money order placement, cancellation, settlement, funding, withdrawal, or wallet automation.
- Real scanner scoring, pricing model, paper broker, replay engine, or news-signal business implementation.
- Inferred external API fields, paths, auth headers, signatures, pagination, or schemas.
