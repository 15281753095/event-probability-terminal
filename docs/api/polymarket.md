# Polymarket Public Read Discovery Notes

Verification date: 2026-04-21 Asia/Shanghai.

Scope: official-source notes and implementation constraints for the current minimal Polymarket public-read path. The repository currently has a fixture-first adapter boundary and local contract tests. This document does not authorize live HTTP calls, order placement, wallet work, authenticated trading, private endpoints, or expansion beyond the documented public-read slice.

Approved live public fixture capture: 2026-04-21 Asia/Shanghai. Only Gamma `events/keyset`, Gamma `markets/keyset`, Gamma `tags`, and Gamma `public-search` for Bitcoin/Ethereum were captured. No CLOB endpoint was captured in that run.

Approved target-discovery capture: 2026-04-22 Asia/Shanghai. Only Gamma `public-search` and Gamma `events/keyset` were queried on `gamma-api.polymarket.com`. No CLOB endpoint was captured in that run.

## Sources

- API overview: https://docs.polymarket.com/api-reference
- Market/event concepts: https://docs.polymarket.com/concepts/markets-events
- Fetching markets guide: https://docs.polymarket.com/market-data/fetching-markets
- Events keyset endpoint: https://docs.polymarket.com/api-reference/events/list-events-keyset-pagination
- Markets keyset endpoint: https://docs.polymarket.com/api-reference/markets/list-markets-keyset-pagination
- Events list endpoint: https://docs.polymarket.com/api-reference/events/list-events
- Markets list endpoint: https://docs.polymarket.com/api-reference/markets/list-markets
- Tags list endpoint: https://docs.polymarket.com/api-reference/tags/list-tags
- Public search endpoint: https://docs.polymarket.com/api-reference/search/search-markets-events-and-profiles
- CLOB order book endpoint: https://docs.polymarket.com/api-reference/market-data/get-order-book
- CLOB market price endpoint: https://docs.polymarket.com/api-reference/market-data/get-market-price
- CLOB midpoint endpoint: https://docs.polymarket.com/api-reference/data/get-midpoint-price
- CLOB market-by-token endpoint: https://docs.polymarket.com/api-reference/markets/get-market-by-token
- CLOB price history endpoint: https://docs.polymarket.com/api-reference/markets/get-prices-history
- Rate limits: https://docs.polymarket.com/api-reference/rate-limits
- Promoted live public fixture: `services/market-ingestor/fixtures/polymarket/live-public-gamma-samples.json`
- Promoted target-discovery fixture: `services/market-ingestor/fixtures/polymarket/live-target-discovery-samples.json`

## Official verification conclusions

### Relevant API families

Verified facts:

- Gamma API is the primary family for discovering and browsing markets, events, tags, search, and public profiles.
- Gamma `events` and `markets` endpoints are relevant to the minimal discovery flow.
- Gamma `tags` and `public-search` are relevant candidate-discovery helpers, but their BTC/ETH or interval taxonomy is not confirmed.
- CLOB public market-data endpoints are relevant only after a market candidate yields token IDs or asset IDs.
- CLOB authenticated order, cancellation, user order, wallet, bridge, and relayer endpoints are out of scope.
- Data API is not required for first-pass public discovery of BTC/ETH 10m/1h event markets.

Project decisions:

- Discovery starts from Gamma, not CLOB.
- CLOB public read endpoints may be used only for post-discovery read snapshots or historical price reads.
- No SDK is added during this research slice.
- Current implementation uses local fixtures by default. Live public fixture capture requires explicit approval.

Reasonable inference:

- `GET /events/keyset` is likely preferable for broad active-market discovery because it provides cursor-based pagination and events contain nested markets.
- `GET /markets/keyset` is useful when discovery starts from known market-level filters such as `condition_ids`, `clob_token_ids`, `question_ids`, or market date filters.
- `GET /public-search` and `GET /tags` may help find BTC/ETH candidate pools, but neither page confirms the exact tag or search taxonomy for BTC/ETH or 10m/1h markets.

### Approved fixture observations

Observed facts from the 2026-04-21 approved public capture:

