# ADR 0010: RC-5 Response Versioning and Error Taxonomy

Date: 2026-04-23

## Status

Accepted

## Context

`GET /scanner/top` and `GET /markets/:id/detail` are now fixture-backed and snapshot-tested. They
are effectively public local API contracts for the web app and future local consumers.

Before RC-5, those responses did not expose an explicit contract version. Error payloads such as
`market_not_found` were also shaped per route, which made consumer behavior less predictable.

## Decision

Introduce a minimal API governance contract:

- `API_CONTRACT_VERSION = "ept-api-v1"`;
- `ApiResponseMeta` for successful scanner/detail responses;
- `ApiErrorResponse` for typed error responses;
- `ApiResponseStatus` taxonomy with `ok`, `not_found`, `unsupported`, and `fail_closed`;
- `ApiErrorCode` taxonomy with `market_not_found`, `unsupported_market`, and `out_of_scope`.

`GET /scanner/top` and `GET /markets/:id/detail` now include stable meta fields:

- `contractVersion`;
- `responseKind`;
- `generatedAt`;
- `status`;
- `source`;
- `mode`;
- `isFixtureBacked`;
- `isReadOnly`;
- `isPlaceholderPricing`;
- `message`.

`market_not_found` responses now include:

- `contractVersion`;
- `status`;
- `error`;
- `message`;
- `generatedAt`;
- optional `supportedIds`.

The web app consumes typed error payloads and surfaces the contract version in the scanner/detail
workflow.

## Consequences

- Local consumers can detect response contract version explicitly.
- Snapshot tests now lock versioned meta and typed error semantics.
- The project has a small status taxonomy without becoming a general API platform.
- Placeholder pricing remains explicit; no real model, trading, venue expansion, CLOB expansion, or
  live fixture capture is introduced.

## TODO

- TODO: Add a migration note if `ept-api-v2` is introduced.
- TODO: Extend typed errors only when a route actually needs a new error condition.
