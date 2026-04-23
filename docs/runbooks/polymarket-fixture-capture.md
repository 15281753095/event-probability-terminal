# Polymarket Fixture Capture Runbook

Status: Gamma/public-search capture completed once with explicit approval on 2026-04-21 Asia/Shanghai. Do not run additional live network capture without explicit approval.

## Purpose

Fixtures are required before implementing or changing the Polymarket public read adapter. They verify that normalization is based on observed public responses instead of guessed fields.

## Scope

Allowed fixture sources:

- Polymarket Gamma public read endpoints for events, markets, tags, and public search.
- Polymarket CLOB public read endpoints for order book, best price, midpoint, market-by-token, and price history.

Forbidden fixture sources:

- Authenticated CLOB endpoints.
- Orders, order cancellation, user orders, balances, wallet, bridge, relayer, private keys, signatures, or API credentials.
- Predict.fun or Binance Wallet data.

## Storage Layout

Future fixtures should live under:

```text
services/market-ingestor/fixtures/polymarket/
  README.md
  live-public-gamma-samples.json
  gamma-events-keyset-active-page-1.json
  gamma-markets-keyset-active-page-1.json
  gamma-tags-page-1.json
  gamma-public-search-btc.json
  gamma-public-search-eth.json
  clob-book-token-sample.json
  clob-price-token-sample.json
  clob-midpoint-token-sample.json
  clob-prices-history-token-sample.json
  negative-ambiguous-token-ids.json
  negative-unclassified-asset-window.json
```

Temporary raw captures should first go under:

```text
services/market-ingestor/fixtures/polymarket/live-capture-tmp/
```

The temporary directory is ignored by git. Promote only reviewed, redacted, documented fixtures into tracked fixture files.

Current promoted fixture:

```text
services/market-ingestor/fixtures/polymarket/live-public-gamma-samples.json
services/market-ingestor/fixtures/polymarket/live-target-discovery-samples.json
```

These contain minimal reviewed subsets from approved Gamma/public-search captures. They do not include CLOB book, midpoint, price, or history samples.

## Naming Rules

- Prefix with the API family: `gamma` or `clob`.
- Include endpoint intent, not implementation details.
- Include the asset/window only if the classification is verified inside the fixture notes.
- Use `negative-` for fail-closed fixtures.

## Sample Requirements

Minimum positive fixtures:

- One active BTC candidate that is believed to be a 10m market, with raw evidence retained.
- One active BTC candidate that is believed to be a 1h market, with raw evidence retained.
- One active ETH candidate that is believed to be a 10m market, with raw evidence retained.
- One active ETH candidate that is believed to be a 1h market, with raw evidence retained.
- One event containing a single market.
- One event containing multiple markets.
- One market with `enableOrderBook` true and token IDs.
- One CLOB order book for a token ID from an accepted candidate.
- One CLOB price or midpoint response for the same token ID.

Minimum negative fixtures:

- Market with missing token IDs.
- Market with `enableOrderBook` false.
- Market where `clobTokenIds` shape or ordering cannot be safely parsed.
- Market where asset cannot be classified as BTC or ETH.
- Market where window cannot be classified as 10m or 1h.

## Capture Metadata

Each captured fixture should include a sidecar note or wrapper metadata with:

- source id from `docs/source_registry.md`;
- source URL;
- capture timestamp;
- query parameters;
- whether the fixture is positive or negative;
- expected classification result;
- known uncertainties;
- redaction statement.

Recommended wrapper shape:

```json
{
  "metadata": {
    "fixtureKind": "live_public_capture",
    "sourceId": "polymarket-events-keyset",
    "sourceUrl": "https://gamma-api.polymarket.com/events/keyset",
    "capturedAt": "TODO",
    "query": "TODO",
    "classificationStatus": "unconfirmed",
    "redaction": "No auth headers, cookies, wallet data, or private credentials are present.",
    "uncertainty": ["TODO"]
  },
  "raw": {}
}
```

## Redaction Rules

- Do not store API keys, private keys, signatures, cookies, wallet credentials, or auth headers.
- Public market IDs, condition IDs, token IDs, slugs, prices, sizes, and timestamps may be stored.
- If a future tool captures response headers, remove cookies, request IDs if sensitive, and all auth-related headers.