- `GET /events/keyset?closed=false&limit=50` returned an object with `events` and `next_cursor`; the promoted sample records 50 returned events and a cursor.
- `GET /markets/keyset?closed=false&limit=50&include_tag=true` returned an object with `markets` and `next_cursor`; the promoted sample records 50 returned markets and a cursor.
- `GET /tags?limit=200` returned an array of 200 tag objects.
- `GET /public-search?q=Bitcoin` returned event results with pagination metadata; the first promoted event is a daily Bitcoin price-threshold event, not a 10m or 1h event.
- `GET /public-search?q=Ethereum` returned event results with pagination metadata; the first promoted event is a daily Ethereum price-threshold event, not a 10m or 1h event.
- Promoted public-search event tags include `bitcoin` for Bitcoin and `ethereum` for Ethereum.
- The tags page sample includes a `btc` tag, but the first 200 tags did not include an Ethereum tag. This does not prove absence of an Ethereum tag outside the captured page.
- Sampled market objects expose `clobTokenIds`, `outcomes`, and `outcomePrices` as JSON-encoded strings. Sampled outcomes parse as `["Yes", "No"]`.

Project decisions from the fixture review:

- Token extraction now requires both parseable two-token `clobTokenIds` and parseable two-label binary `outcomes`.
- The live fixture does not open BTC/ETH 10m/1h classification. The adapter must still fail closed without explicit classification.
- No CLOB price, book, midpoint, or history behavior was updated because those endpoints were not captured in this approved run.

### Approved target-discovery observations

Observed facts from the 2026-04-22 approved target-discovery capture:

- `GET /public-search` queries for Bitcoin/Ethereum Up or Down and hourly terms returned short-window historical or closed candidates.
- `GET /events/keyset?closed=false&limit=100&title_search=Bitcoin Up or Down` returned active/not-closed Bitcoin Up/Down events tagged `5M`.
- `GET /events/keyset?closed=false&limit=100&title_search=Ethereum Up or Down` returned active/not-closed Ethereum Up/Down events tagged `5M`.
- Observed `5M` Up/Down markets use `outcomes` equal to JSON-encoded `["Up","Down"]`, not `["Yes","No"]`.
- A Bitcoin hourly sample was observed with a `1H` tag, but it was closed.
- An Ethereum `15M` sample was observed, but it was closed.
- Searches for `Bitcoin 10 minute`, `Ethereum 10 minute`, `BTC 10m`, and `ETH 10m` did not produce target 10m hits in the approved request set.
- The approved target-discovery fixtures do not expose a reference/start/strike level, settlement
  value source, comparator, or tie rule for Up/Down payoff evaluation.

Project decisions from the target-discovery review:

- Live BTC/ETH 10m/1h classification remains closed.
- The observed `5M` / `15M` / closed `1H` evidence is useful taxonomy evidence, but it is not sufficient for Phase 1 target scope.
- The internal `EventMarket` contract uses generic binary outcomes rather than Yes/No-only tokens. Observed Up/Down outcomes can be represented as labeled binary outcomes, but this does not by itself open live BTC/ETH 10m/1h discovery.
- Up/Down labels must not be treated as a complete payoff specification. Non-placeholder pricing
  remains fail-closed until payoff, reference level, settlement source, comparator, and tie rule are
  confirmed. See `docs/api/polymarket-updown-payoff-research.md`.
- No live adapter classification rule was added.

### Minimum discovery objects

Verified upstream objects:

- Event: container grouping one or more related markets. Official responses include fields such as `id`, `slug`, `title`, `description`, `startDate`, `endDate`, `active`, `closed`, `archived`, `liquidity`, `volume`, and nested `markets`.
- Market: fundamental tradable unit. Official concept docs describe Yes/No token IDs, while approved runtime fixtures also show target-family markets with `["Up","Down"]` labels. Official responses include fields such as `id`, `question`, `conditionId`, `slug`, `startDate`, `endDate`, `active`, `closed`, `enableOrderBook`, `questionID`, `clobTokenIds`, `outcomes`, `outcomePrices`, `bestBid`, `bestAsk`, `lastTradePrice`, `spread`, `volumeNum`, `liquidityNum`, and nested relations.
- Tag: categorization object with `id`, `label`, and `slug`.
- CLOB token/asset ID: ERC1155 token ID used for CLOB order book and pricing reads.
- CLOB order book snapshot: public read response keyed by token ID, including `market`, `asset_id`, `timestamp`, `bids`, `asks`, `min_order_size`, `tick_size`, `neg_risk`, and `last_trade_price`.

Project decision:

- Internal `EventMarket` is a normalized candidate created from one Gamma Market plus its containing Gamma Event context.
- An `EventMarket` is not valid for Phase 1 unless it can be associated with exactly one supported asset (`BTC` or `ETH`) and exactly one supported window (`10m` or `1h`) with explicit provenance.

