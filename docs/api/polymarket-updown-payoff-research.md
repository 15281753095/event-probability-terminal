# Polymarket Up/Down Payoff Research Contract

Status: research contract only; extraction is not implemented.

Date: 2026-04-23 Asia/Shanghai

## Scope

This document defines the minimum evidence required before Polymarket Up/Down markets can be used
for non-placeholder pricing. It covers only public-read Polymarket Gamma/public-search evidence
already present in the repository. It does not authorize new network calls, CLOB reads, private
endpoints, trading, settlement actions, or wallet operations.

## Existing Evidence

Observed from:

- `services/market-ingestor/fixtures/polymarket/live-target-discovery-samples.json`
- `services/market-ingestor/fixtures/polymarket/live-updown-payoff-evidence-samples.json`

| Evidence | Current status |
| --- | --- |
| BTC and ETH Up/Down target-family titles/questions | Observed for 5M samples |
| `["Up","Down"]` outcome labels | Observed for 5M and 15M samples |
| Tags such as `Up or Down`, `Crypto Prices`, `Bitcoin`, `Ethereum`, `5M`, `15M`, and one closed `1H` sample | Observed |
| Market/event activity and closed flags | Observed |
| `endDate` fields | Observed |
| `clobTokenIds` and `outcomes` as JSON-encoded strings | Observed |
| Active BTC/ETH `10m` or active BTC/ETH `1h` target market | Not observed in approved samples |
| 5M payoff wording | Observed for active BTC/ETH Chainlink samples |
| 5M resolution source | Observed as Chainlink BTC/USD and ETH/USD data-stream URLs |
| 5M comparator and tie rule | Observed for active 5M samples: `Up` if end price is greater than or equal to beginning price; otherwise `Down` |
| Closed 5M reference/settlement-like metadata | `eventMetadata.priceToBeat` and `eventMetadata.finalPrice` observed, but schema semantics are unconfirmed |
| Active 10m or active 1h payoff wording | Not observed |
| Active-market reference/start/strike numeric value | Not observed |
| Official underlying spot source | Not observed |

## Domain Contract

The minimum Up/Down payoff model is a binary reference-comparison contract:

- `underlyingAsset`: `BTC` or `ETH`.
- `outcomeLabels`: labels preserved from the normalized `EventMarket`.
- `referenceLevel`: the baseline value used for comparison. For observed 5M Chainlink samples,
  this is the beginning price of the title time range.
- `settlementLevel`: the value observed at the settlement evaluation point. For observed 5M
  Chainlink samples, this is the end price of the title time range.
- `comparisonRule`: the comparator that maps each outcome to win/loss. For observed 5M Chainlink
  samples, `Up` maps to end price greater than or equal to beginning price.
- `tieRule`: the official handling when settlement level equals reference level. For observed 5M
  Chainlink samples, equality resolves to `Up`.

This contract is distinct from the runtime `EventMarket` contract. `EventMarket` can represent
binary labels; it does not prove the payoff rule.

## Reference, Start, Strike, And Settlement

These values must remain separate:

| Concept | Meaning | Current evidence |
| --- | --- | --- |
| Reference level | Generic baseline used by a payoff comparison | Observed semantically for 5M Chainlink samples; numeric active value missing |
| Start price | Reference level captured at an interval start | Observed semantically for 5M Chainlink samples |
| Strike/threshold | Fixed numeric level used by price-threshold markets | Separate concept; not proven for current Up/Down fixtures |
| Settlement evaluation point | Time/window used to evaluate the final outcome | Observed semantically as the title time-range end for 5M Chainlink samples |
| Settlement level | Price/value observed at the evaluation point | Observed semantically for 5M; closed metadata field names observed, schema TODO |

The project must not collapse these concepts into one field. A start price can be a reference
level, and a strike can be a reference level, but they are not interchangeable without evidence.

## Extraction Contract Draft

