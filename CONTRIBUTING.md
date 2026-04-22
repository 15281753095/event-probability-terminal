# Contributing

This project is developed with a research-first workflow. Contributions should keep the repository small, verifiable, and read-only for Phase 1.

## Ground Rules

- Use official documentation, official SDKs, official help centers, or first-party repositories for external API facts.
- Update `docs/source_registry.md` and the relevant `docs/api/*.md` before changing an external adapter.
- Route every external API through an adapter boundary.
- Do not make raw vendor HTTP requests from business logic.
- Mark unconfirmed fields, schemas, classification rules, or behavior as `TODO`.
- Keep each change to one minimal vertical slice.
- Do not add real-money trading, private/auth endpoints, wallet automation, or order submission.

## Local Setup

```bash
make install
make dev-api
make dev-web
```

Optional infrastructure:

```bash
make infra-up
make infra-down
```

Current fixture mode does not require PostgreSQL or Redis.

## Checks

Run these before opening a pull request:

```bash
npx --yes pnpm@10.0.0 typecheck
npx --yes pnpm@10.0.0 build
make test
make lint-python
```

## Adapter Changes

Adapter work must include:

- source-registry update;
- API documentation update;
- fixture update or explicit explanation of why fixtures are unchanged;
- contract tests using local fixtures by default;
- clear fail-closed behavior for unconfirmed mappings.

Live network capture must be explicitly approved before running.

## Pull Request Expectations

- State what is in scope and out of scope.
- Link the official source documents used.
- List commands run locally.
- Call out any unverified behavior with `TODO`.
- Confirm that no private/authenticated or real-money trading path was added.