## Candidate discovery flow draft

This is a design sequence, not implementation.

1. Discover candidate universe through Gamma.
   - Preferred broad path: events keyset listing with active/not-closed filtering.
   - Secondary path: tags list, then events/markets filtered by confirmed tag IDs or tag slugs.
   - Secondary path: public search for candidate terms only after query semantics are documented in this file.
2. Extract nested markets from each event.
3. Keep only market candidates that are public-read relevant:
   - market is active;
   - market is not closed;
   - market has `enableOrderBook` true;
   - market exposes a condition ID and a CLOB-token source.
4. Classify internal asset and window.
   - `BTC` / `ETH` must come from confirmed source fields or documented classifier evidence.
   - `10m` / `1h` must come from confirmed source fields or documented classifier evidence.
5. Normalize a candidate `EventMarket` with source provenance.
6. Optionally read public CLOB snapshots after candidate acceptance:
   - order book by token ID;
   - best bid/ask through price endpoint;
   - midpoint;
   - price history for replay/stats, not primary chart signal overlays.

## Field mapping draft

This table is a draft contract for the future adapter. It records source candidates and uncertainty; it is not implementation.

| Internal field | Upstream source candidates | Status |
| --- | --- | --- |
| `venue` | Constant project value `polymarket` | Project decision |
| `asset` | TODO: derive from confirmed tag, search result, slug/title/question text, or other official metadata. Live public-search sample shows Bitcoin/Ethereum event tags, but this is not yet a canonical rule for target-window discovery. | Partly observed; not confirmed as adapter rule |
| `window` | TODO: derive from confirmed event/market text, slug, timing metadata, tag evidence, or other official metadata. Target-discovery samples observed `5M`, `15M`, and closed `1H`; no live `10m` or active `1h` target evidence was found. | Not confirmed for Phase 1 target scope |
| `eventId` | Gamma Event `id` | Confirmed field exists |
| `eventSlug` | Gamma Event `slug` | Confirmed field exists |
| `eventTitle` | Gamma Event `title` | Confirmed field exists |
| `eventDescription` | Gamma Event `description` | Confirmed field exists |
| `eventStartAt` | Gamma Event `startDate` | Confirmed field exists; exact business meaning for crypto windows TODO |
| `eventEndAt` | Gamma Event `endDate` | Confirmed field exists; exact business meaning for crypto windows TODO |
| `eventActive` | Gamma Event `active` | Confirmed field exists |
| `eventClosed` | Gamma Event `closed` | Confirmed field exists |
| `eventArchived` | Gamma Event `archived` | Confirmed field exists |
| `marketId` | Gamma Market `id` | Confirmed field exists |
| `marketSlug` | Gamma Market `slug` | Confirmed field exists |
| `question` | Gamma Market `question` | Confirmed field exists |
| `conditionId` | Gamma Market `conditionId`; CLOB order book `market`; CLOB market-by-token `condition_id` | Confirmed field exists |
| `questionId` | Gamma Market `questionID` | Confirmed field exists |
| `enableOrderBook` | Gamma Market `enableOrderBook` | Confirmed field exists |
| `acceptingOrders` | Gamma Market `acceptingOrders` | Confirmed field exists in API reference; not a permission to trade in this project |
| `marketActive` | Gamma Market `active` | Confirmed field exists |
| `marketClosed` | Gamma Market `closed` | Confirmed field exists |
| `marketStartAt` | Gamma Market `startDate` or `startDateIso` | Confirmed fields exist; canonical choice TODO |
| `marketEndAt` | Gamma Market `endDate` or `endDateIso` | Confirmed fields exist; canonical choice TODO |
| `outcomeType` | Internal project contract | Project decision: `EventMarket` currently supports only `"binary"` markets. This is not a general multi-outcome model. |
| `outcomes.primary.tokenId` | Gamma Market `clobTokenIds`; CLOB market-by-token `primary_token_id` later TODO | Token IDs confirmed; approved samples observed `clobTokenIds` as JSON-encoded strings. Adapter maps the first parsed token to the first parsed outcome label without renaming it to YES. Stability across target 10m/1h markets TODO |
| `outcomes.secondary.tokenId` | Gamma Market `clobTokenIds`; CLOB market-by-token `secondary_token_id` later TODO | Token IDs confirmed; approved samples observed `clobTokenIds` as JSON-encoded strings. Adapter maps the second parsed token to the second parsed outcome label without renaming it to NO. Stability across target 10m/1h markets TODO |
| `outcomes.primary.label` / `outcomes.secondary.label` | Gamma Market `outcomes` or `shortOutcomes` | Approved samples observed labels as JSON-encoded strings including `["Yes","No"]` and `["Up","Down"]`. The adapter preserves labels; it does not infer trading direction, fair value semantics, or strategy side from the label. |
| `outcomePrices` | Gamma Market `outcomePrices` | Approved sample observed `outcomePrices` as JSON-encoded string; canonical use TODO |
| `liquidity` | Gamma Event `liquidity`; Gamma Market `liquidity`, `liquidityNum`, `liquidityClob`; CLOB order book depth | Confirmed fields exist; canonical metric TODO |
| `volume` | Gamma Event `volume`, `volume24hr`; Gamma Market `volume`, `volumeNum`, `volume24hr`, `volumeClob` | Confirmed fields exist; canonical metric TODO |
| `bestBid` | Gamma Market `bestBid`; CLOB `GET /price` with `side=BUY`; CLOB order book top bid | Confirmed public-read sources exist; canonical source TODO |
| `bestAsk` | Gamma Market `bestAsk`; CLOB `GET /price` with `side=SELL`; CLOB order book top ask | Confirmed public-read sources exist; canonical source TODO |
| `midpoint` | CLOB `GET /midpoint` by token ID | Confirmed public-read source exists |
| `lastTradePrice` | Gamma Market `lastTradePrice`; CLOB order book `last_trade_price` | Confirmed fields exist; canonical source TODO |
| `spread` | Gamma Market `spread`; derived from best bid/ask; CLOB spread endpoint exists in navigation but not reviewed in this slice | Partly confirmed; derivation policy TODO |
| `tags` | Gamma nested Market/Event `tags`; `GET /tags`; event/market tag endpoints | Confirmed fields exist; BTC/ETH tag identity TODO |
| `sourceProvenance` | Source URL, endpoint family, upstream object id/slug, verification date, fixture id | Project decision |

