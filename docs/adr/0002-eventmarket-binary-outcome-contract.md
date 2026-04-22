# ADR 0002: EventMarket Binary Outcome Contract

Status: Accepted

Date: 2026-04-22 Asia/Shanghai

## Context

Phase 1 focuses on BTC/ETH event contracts for 10m and 1h windows, with Polymarket as the primary research venue. The initial `EventMarket` contract modeled binary markets as `tokens.yes` and `tokens.no`.

Approved Polymarket Gamma/public-search fixtures show two relevant outcome label shapes:

- `["Yes", "No"]` in promoted public-search samples.
- `["Up", "Down"]` in promoted BTC/ETH short-window target-family samples.

The `["Up", "Down"]` samples do not confirm live BTC/ETH 10m/1h discovery. They do prove that a Yes/No-only domain contract is too narrow for observed Polymarket target-family market labels.

## Decision

Use a minimal binary-outcome contract for `EventMarket`.

`EventMarket` now contains:

- `outcomeType: "binary"`
- `outcomes.primary`
- `outcomes.secondary`

Each outcome preserves:

- `role`
- upstream `label`
- `tokenId`

The contract does not infer trading direction, fair value semantics, or strategy side from label text. It only preserves the two labeled token outcomes needed by the read-only scanner MVP.

## Consequences

- `Yes`/`No` and observed `Up`/`Down` markets can be represented by the same minimal domain shape.
- The adapter still fails closed when it cannot parse exactly two token IDs and exactly two outcome labels.
- Live BTC/ETH 10m/1h classification remains closed until separately confirmed.
- Multi-outcome markets remain out of scope.
- Pricing, scanner scoring, and paper trading must consume outcome labels explicitly instead of assuming YES/NO semantics.

## Rejected Alternative

Keeping a Yes/No-only contract would reduce immediate code changes, but it would exclude observed Polymarket Up/Down target-family markets from the domain model. That would make the current blocker harder to resolve and would conflate a label decision with the separate live-discovery classification gate.

## TODO

- TODO: Confirm whether Gamma `clobTokenIds` ordering and `outcomes` ordering remain aligned across actual BTC/ETH 10m/1h markets.
- TODO: Confirm active BTC/ETH 10m/1h discovery rules before enabling live classification.
- TODO: Define the pricing-engine v0 interface against `outcomes.primary/secondary` before implementing any model logic.
