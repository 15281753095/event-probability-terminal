# Source Registry

Initial verification date: 2026-04-21 Asia/Shanghai.
Latest update: 2026-04-23 Asia/Shanghai.

This registry is the gate for external-source usage. A new adapter or external data module must not be added until this file and the relevant `docs/api/*.md` file are updated from official documentation, official SDKs, or official help-center material.

## Verified facts

| Source id | Official source | Confirmed facts |
| --- | --- | --- |
| `polymarket-api-overview` | https://docs.polymarket.com/api-reference | Polymarket documents separate Gamma, Data, and CLOB APIs. Gamma is for markets/events/tags/series/comments/sports/search/public profiles and is the primary market discovery API. Data is for user positions, trades, activity, holder data, open interest, leaderboards, and builder analytics. CLOB is for orderbook data, pricing, midpoints, spreads, price history, and trading operations. Gamma and Data are public; CLOB has public and authenticated endpoints. |
| `polymarket-market-concepts` | https://docs.polymarket.com/concepts/markets-events | Polymarket documents markets as the fundamental tradable unit, events as containers for one or more related markets, slugs as URL/API identifiers, and token IDs as ERC1155 token IDs used for CLOB trading, one for Yes and one for No. Markets can only be traded through CLOB when `enableOrderBook` is true. |
| `polymarket-fetching-markets` | https://docs.polymarket.com/market-data/fetching-markets | Polymarket documents three discovery strategies: by slug, by tags, and via the events endpoint. It recommends the events endpoint with `active=true&closed=false` for broad active-market discovery because events contain associated markets. It documents `limit` and `offset` pagination for list endpoints and says to always include `active=true` for live markets. |
| `polymarket-events-keyset` | https://docs.polymarket.com/api-reference/events/list-events-keyset-pagination | Polymarket documents `GET /events/keyset` on Gamma for cursor-based event listing. Responses contain `events` and `next_cursor`; `next_cursor` is passed as `after_cursor`; `offset` is rejected. Query parameters include `limit`, `order`, `ascending`, `after_cursor`, `closed`, `live`, `title_search`, date filters, tag filters, and others. |
| `polymarket-markets-keyset` | https://docs.polymarket.com/api-reference/markets/list-markets-keyset-pagination | Polymarket documents `GET /markets/keyset` on Gamma for cursor-based market listing. Responses contain `markets` and optionally `next_cursor`; `offset` is rejected. Query parameters include `limit`, `order`, `ascending`, `after_cursor`, `closed`, `clob_token_ids`, `condition_ids`, `question_ids`, date filters, tag filters, and `include_tag`. |
| `polymarket-events-list` | https://docs.polymarket.com/api-reference/events/list-events | Polymarket documents `GET /events` on Gamma. Query parameters include `limit`, `offset`, `order`, `ascending`, `id`, `tag_id`, `exclude_tag_id`, `slug`, `tag_slug`, `related_tags`, `active`, `archived`, `featured`, `closed`, and date filters. Event responses include event metadata and can include nested `markets`. |
| `polymarket-markets-list` | https://docs.polymarket.com/api-reference/markets/list-markets | Polymarket documents `GET /markets` on Gamma. Query parameters include `limit`, `offset`, `order`, `ascending`, `id`, `slug`, `clob_token_ids`, `condition_ids`, `question_ids`, tag filters, date filters, and `closed`. Market responses include fields such as `id`, `question`, `conditionId`, `slug`, `startDate`, `endDate`, `active`, `closed`, `enableOrderBook`, `questionID`, `clobTokenIds`, `outcomes`, `outcomePrices`, `bestBid`, `bestAsk`, `lastTradePrice`, `spread`, and nested event/tag relations. |
| `polymarket-tags` | https://docs.polymarket.com/api-reference/tags/list-tags | Polymarket documents `GET /tags` on Gamma. Tag responses include `id`, `label`, `slug`, and visibility-related fields. |
| `polymarket-public-search` | https://docs.polymarket.com/api-reference/search/search-markets-events-and-profiles | Polymarket documents `GET /public-search` on Gamma. It requires query parameter `q` and can return events, tags, profiles, and pagination metadata. |
| `polymarket-clob-public-read` | https://docs.polymarket.com/api-reference/market-data/get-order-book ; https://docs.polymarket.com/api-reference/market-data/get-market-price ; https://docs.polymarket.com/api-reference/data/get-midpoint-price ; https://docs.polymarket.com/api-reference/markets/get-market-by-token ; https://docs.polymarket.com/api-reference/markets/get-prices-history | Polymarket documents public CLOB read endpoints for order book, best market price, midpoint, resolving a parent market by token, and price history. These require token IDs or asset IDs and do not require implementing authenticated trading endpoints. |
| `polymarket-rate-limits` | https://docs.polymarket.com/api-reference/rate-limits | Polymarket documents Cloudflare-throttled rate limits by API family and endpoint group. |
| `polymarket-sdks` | https://docs.polymarket.com/api-reference/clients-sdks | Polymarket documents official open-source TypeScript, Python, and Rust clients for the CLOB API. |
| `polymarket-live-public-fixture-2026-04-21` | Approved public captures from `https://gamma-api.polymarket.com/events/keyset`, `https://gamma-api.polymarket.com/markets/keyset`, `https://gamma-api.polymarket.com/tags`, and `https://gamma-api.polymarket.com/public-search` stored in `services/market-ingestor/fixtures/polymarket/live-public-gamma-samples.json` | Observed runtime samples confirm Gamma keyset responses carry cursor metadata (`next_cursor`), public-search returns event results with pagination metadata, sampled Gamma market fields include `id`, `slug`, `question`, `conditionId`, `questionID`, `active`, `closed`, `enableOrderBook`, dates, `bestBid`, `bestAsk`, `lastTradePrice`, `spread`, `liquidityNum`, and `volumeNum`, and sampled `clobTokenIds`, `outcomes`, and `outcomePrices` are JSON-encoded strings. The sample confirms asset evidence for Bitcoin and Ethereum in public-search tags, but does not confirm 10m or 1h target-window classification. |
| `polymarket-target-discovery-2026-04-22` | Approved public captures from `https://gamma-api.polymarket.com/public-search` and `https://gamma-api.polymarket.com/events/keyset` stored in `services/market-ingestor/fixtures/polymarket/live-target-discovery-samples.json` | Observed BTC/ETH short-window Up/Down family evidence with `5M` tags and `["Up","Down"]` outcomes; observed one closed Bitcoin `1H` sample; observed one closed Ethereum `15M` sample; did not observe BTC/ETH `10m` target hits or active BTC/ETH `1h` target markets in the approved request set. This evidence is insufficient to open live BTC/ETH 10m/1h classification. |
| `polymarket-updown-payoff-evidence-2026-04-23` | Approved public captures from `https://gamma-api.polymarket.com/public-search` and `https://gamma-api.polymarket.com/events/keyset` stored in `services/market-ingestor/fixtures/polymarket/live-updown-payoff-evidence-samples.json` | Observed BTC/ETH `5M` Up/Down descriptions saying `Up` wins when the price at the end of the title time range is greater than or equal to the price at the beginning, otherwise `Down`; observed Chainlink BTC/USD and ETH/USD resolution-source URLs for those 5M samples; observed closed 5M `eventMetadata.finalPrice` and `eventMetadata.priceToBeat` field names. This evidence strengthens 5M payoff semantics but does not confirm active BTC/ETH `10m` or `1h` target markets, official schema semantics for `eventMetadata`, or runtime extraction readiness. |
| `rc1-product-research-2026-04-23` | `https://docs.polymarket.com/api-reference/introduction`, `https://docs.polymarket.com/market-data/fetching-markets`, `https://docs.polymarket.com/api-reference/search/search-markets-events-and-profiles`, `https://docs.polymarket.com/trading/orderbook`, `https://docs.predict.fun/the-basics/quickstart`, `https://www.binance.com/en/academy/articles/a-guide-to-binance-wallet-prediction-markets`, and public `https://x.com` surfaces | Public product research supports adding read-only scanner filtering/sorting, Market Detail inspection, and evidence/provenance panels. X/Twitter pages were treated only as weak public user-signal context because direct content was not stable enough here to use as factual API or product evidence. |
| `rc2-evidence-first-ux-research-2026-04-23` | `https://polymarket.com/`, `https://docs.polymarket.com/api-reference/introduction`, `https://docs.polymarket.com/market-data/fetching-markets`, `https://docs.polymarket.com/api-reference/search/search-markets-events-and-profiles`, `https://docs.polymarket.com/trading/orderbook`, `https://docs.predict.fun/the-basics/quickstart`, `https://www.binance.com/en/academy/articles/a-guide-to-binance-wallet-prediction-markets`, and public `https://x.com` surfaces | Public product and UX research supports RC-2 evidence-first improvements: URL-persisted query state, scanner research status, fail-closed reason matrix, and Market Detail source/token trace plus related fixture markets. X/Twitter remains weak signal only and is not used as API truth. |
| `predict-fun-docs` | https://dev.predict.fun/ | Predict API documentation is marked beta. It documents REST, WebSocket, authorization, markets, orders, accounts, positions, search, OAuth, and schemas. It lists BNB Mainnet and BNB Testnet base URLs, says mainnet requires an API key, and links TypeScript and Python SDKs. |
| `binance-academy-wallet-prediction` | https://www.binance.com/en/academy/articles/a-guide-to-binance-wallet-prediction-markets | Binance Academy says Binance Wallet Prediction Markets integrate the third-party Predict.fun protocol on BNB Smart Chain, accessible through the Binance app. Binance acts as an access layer and does not create events or act as counterparty. |