Important conflict to resolve:

- The API reference examples show `clobTokenIds` as a string field in market responses, while the official quickstart describes `clobTokenIds` as a Yes/No token ID array. The 2026-04-21 and 2026-04-22 promoted Gamma samples observed JSON-encoded strings. The adapter accepts both direct arrays and JSON-encoded arrays, but only maps tokens after exactly two outcome labels parse successfully.
- The 2026-04-22 target-discovery samples observed Up/Down markets where `outcomes` parse as `["Up", "Down"]`. These can now be represented by `EventMarket.outcomes.primary/secondary`, but classification remains fail closed until BTC/ETH and 10m/1h evidence is confirmed.

## Public read adapter interface draft

This is the intended adapter surface. The repository currently implements only the minimal subset needed by the fixture-backed read-only flow: event-market discovery, market lookup from the current result set, and order-book read by token ID.

```ts
type SupportedAsset = "BTC" | "ETH";
type SupportedWindow = "10m" | "1h";

interface PolymarketPublicReadAdapter {
  discoverEventMarkets(input: {
    assets: SupportedAsset[];
    windows: SupportedWindow[];
    status: "active";
    page?: { cursor?: string; limit?: number };
  }): Promise<{
    markets: EventMarketCandidate[];
    nextCursor?: string;
    uncertainty: string[];
  }>;

  getEventBySlug(slug: string): Promise<PolymarketEventEnvelope>;
  getMarketBySlug(slug: string): Promise<PolymarketMarketEnvelope>;

  getOrderBook(tokenId: string): Promise<PolymarketOrderBookSnapshot>;
  getBestPrice(input: { tokenId: string; side: "BUY" | "SELL" }): Promise<PolymarketBestPrice>;
  getMidpoint(tokenId: string): Promise<PolymarketMidpoint>;
  getPriceHistory(input: {
    tokenId: string;
    startTs?: number;
    endTs?: number;
    interval?: "1m" | "1h" | "6h" | "1d" | "1w" | "all" | "max";
    fidelityMinutes?: number;
  }): Promise<PolymarketPriceHistory>;
}
```

Adapter constraints:

- No method for order placement, order cancellation, wallet funding, settlement, withdrawals, or authenticated user data.
- No API keys, private keys, wallet addresses, signatures, or credentials in configuration.
- Every returned normalized object must carry provenance and uncertainty.
- Runtime parsing must preserve raw upstream objects in fixtures until schemas are validated.