```ts
interface UpDownPayoffExtractionResearch {
  source: {
    venue: "polymarket";
    gammaEventId?: string;
    gammaMarketId: string;
    sourceFixtureIds: string[];
  };
  marketContext: {
    question: string;
    asset: "BTC" | "ETH" | "required_missing";
    window: "10m" | "1h" | "required_missing";
    outcomes: {
      primary: string;
      secondary: string;
    };
  };
  observedEvidence: {
    titleOrQuestion?: string;
    tags?: string[];
    startDate?: string;
    endDate?: string;
    description?: string;
  };
  payoffSpec: {
    kind: "up_down_reference_comparison";
    evidenceStatus: "observed" | "required_missing" | "ambiguous";
    referenceLevel: {
      kind: "start_price" | "reference_price" | "strike" | "required_missing";
      value?: number;
      observedAt?: string;
      source?: string;
      evidenceStatus: "observed" | "required_missing" | "ambiguous";
    };
    settlementLevel: {
      evaluationAt?: string;
      valueSource?: string;
      evidenceStatus: "observed" | "required_missing" | "ambiguous";
    };
    comparator: "end_price_gte_beginning_price" | "required_missing";
    tieRule: "primary_wins_on_equal" | "required_missing";
  };
  failClosedReasons: string[];
}
```

This draft is intentionally not exported from `packages/shared-types`. It is a research contract
for future extraction tests.

## Possible Upstream Evidence Fields

| Needed value | Possible upstream evidence | Current status |
| --- | --- | --- |
| Outcome labels | Gamma market `outcomes` | Observed |
| Outcome tokens | Gamma market `clobTokenIds` | Observed |
| Asset | Tags/title/question | Partly observed; canonical rule TODO |
| Window | Tags/title/question/date range | Partly observed for 5M, 15M, closed 1H; 10m/live 1h TODO |
| 5M reference/start level semantics | Market/event description | Observed for 5M Chainlink samples |
| Active numeric reference/start value | Gamma field or another confirmed public source | Missing |
| Closed reference/settlement-like values | `eventMetadata.priceToBeat` / `eventMetadata.finalPrice` | Observed field names; schema semantics TODO |
| Settlement evaluation point | Market/event dates and description | Observed for 5M Chainlink samples |
| Settlement value source | `resolutionSource` and description | Observed for 5M Chainlink samples |
| Tie rule | Market/event description | Observed for 5M Chainlink samples |

## Fail-Closed Rule

Future extraction must return no non-placeholder payoff specification when any required evidence is
missing or ambiguous:

- payoff kind is not confirmed;
- outcome mapping is not exactly binary or label order is ambiguous;
- underlying asset is not confirmed as BTC or ETH;
- target window is not confirmed as 10m or 1h;
- reference/start/strike level semantics are missing;
- numeric reference/start value is required for the quote path and missing;
- settlement evaluation point is missing;
- settlement value source is missing;
- comparator or tie rule is missing;
- observed payoff evidence belongs only to 5M or another non-target family;
- required source timestamps are missing or stale.

In those cases the scanner may show the market as fixture-backed market data only, but pricing must
remain placeholder or unavailable.

## Implementation Gate

Pricing-engine v1 implementation for Up/Down markets is blocked until:

- public-read evidence identifies live BTC/ETH 10m/1h target markets;
- fixture-backed extraction proves the payoff rule for the target 10m/1h family, not only 5M;
- reference/start/strike level and observation timestamp are available;
- settlement evaluation point and settlement value source are available;
- tie rule is documented;
- timestamped market snapshots and underlying price snapshots exist;
- replay/backtest input shape can join market snapshots, reference levels, and final outcomes.

## TODO

- TODO: Confirm whether the 5M Chainlink rule pattern applies to actual BTC/ETH 10m markets if
  those markets exist.
- TODO: Confirm whether active 1h Up/Down target markets use the 5M Chainlink rule, the older
  Binance open/close candle pattern, or another rule.
- TODO: Confirm whether Gamma `eventMetadata.priceToBeat` and `eventMetadata.finalPrice` are
  stable, documented public fields.
- TODO: Confirm whether another public-read source is required for active reference/start values.
- TODO: Add positive and negative extraction fixtures before writing runtime extraction code.
