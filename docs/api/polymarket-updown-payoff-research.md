# Polymarket Up/Down Payoff Research Contract

Status: research contract only; extraction is not implemented.

Date: 2026-04-23 Asia/Shanghai

## Scope

This document defines the minimum evidence required before Polymarket Up/Down markets can be used
for non-placeholder pricing. It covers only public-read Polymarket Gamma/public-search evidence
already present in the repository. It does not authorize new network calls, CLOB reads, private
endpoints, trading, settlement actions, or wallet operations.

## Existing Evidence

Observed from `services/market-ingestor/fixtures/polymarket/live-target-discovery-samples.json`:

| Evidence | Current status |
| --- | --- |
| BTC and ETH Up/Down target-family titles/questions | Observed for 5M samples |
| `["Up","Down"]` outcome labels | Observed for 5M and 15M samples |
| Tags such as `Up or Down`, `Crypto Prices`, `Bitcoin`, `Ethereum`, `5M`, `15M`, and one closed `1H` sample | Observed |
| Market/event activity and closed flags | Observed |
| `endDate` fields | Observed |
| `clobTokenIds` and `outcomes` as JSON-encoded strings | Observed |
| Active BTC/ETH `10m` or active BTC/ETH `1h` target market | Not observed in approved samples |
| Reference/start/strike level | Not observed |
| Settlement value source | Not observed |
| Comparator and tie rule | Not observed |
| Official underlying spot source | Not observed |

## Domain Contract

The minimum Up/Down payoff model is a binary reference-comparison contract:

- `underlyingAsset`: `BTC` or `ETH`.
- `outcomeLabels`: labels preserved from the normalized `EventMarket`.
- `referenceLevel`: the baseline value used for comparison.
- `settlementLevel`: the value observed at the settlement evaluation point.
- `comparisonRule`: the comparator that maps each outcome to win/loss.
- `tieRule`: the official handling when settlement level equals reference level.

This contract is distinct from the runtime `EventMarket` contract. `EventMarket` can represent
binary labels; it does not prove the payoff rule.

## Reference, Start, Strike, And Settlement

These values must remain separate:

| Concept | Meaning | Current evidence |
| --- | --- | --- |
| Reference level | Generic baseline used by a payoff comparison | Required, missing |
| Start price | Reference level captured at an interval start | Possible interpretation for Up/Down, unconfirmed |
| Strike/threshold | Fixed numeric level used by price-threshold markets | Separate concept; not proven for current Up/Down fixtures |
| Settlement evaluation point | Time/window used to evaluate the final outcome | Required, missing |
| Settlement level | Price/value observed at the evaluation point | Required, missing |

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
    comparator: "required_missing";
    tieRule: "required_missing";
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
| Reference/start/strike level | Market question/title/description if present, or another confirmed public field/source | Missing |
| Settlement evaluation point | Market/event dates and official rules/source | Missing |
| Settlement value source | Official/public rule text or confirmed data source | Missing |
| Tie rule | Official/public rule text | Missing |

## Fail-Closed Rule

Future extraction must return no non-placeholder payoff specification when any required evidence is
missing or ambiguous:

- payoff kind is not confirmed;
- outcome mapping is not exactly binary or label order is ambiguous;
- underlying asset is not confirmed as BTC or ETH;
- target window is not confirmed as 10m or 1h;
- reference/start/strike level is missing;
- settlement evaluation point is missing;
- settlement value source is missing;
- comparator or tie rule is missing;
- required source timestamps are missing or stale.

In those cases the scanner may show the market as fixture-backed market data only, but pricing must
remain placeholder or unavailable.

## Implementation Gate

Pricing-engine v1 implementation for Up/Down markets is blocked until:

- public-read evidence identifies live BTC/ETH 10m/1h target markets;
- fixture-backed extraction proves the payoff rule;
- reference/start/strike level and observation timestamp are available;
- settlement evaluation point and settlement value source are available;
- tie rule is documented;
- timestamped market snapshots and underlying price snapshots exist;
- replay/backtest input shape can join market snapshots, reference levels, and final outcomes.

## TODO

- TODO: Identify the official/public source for Up/Down rule text.
- TODO: Confirm whether Gamma exposes enough fields for reference/start/strike extraction.
- TODO: Confirm whether another public-read source is required for reference and settlement levels.
- TODO: Add positive and negative extraction fixtures before writing runtime extraction code.