## Project decisions

- All external market sources must be represented by adapters.
- Business services must not issue raw HTTP requests directly to market vendors.
- Phase 1 is read-only for market data and simulation-only for paper trading.
- No real-money order submission, cancellation, wallet funding, settlement, or withdrawal code will be implemented in this phase.
- Binance Wallet Prediction Markets are product-semantics reference only until an official developer API surface is confirmed.
- The current Polymarket adapter implementation is fixture-first and must fail closed for live BTC/ETH 10m/1h classification until approved public fixtures confirm the mapping.
- `EventMarket` uses a minimal binary-outcome contract rather than a Yes/No-only token contract. Upstream labels such as `Yes`/`No` and `Up`/`Down` can be preserved, but they do not by themselves prove Phase 1 asset/window classification.
- Polymarket Up/Down labels do not by themselves prove payoff direction, reference/start/strike
  level, settlement source, comparator, or tie rule. The 2026-04-23 payoff evidence confirms those
  semantics only for observed BTC/ETH 5M Chainlink samples; non-placeholder pricing must still fail
  closed for Phase 1 target 10m/1h until matching target-window evidence and schema semantics are
  confirmed.
- Scanner fair probability, confidence, and edge fields are placeholders. Pricing-engine v0 defines the local placeholder contract but does not compute real probabilities.
- RC-1 product work is limited to read-only scanner filtering/sorting, Market Detail inspection, and
  evidence/provenance visibility. Public X/Twitter signals may inform product prioritization but
  must not be used as API truth.