TODO:

- Decide whether `getEventBySlug` and `getMarketBySlug` are required in v1 or only useful for debugging/manual fixture capture.
- Decide whether CLOB public read methods belong in the same adapter or a separate `PolymarketClobPublicReadAdapter`.

## Contract tests plan

Version 1 tests should use local fixtures only. Live vendor calls must be opt-in and are not part of default test runs.

Fixture capture plan: see `docs/runbooks/polymarket-fixture-capture.md`.

### Fixture coverage

- Event list fixture with one event containing one market.
- Event list fixture with one event containing multiple markets.
- Market list fixture with market-level fields but no enclosing event.
- Tag fixture with `id`, `label`, and `slug`.
- CLOB order book fixture for one token ID.
- Price/midpoint/history fixtures for one token ID.
- Negative fixture where `clobTokenIds` cannot be parsed safely.
- Negative fixture where asset/window classification cannot be proven.

### Assertions

- Discovery never emits candidates without source provenance.
- Discovery never emits candidates outside `BTC`, `ETH`, `10m`, or `1h`.
- Discovery marks candidates uncertain instead of guessing asset/window from weak text evidence.
- Event/market ID, slug, question, condition ID, active/closed status, and order-book availability are preserved.
- Markets with `enableOrderBook !== true` are rejected or marked not tradable for CLOB public reads.
- Binary outcome extraction succeeds only when exactly two token IDs and exactly two outcome labels are parseable.
- Binary outcome extraction fails closed when `clobTokenIds`, `outcomes`, or their two-item shape is ambiguous. This is now covered by promoted live public Gamma samples.
- Observed Up/Down target-family samples parse as binary outcomes, but remain rejected from live discovery when order-book availability, active/open status, or BTC/ETH 10m/1h classification is not proven.
- CLOB read snapshots are attached only after a candidate has token IDs.
- No adapter contract exposes order placement, cancellation, wallet, private-key, or authenticated user operations.
- Pagination contract supports keyset `nextCursor` without offset.

### Optional later smoke tests

- TODO: Add live public-read smoke tests only behind an explicit environment flag after fixture tests exist.
- TODO: Rate-limit behavior should be tested with local retry/backoff simulation, not by intentionally exceeding Polymarket limits.
- TODO: Capture positive BTC/ETH 10m/1h public-read fixtures only after explicit approval for live network calls.

## Explicit non-goals

- No live Polymarket calls without explicit approval.
- No private/authenticated Polymarket endpoints.
- No real scanner scoring.
- No Market Detail page or expanded frontend workflow in this slice.
- No pricing model.
- No paper broker.
- No replay engine.
- No authenticated CLOB endpoints.
- No Data API integration in this slice.

## TODO / unresolved items

- TODO: Confirm the official way to identify BTC and ETH event markets. Candidate sources are tags, slugs, titles, questions, and search results, but none is confirmed as canonical.
- TODO: Confirm the official way to identify 10m and 1h windows. Candidate sources are event/market text and dates, but no canonical interval field has been confirmed.
- TODO: Confirm whether `GET /events/keyset` supports all filters needed for active BTC/ETH 10m/1h discovery or whether `GET /events` / `GET /markets/keyset` is required.
- TODO: Confirm whether the observed JSON-string runtime shape and binary ordering for `clobTokenIds`, `outcomes`, and `outcomePrices` holds for the actual BTC/ETH 10m/1h market family.
- TODO: Confirm whether Polymarket currently exposes BTC/ETH 10m markets through Gamma/public-search. The 2026-04-22 approved request set found no 10m target hits.
- TODO: Confirm whether active BTC/ETH 1h target markets are discoverable through Gamma/public-search. The 2026-04-22 approved request set found a closed Bitcoin `1H` sample only.
- TODO: Confirm whether CLOB `primary_token_id` and `secondary_token_id` ordering aligns with Gamma `clobTokenIds` and `outcomes` for all relevant binary markets before using CLOB market-by-token for normalization.
- TODO: Confirm canonical liquidity and volume fields for opportunity scanning later.
- TODO: Confirm if `bestBid`, `bestAsk`, `lastTradePrice`, and `spread` from Gamma are sufficiently fresh, or if CLOB public reads must be mandatory for live opportunity scans.
- TODO: Confirm price history granularity and retention for replay/stats before any replay implementation.
