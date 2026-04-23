# Pricing Engine v1 Research Contract

Status: research only; not implemented.

Date: 2026-04-23 Asia/Shanghai

## Boundary

Pricing-engine v1 is a proposed research contract for a future fair-probability model. It is not
implemented in the repository.

V1 is allowed to estimate fair probabilities for Polymarket-first, read-only, BTC/ETH, binary
outcome markets. It is not allowed to submit orders, recommend automated trades, perform paper
broker accounting, or consume private/authenticated endpoints.

## Current Baseline

Current implementation:

- `POST /v0/fair-value`
- `modelVersion: "pricing-engine-v0-placeholder"`
- `fairProbabilityByOutcome.*.probability: null`
- `confidence: null`
- `isPlaceholder: true`

V1 must not be represented as implemented until probabilities are non-null, calibrated, and backed
by timestamped input data.

## V1 Request Draft

```ts
interface PricingQuoteRequestV1Research {
  market: EventMarket;
  requestedAt: string;
  marketSnapshot: {
    observedAt: string;
    bestBidPrimary?: number;
    bestAskPrimary?: number;
    spreadPrimary?: number;
    liquidity?: number;
    volume?: number;
    source: "gamma" | "clob_public";
  };
  payoffSpec: {
    kind: "up_down_reference_comparison";
    status: "observed" | "required_missing" | "ambiguous";
    primaryOutcomeRole: "primary";
    secondaryOutcomeRole: "secondary";
    referenceLevel?: {
      kind: "start_price" | "reference_price" | "strike";
      value: number;
      observedAt: string;
      source: string;
    };
    settlementLevel?: {
      evaluationAt: string;
      valueSource: string;
    };
    comparator?: string;
    tieRule?: string;
    unresolvedAssumptions: string[];
  };
  underlyingSnapshot: {
    asset: "BTC" | "ETH";
    price: number;
    observedAt: string;
    source: string;
  };
  volatilitySnapshot?: {
    value: number;
    lookbackSeconds: number;
    observedAt: string;
    source: string;
  };
  featureFreshness: {
    computedAt: string;
    marketSnapshotAgeMs: number;
    underlyingPriceAgeMs: number;
    referenceLevelAgeMs?: number;
    volatilityAgeMs?: number;
  };
}
```

This is a research draft. It should not be added to shared runtime types until the missing upstream
data contracts are confirmed.

For Polymarket Up/Down markets, see `docs/api/polymarket-updown-payoff-research.md`. The 2026-04-23
evidence makes the 5M Chainlink payoff wording research-observed, but the v1 request must not carry
`status: "observed"` for Phase 1 target 10m/1h unless payoff rule, reference level, settlement value
source, comparator, and tie rule are all fixture-backed for that target family.

## V1 Response Draft

```ts
interface FairValueSnapshotV1Research {
  marketId: string;
  outcomeType: "binary";
  fairProbabilityByOutcome: {
    primary: {
      outcomeRole: "primary";
      outcomeLabel: string;
      probability: number;
    };
    secondary: {
      outcomeRole: "secondary";
      outcomeLabel: string;
      probability: number;
    };
  };
  confidence: number;
  confidenceReasons: string[];
  reasons: string[];
  inputFeatures: PricingInputFeaturesV1Research;
  freshness: PricingFreshnessReportV1Research;
  validation: {
    calibrationDatasetId: string;
    modelVersion: string;
    metrics: {
      brierScore: number;
      logLoss: number;
    };
  };
  isPlaceholder: false;
  createdAt: string;
}
```

Requirements:

- `primary.probability` and `secondary.probability` must be finite numbers in `[0, 1]`.
- For binary markets, the two probabilities must sum to approximately `1.0`.
- `confidence` must describe model/input confidence, not trade conviction.
- `reasons` must explain the probability estimate, not recommend a trade.
- `validation.metrics` must refer to a documented validation run, not an ad hoc claim.

## Minimal Feature Set

| Feature | Definition | Possible source | Current status | V1 required |
| --- | --- | --- | --- | --- |
| Outcome labels | `outcomes.primary.label` and `outcomes.secondary.label` | Normalized `EventMarket` | Available | Yes |
| Outcome token IDs | Token IDs attached to each binary outcome | Normalized `EventMarket` | Available | Yes, for market-data joins |
| Market bid/ask | Current primary outcome bid and ask | Gamma now; CLOB public later | Partly available without freshness | Yes |
| Spread | Primary ask minus bid, or upstream spread | Gamma now; CLOB public later | Partly available without freshness | Yes |
| Liquidity | Market liquidity/depth proxy | Gamma fields; CLOB depth later | Partly available | Yes, for eligibility/confidence |
| Time to expiry | Difference between feature time and confirmed expiry | Event/market end time | Field exists; semantics TODO | Yes |
| Payoff specification | What makes primary/secondary win | Market question/rules or another confirmed public source | Observed for 5M Chainlink samples; target 10m/1h TODO | Yes |
| Reference level | Start/strike/reference price for up/down markets | Upstream market text/rules or external price capture | Semantic 5M evidence observed; active numeric value missing | Yes for Up/Down |
| Settlement rule | Evaluation point, value source, comparator, and tie rule | Official/public rule evidence | Observed for 5M Chainlink samples; target 10m/1h TODO | Yes for Up/Down |
| Underlying spot price | BTC/ETH current price near quote time | Future read-only market-data source | Missing | Yes |
| Volatility proxy | Recent realized or implied uncertainty proxy | Future read-only price history/source | Missing | Yes |

## Future Extensions Excluded From V1

- News and social signals.
- Cross-venue arbitrage.
- Predict.fun or Binance data.
- User positions.
- Wallet state.
- Paper broker fills.
- Strategy ranking or order sizing.

## Freshness Requirements

V1 must fail closed or return no non-placeholder quote when required freshness cannot be proven.

| Input | Target freshness | Current status | Failure behavior |
| --- | --- | --- | --- |
| Market snapshot | Observed within 15 seconds for 10m windows; 60 seconds for 1h windows | Missing source timestamps | No v1 quote |
| Underlying spot price | Observed within 5 seconds for 10m windows; 15 seconds for 1h windows | Missing | No v1 quote |
| Reference level | Must be tied to the market's official start/reference time | Missing | No v1 quote |
| Book/liquidity | Observed within 15 seconds when used for confidence | Missing CLOB fixture/path | Downgrade confidence or no quote |
| Feature recomputation | Computed after all required input timestamps | Not implemented | No v1 quote |

## Calibration And Validation

V1 implementation is blocked until these standards are documented and testable:

- Brier score over settled binary markets.
- Log loss over settled binary markets.
- Reliability diagram with probability buckets, initially 10 buckets if sample size supports it.
- Minimum sample policy before reporting calibration. Initial rule: TODO define, but do not publish
  calibration metrics from tiny samples.
- Time-split validation so later outcomes are not used to fit earlier quotes.
- Replay/backtest protocol with timestamped market snapshots and final outcomes.

Placeholder outputs are exempt from model calibration only because they do not claim to be model
probabilities. Any non-null probability must pass the validation gate.

## Preconditions For Implementation

Do not implement v1 model code until all are true:

- BTC/ETH live target discovery rules are confirmed.
- Required input data sources are documented from official or first-party sources where applicable.
- Timestamped fixtures or datasets exist for market snapshots and underlying prices.
- Payoff specification extraction is fail-closed.
- Up/Down reference/start/strike and settlement rule extraction is fixture-backed.
- Freshness checks are implemented at the data-contract level.
- Replay/backtest dataset shape is defined.
- Calibration metrics and reporting thresholds are documented.
