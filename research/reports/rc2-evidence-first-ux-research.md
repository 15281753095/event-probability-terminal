# RC-2 Evidence-First UX Research

Date: 2026-04-23

## Scope

This note converts public product and UX research into a small RC-2 implementation plan. It remains
inside Phase 1: Polymarket-first, BTC/ETH, binary outcomes, read-only scanner and market detail,
provenance, evidence, and pricing placeholders.

## Sources Reviewed

### Verified Official Sources

- Polymarket product surface: `https://polymarket.com/`
- Polymarket API introduction: `https://docs.polymarket.com/api-reference/introduction`
- Polymarket fetching markets guide: `https://docs.polymarket.com/market-data/fetching-markets`
- Polymarket search API reference: `https://docs.polymarket.com/api-reference/search/search-markets-events-and-profiles`
- Polymarket orderbook documentation: `https://docs.polymarket.com/trading/orderbook`
- Predict.fun basics documentation: `https://docs.predict.fun/the-basics/quickstart`
- Binance Academy guide to Binance Wallet Prediction Markets:
  `https://www.binance.com/en/academy/articles/a-guide-to-binance-wallet-prediction-markets`

### Weak Public User Signals

- Public X/Twitter pages and search surfaces were checked for prediction-market dashboard, scanner,
  research UI, and market detail signals.
- Direct X content was not stable enough in this environment to support factual claims. It is used
  only as weak product-signal context.

## Verified Facts

- Polymarket presents market discovery through dense public product surfaces with categories,
  trending/live markets, liquidity, volume, percentages, and ending-time signals.
- Polymarket official docs separate Gamma discovery, search, market data, and CLOB/orderbook
  concepts. Those docs support read-only discovery and market-data inspection, but do not by
  themselves confirm this repo's BTC/ETH 10m/1h live classification.
- Existing repository fixtures already expose enough normalized data to support local query,
  filter, sort, detail, evidence, and provenance views without new network calls.

## Product Observations

- A research terminal benefits from shareable URL state because filters and query context are part
  of the research artifact.
- A scanner needs a compact status strip to distinguish accepted, visible, rejected, placeholder,
  and open-gap states.
- Fail-closed behavior is easier to trust when rejection reasons are grouped with sample IDs.
- Market Detail becomes more useful when provenance, source IDs, token IDs, evidence trail, and
  related fixture markets are grouped as inspection sections.

## Reasonable Inferences

- RC-2 should deepen evidence-first UX rather than add model logic.
- The next highest-value low-dependency slices are:
  1. URL-persisted query state.
  2. Scanner research status strip.
  3. Fail-closed reason matrix.
  4. Market Detail evidence organization with source/token trace and related fixture markets.
- These slices improve inspectability and traceability without relying on real pricing, trading,
  live vendor calls, new venue adapters, replay, or paper broker.

## Unconfirmed Items

- TODO: X/Twitter remains weak signal only.
- TODO: BTC/ETH 10m/1h live discovery remains unconfirmed.
- TODO: Up/Down payoff/reference extraction remains research-only.
- TODO: No real fair-probability model exists.

## Explicit Exclusions

- No real pricing model.
- No trade recommendation or execution.
- No CLOB expansion beyond existing fixture-backed book reads.
- No new adapter.
- No replay, paper broker, or historical charting workflow.
