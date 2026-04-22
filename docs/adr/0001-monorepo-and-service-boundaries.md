# ADR 0001: Monorepo and Service Boundaries

Status: Accepted

Date: 2026-04-21

## Context

Event Probability Terminal needs a web research UI, a TypeScript API gateway, Python research/pricing code, future ingestion, paper trading, replay/stats, and shared contracts. Phase 1 must stay documentation-first and avoid implementing vendor adapters or real-money trading.

## Decision

- Use a monorepo with `apps`, `services`, `packages`, `infra`, `docs`, and `research`.
- Use Next.js, React, TypeScript, Tailwind, shadcn-compatible UI conventions, and TradingView Lightweight Charts for the web app.
- Use Node.js, TypeScript, and Fastify for the API gateway.
- Use Python 3.11+ with pandas, polars, numpy, scipy, statsmodels, pytest, ruff, and mypy for research/pricing services.
- Use PostgreSQL and Redis through Docker Compose for local infrastructure.
- Keep every external market source behind adapters.

## Why Fastify

Fastify is the default gateway choice because Phase 1 needs a small, explicit HTTP boundary with health checks and future read-only adapter orchestration. It has lower ceremony than NestJS for this initial shell, keeps request handlers easy to inspect, and can still grow through plugins if the gateway becomes more complex.

NestJS is not selected now because Phase 1 does not need a full application framework, dependency-injection layer, or module system.

## Consequences

- The API gateway starts small and can be refactored if future gateway complexity justifies it.
- Shared TypeScript contracts live under `packages/shared-types`.
- Python research code remains isolated under services.
- Documentation gates adapter work.

## Non-goals

- No real-money trading code.
- No vendor adapter implementation in this initialization.
- No full scanner, pricing, paper broker, replay, or news-signal implementation.

## TODO

- TODO: Define adapter interfaces after first endpoint-specific official API review.
- TODO: Add CI after dependency installation is validated.
- TODO: Add database schema ADR when persistence contracts are designed.

