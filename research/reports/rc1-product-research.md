# RC-1 Read-Only Product Research

Date: 2026-04-23

## Scope

This note converts public product and user-signal research into a small RC-1 implementation plan.
It is not an API contract and does not authorize any new trading, private API, CLOB, pricing-model,
Predict.fun, or Binance adapter work.

## Sources Reviewed

### Verified Official Sources

- Polymarket API introduction: `https://docs.polymarket.com/api-reference/introduction`
- Polymarket fetching markets guide: `https://docs.polymarket.com/market-data/fetching-markets`
- Polymarket search API reference: `https://docs.polymarket.com/api-reference/search/search-markets-events-and-profiles`
- Polymarket orderbook documentation: `https://docs.polymarket.com/trading/orderbook`
- Predict.fun basics documentation: `https://docs.predict.fun/the-basics/quickstart`
- Binance Academy guide to Binance Wallet Prediction Markets:
  `https://www.binance.com/en/academy/articles/a-guide-to-binance-wallet-prediction-markets`

### Public User-Signal Sources

- Public X/Twitter pages and search surfaces were checked for Polymarket, prediction-market
  dashboard, scanner, and Up/Down market terms.
- Direct X page content was not stable enough in this environment to use as a factual source.
  X/Twitter was therefore used only as weak product-signal context, not as interface or API fact.

## Verified Facts

- Polymarket separates Gamma, Data, and CLOB API families. Gamma is the primary public discovery
  surface for markets, events, tags, search, and public profiles.
- Polymarket documents market discovery by slug, tags, and active events. The docs describe active,
  closed, limit, ordering, and pagination parameters for broad market discovery.
- Polymarket orderbook documentation treats midpoint as a displayed implied probability when the
  spread is within the documented threshold, and documents best-bid/best-ask style real-time
  updates. This repo still does not expand into new CLOB capture in RC-1.
- Predict.fun and Binance Wallet Prediction Markets publicly explain binary YES/NO shares and
  payout semantics, but they remain product-semantics references only in this repository.

## Product Observations

- A scanner needs fast narrowing by asset, time window, and sorting dimension before it needs a
  real pricing model.
- A market detail view is valuable even without trading because it keeps question, outcomes,
  timings, liquidity, book snapshot, provenance, and placeholder pricing in one inspectable place.
- Evidence and rejection visibility are more important than cosmetic UI expansion at this stage:
  current Polymarket live discovery is intentionally fail-closed where classification or payoff
  evidence is missing.
- Placeholder pricing must be visible in the interface, not only in API fields, to avoid implying a
  real fair-value model exists.

## Reasonable Inferences

- RC-1 should improve inspection and explainability before adding more venues or model logic.
- The highest-value low-dependency slices are:
  1. Scanner filter and sort controls.
  2. Market Detail v0.
  3. Evidence/provenance and fail-closed summary panels.
- These slices convert current contracts and fixtures into a more usable research terminal without
  opening trading, true pricing, replay, paper broker, or new adapters.

## Unconfirmed Items

- TODO: X/Twitter content could not be used as stable evidence for specific product claims.
- TODO: BTC/ETH 10m/1h live target discovery remains unconfirmed.
- TODO: Polymarket Up/Down reference/start/settlement extraction remains research-only.
- TODO: No real pricing-engine v1 feature computation is implemented.

## RC-1 Selected Slices

### 1. Scanner Filter And Sort

- Add asset and window filtering.
- Add sorting by expiry, liquidity, spread, and observed market probability.
- Keep all calculations read-only and based on normalized fixture-backed market data.

### 2. Market Detail v0

- Add a single market detail route.
- Show binary outcomes, timing, top-of-book snapshot when available, placeholder pricing, provenance,
  and open evidence gaps.
- Do not add trading controls, charting, replay, or paper broker actions.

### 3. Evidence And Placeholder Explanation

- Add scanner metadata for rejected markets grouped by fail-closed reason.
- Show pricing mode, rejected count, uncertainty, and fail-closed summary in the web app.
- Keep fair probability, confidence, edge, and candidates explicitly marked as placeholders.

## Explicit Exclusions

- No real pricing model.
- No strategy or trade recommendation logic.
- No private/authenticated vendor requests.
- No CLOB expansion beyond existing fixture-backed orderbook path.
- No Predict.fun or Binance adapter.
- No replay, paper broker, or historical signal overlay.
