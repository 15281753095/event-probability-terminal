# Polymarket Up/Down Payoff Research Plan

Status: research plan only; no capture or extraction implementation.

Date: 2026-04-23 Asia/Shanghai

## Objective

Determine whether Polymarket public-read evidence can support a fail-closed payoff specification
for BTC/ETH Up/Down markets before pricing-engine v1 implementation begins.

## Current Evidence

The repository already contains promoted Gamma/public-search fixtures showing:

- BTC and ETH Up/Down market-family samples;
- binary labels `["Up","Down"]`;
- short-window tags such as `5M` and `15M`;
- one closed Bitcoin `1H` sample;
- no confirmed live BTC/ETH `10m` target market;
- no confirmed active BTC/ETH `1h` target market;
- no reference/start/strike level;
- no settlement source or tie rule.

## Minimum Questions To Resolve

1. Where is the official/public Up/Down payoff rule exposed?
2. Is the reference level a start price, a fixed strike, or another reference value?
3. What timestamp defines the reference level?
4. What source defines the settlement level?
5. What timestamp or window defines settlement evaluation?
6. What happens on equality between settlement level and reference level?
7. Can these fields be extracted from public-read data without authentication?

## Future Fixture Requirements

The next approved capture should seek public-read samples that include:

- at least one active BTC Up/Down candidate;
- at least one active ETH Up/Down candidate;
- if available, a 10m candidate and a 1h candidate;
- market title, question, tags, dates, and any description/rule-like text exposed by Gamma;
- enough metadata to connect the payoff rule to a specific market ID and condition ID.

No CLOB/private/auth endpoint is required for this research plan unless Gamma/public-search proves
insufficient and the user explicitly approves a new endpoint family in a later task.

## Extraction Test Plan

Before runtime extraction is allowed, add fixture-based tests that prove:

- confirmed Up/Down payoff evidence produces an `observed` extraction result;
- missing reference level produces `required_missing`;
- missing settlement source produces `required_missing`;
- ambiguous comparator or tie rule produces `required_missing`;
- non-BTC/ETH or non-10m/1h candidates remain out of scope;
- labels alone never unlock non-placeholder pricing.

## Implementation Gate

Do not implement pricing-engine v1 logic until the extraction tests above exist and pass with
reviewed fixtures. Until then, pricing outputs must remain placeholder for Up/Down markets.