## Contract Test Use

Fixtures should prove:

- normalization preserves event/market identity and provenance;
- unsupported assets/windows fail closed;
- ambiguous token IDs fail closed;
- CLOB snapshots are attached only after token IDs are safely parsed;
- scanner placeholders are clearly marked as placeholders.

## Approval Gate

Live fixture capture requires explicit user approval before running any network command.

Request approval with:

- command to be run;
- exact endpoint family;
- reason;
- expected fixture path;
- redaction plan.

## Candidate Live Capture Commands

These commands are read-only public calls. They were run once with explicit approval on 2026-04-21 and must not be rerun without explicit approval.

Create a temporary capture directory:

```bash
mkdir -p services/market-ingestor/fixtures/polymarket/live-capture-tmp
```

Capture Gamma active events through keyset pagination:

```bash
curl -fsS "https://gamma-api.polymarket.com/events/keyset?closed=false&limit=50" \
  -o services/market-ingestor/fixtures/polymarket/live-capture-tmp/gamma-events-keyset-active-page-1.raw.json
```

Capture Gamma active markets through keyset pagination:

```bash
curl -fsS "https://gamma-api.polymarket.com/markets/keyset?closed=false&limit=50&include_tag=true" \
  -o services/market-ingestor/fixtures/polymarket/live-capture-tmp/gamma-markets-keyset-active-page-1.raw.json
```

Capture Gamma tags:

```bash
curl -fsS "https://gamma-api.polymarket.com/tags?limit=200" \
  -o services/market-ingestor/fixtures/polymarket/live-capture-tmp/gamma-tags-page-1.raw.json
```

Capture public search candidates:

```bash
curl -fsS --get --data-urlencode "q=Bitcoin" "https://gamma-api.polymarket.com/public-search" \
  -o services/market-ingestor/fixtures/polymarket/live-capture-tmp/gamma-public-search-bitcoin.raw.json

curl -fsS --get --data-urlencode "q=Ethereum" "https://gamma-api.polymarket.com/public-search" \
  -o services/market-ingestor/fixtures/polymarket/live-capture-tmp/gamma-public-search-ethereum.raw.json
```

Capture CLOB order book only after a reviewed candidate yields a token ID:

```bash
YES_TOKEN_ID="<token-id-from-reviewed-candidate>"
curl -fsS --get --data-urlencode "token_id=${YES_TOKEN_ID}" "https://clob.polymarket.com/book" \
  -o services/market-ingestor/fixtures/polymarket/live-capture-tmp/clob-book-token-sample.raw.json
```

TODO: Add exact CLOB price, midpoint, and price-history capture commands only after re-checking the official endpoint paths immediately before execution.

## 2026-04-21 Capture Result

Captured and reviewed raw files during the approved run. Raw files were kept only in ignored local temp storage during review; the repository retains the promoted fixture subset:

- `gamma-events-keyset-active-page-1.raw.json`: 50 events, `next_cursor` present.
- `gamma-markets-keyset-active-page-1.raw.json`: 50 markets, `next_cursor` present.
- `gamma-tags-page-1.raw.json`: 200 tags.
- `gamma-public-search-bitcoin.raw.json`: 5 events plus pagination metadata.
- `gamma-public-search-ethereum.raw.json`: 5 events plus pagination metadata.

Promoted tracked fixture:

- `live-public-gamma-samples.json`

Confirmed by promoted fixture:

- Gamma keyset responses carry cursor metadata.
- Public-search responses carry pagination metadata.
- Sampled market objects include `conditionId`, `questionID`, `enableOrderBook`, date fields, top-of-book style fields, liquidity, volume, `clobTokenIds`, `outcomes`, and `outcomePrices`.
- Sampled `clobTokenIds`, `outcomes`, and `outcomePrices` are JSON-encoded strings.
- Sampled `outcomes` parse as binary label arrays. Promoted samples include `["Yes", "No"]` and observed target-family samples include `["Up", "Down"]`.
- Public-search samples include Bitcoin and Ethereum asset evidence in event tags.

Not confirmed:

