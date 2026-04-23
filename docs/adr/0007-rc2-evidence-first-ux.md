# ADR 0007: RC-2 Evidence-First UX

Date: 2026-04-23

## Status

Accepted

## Context

RC-1 added a read-only scanner, Market Detail v0, evidence/provenance visibility, and Playwright
smoke checks. The next useful improvement is not a pricing model or trading feature. It is making
the research state more inspectable, shareable, and explainable while preserving the current
fixture-first boundary.

## Decision

RC-2 adds four read-only UX slices:

1. URL-persisted query state for scanner research.
2. Scanner research status strip for accepted, visible, rejected, pricing, and evidence-gap counts.
3. Fail-closed reason matrix with rejection counts and sample market IDs.
4. Market Detail evidence organization with research readiness, token trace, source trace,
   evidence trail, and related fixture markets.

These changes use existing normalized data and `GET /scanner/top`. They do not introduce new
vendor calls, CLOB expansion, pricing models, trading controls, replay, or paper broker behavior.

## Consequences

- Scanner URLs can encode `asset`, `window`, `sort`, and `q`.
- Scanner results can be inspected as accepted vs visible vs rejected without looking at raw API
  JSON.
- Market Detail provides a clearer inspection surface for provenance and token/outcome traceability.
- Existing Playwright smoke tests cover the new query state and evidence sections.

## Non-Goals

- No real fair probability.
- No strategy or candidate scoring beyond placeholder fields.
- No live discovery rule changes.
- No extra venue integration.
- No charting or historical replay.

## TODO

- TODO: Add richer evidence inspection only after live target discovery and payoff extraction have
  fixture-backed contracts.
- TODO: Consider a dev-only raw fixture inspector only if it stays detached from runtime product
  claims.