- RC-2 product work is limited to read-only URL query state, scanner research status, fail-closed
  reason display, and Market Detail evidence organization using existing normalized fixture-backed
  data.

## Reasonable inferences

- Polymarket can be researched first because its official docs expose market-discovery and public market-data surfaces.
- For broad Polymarket active-market discovery, the Gamma events endpoint is the likely first pass because the official fetching guide says events contain associated markets and reduce calls.
- For stable pagination over large Polymarket result sets, the Gamma keyset endpoints are preferable to offset endpoints once implementation begins.
- Predict.fun can be a secondary venue because official docs expose a beta REST/WebSocket/API-key model and SDKs.
- Binance Wallet Prediction Markets should not be treated as a direct venue adapter now because the verified Binance source is a product guide, not a developer API reference.

## Unconfirmed items

- TODO: Confirm the exact BTC and ETH tag IDs/slugs or another official classification mechanism. The official docs document tags and search, but do not confirm which tag values identify BTC, ETH, crypto, 10m, or 1h markets.
- TODO: Confirm how Polymarket market text, tags, slugs, event dates, and market dates reliably identify the internal `asset` values `BTC` and `ETH`. The approved 2026-04-21 public-search sample shows Bitcoin and Ethereum tags on daily price-threshold events, but this is not yet a canonical classification rule for the target market family.
- TODO: Confirm how Polymarket market text, tags, slugs, event dates, and market dates reliably identify the internal `window` values `10m` and `1h`. The approved 2026-04-22 target-discovery sample observed `5M`, `15M`, and a closed `1H` tag, but no live `10m` or active `1h` target market.
- TODO: Confirm whether the observed JSON-string runtime shape for `clobTokenIds`, `outcomes`, and `outcomePrices` is stable across the target BTC/ETH 10m/1h market family.
- TODO: Confirm whether the minimal binary-outcome ordering from Gamma `clobTokenIds` and `outcomes` is stable across actual BTC/ETH 10m/1h markets. Current `EventMarket` preserves upstream labels and token IDs but does not infer trading direction or pricing semantics from label text.
- TODO: Confirm whether Polymarket `eventMetadata.priceToBeat` and `eventMetadata.finalPrice` are
  stable, documented public fields for closed Up/Down markets.
- TODO: Confirm how Polymarket Up/Down reference/start/strike values are exposed for active
  markets before settlement. The 2026-04-23 evidence observed reference/settlement-like metadata
  only on closed 5M samples.
- TODO: Confirm whether actual BTC/ETH 10m and active 1h Up/Down target markets use the same
  Chainlink description/resolution-source pattern observed for 5M samples.
- TODO: Confirm whether initial adapter implementation should use `GET /events/keyset`, `GET /events`, `GET /markets/keyset`, `GET /markets`, `GET /public-search`, or a staged combination for BTC/ETH 10m/1h discovery.
- TODO: Confirm whether public CLOB read data should be fetched during discovery or only after an internal `EventMarket` candidate is accepted.
- TODO: Confirm Predict.fun endpoint pages, auth flow, request signing, response schemas, and WebSocket topic formats before writing any adapter.
- TODO: Confirm whether Binance exposes any official public developer API for Binance Wallet Prediction Markets. Until confirmed, no Binance adapter is allowed.
- TODO: Confirm compliance, geographic availability, and terms constraints for storing and replaying any vendor data.

## Adapter rule

Any future adapter must include:

- official source id from this registry;
- source URL and verification date;
- supported read operations;
- unsupported operations;
- explicit TODOs for unverified fields or behavior;
- tests that use fixtures, not live vendor calls by default.