- BTC/ETH 10m or 1h market discovery.
- A canonical asset classification rule for the target market family.
- A canonical window classification rule for 10m or 1h.
- CLOB book, midpoint, price, or price-history response shape.

## Tests That Will Consume Promoted Fixtures

After review, promoted fixtures should tighten:

- `services/market-ingestor/tests/polymarket-adapter.test.ts`
- binary outcome extraction tests for observed `clobTokenIds` and `outcomes` string shapes;
- classification tests for BTC/ETH evidence;
- classification tests for 10m/1h evidence;
- negative tests proving unsupported or unclassified markets fail closed.

## Current Unconfirmed Classification Points

- TODO: Confirm canonical BTC and ETH identification source: tag, search result type, slug/title/question text, or other metadata.
- TODO: Confirm canonical 10m and 1h identification source: tag, market text, event text, date interval, or other metadata.
- TODO: Confirm whether `events/keyset` alone is sufficient or whether `markets/keyset`, tags, and search must be combined.
- TODO: Confirm runtime `clobTokenIds` shape and whether ordering maps safely to Gamma outcome labels for the relevant markets.
- TODO: Confirm whether order-book top-of-book should supersede Gamma `bestBid` / `bestAsk` for scanner display.

## 2026-04-22 Target Discovery Result

Approved request set:

- `GET /public-search?q=Bitcoin Up or Down`
- `GET /public-search?q=Ethereum Up or Down`
- `GET /public-search?q=Bitcoin hourly`
- `GET /public-search?q=Ethereum hourly`
- `GET /public-search?q=BTC hourly`
- `GET /public-search?q=ETH hourly`
- `GET /public-search?q=Bitcoin 10 minute`
- `GET /public-search?q=Ethereum 10 minute`
- `GET /public-search?q=BTC 10m`
- `GET /public-search?q=ETH 10m`
- `GET /events/keyset?closed=false&limit=100&title_search=Bitcoin Up or Down`
- `GET /events/keyset?closed=false&limit=100&title_search=Ethereum Up or Down`

Promoted tracked fixture:

- `live-target-discovery-samples.json`

Confirmed by promoted fixture:

- BTC/ETH Up/Down target family exists in Gamma/public-search evidence.
- Active/not-closed BTC and ETH Up/Down samples were found with `5M` tags through `events/keyset` title search.
- A closed Bitcoin sample was found with a `1H` tag.
- A closed Ethereum sample was found with a `15M` tag.
- Observed `5M` and `15M` Up/Down samples use `outcomes` as JSON-encoded `["Up","Down"]`.

Not confirmed:

- No BTC/ETH 10m target hit was found in the approved request set.
- No active BTC/ETH 1h target market was found in the approved request set.
- The `EventMarket` contract now preserves generic binary outcome labels, so `Up`/`Down` can be represented without renaming those labels to Yes/No.
- The live BTC/ETH 10m/1h discovery rule still remains fail closed because the approved evidence did not confirm active target 10m/1h discovery.

## 2026-04-23 Up/Down Payoff Evidence Result

Approved request count: 12.

Approved endpoint families:

- `GET /events/keyset`
- `GET /public-search`

Promoted tracked fixture:

- `live-updown-payoff-evidence-samples.json`

Confirmed by promoted fixture:

- Observed active BTC and ETH `5M` Up/Down samples include payoff wording in Gamma descriptions.
- For observed `5M` Chainlink samples, `Up` means the price at the end of the title time range is greater than or equal to the price at the beginning; otherwise the market resolves to `Down`.
- Observed `5M` samples expose Chainlink BTC/USD and ETH/USD `resolutionSource` URLs.
- Closed `5M` samples expose `eventMetadata.finalPrice` and `eventMetadata.priceToBeat` field names.

Not confirmed:

- No active BTC/ETH `10m` target market was confirmed.
- No active BTC/ETH `1h` target market was confirmed.
- `eventMetadata.finalPrice` and `eventMetadata.priceToBeat` are not yet confirmed as stable documented schema fields.
- Active numeric reference/start value extraction is not confirmed.
- Runtime payoff extraction and non-placeholder pricing remain out of scope.
