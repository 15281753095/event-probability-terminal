# ADR 0005: Up/Down Payoff And Reference Level Contract

Status: Accepted

Date: 2026-04-23 Asia/Shanghai

## Context

Approved Polymarket Gamma/public-search fixtures show BTC/ETH target-family markets with
`["Up","Down"]` binary outcome labels. ADR 0002 moved `EventMarket` away from a Yes/No-only
contract, so these labels can be represented by `outcomes.primary` and `outcomes.secondary`.

That representation is not enough for pricing. A fair-probability model needs to know what makes
each outcome win. Current fixtures confirm labels, tags, dates, and market metadata, but they do
not confirm the payoff rule, reference/start price, settlement price source, exact evaluation
point, or tie rule for Up/Down markets.

## Decision

The project will treat Polymarket Up/Down markets as a binary reference-comparison contract, not as
a Yes/No alias.

The minimum research-level payoff specification is:

```ts
interface UpDownPayoffSpecificationResearch {
  kind: "up_down_reference_comparison";
  venue: "polymarket";
  underlyingAsset: "BTC" | "ETH";
  outcomeLabels: {
    primary: string;
    secondary: string;
  };
  comparison: {
    referenceLevel: ReferenceLevelResearch;
    settlementLevel: SettlementLevelResearch;
    primaryWinsWhen: "TODO_confirmed_comparator_required";
    secondaryWinsWhen: "TODO_confirmed_comparator_required";
    tieRule: "TODO_confirmed_tie_rule_required";
  };
  evidenceStatus: "observed" | "required_missing" | "ambiguous";
  evidence: string[];
  unresolvedAssumptions: string[];
}

interface ReferenceLevelResearch {
  kind: "start_price" | "reference_price" | "strike" | "required_missing";
  value?: number;
  observedAt?: string;
  source?: string;
  evidenceStatus: "observed" | "required_missing" | "ambiguous";
}

interface SettlementLevelResearch {
  evaluationAt?: string;
  valueSource?: string;
  evidenceStatus: "observed" | "required_missing" | "ambiguous";
}
```

This is a documentation contract only. It must not be added to runtime shared types until the
upstream evidence and fixture tests exist.

## Concept Boundaries

- Outcome label: upstream display text such as `Up`, `Down`, `Yes`, or `No`. A label alone is not a
  payoff rule.
- Market question semantics: human-readable title/question text. It is evidence, but not a stable
  machine contract unless supported by confirmed fields and fixtures.
- Payoff specification: the structured rule that maps each binary outcome to a winning condition.
- Reference level: the baseline price or value used for comparison.
- Start price: a reference level captured at or near the market interval start. It is not always
  the same as a fixed strike.
- Strike/threshold: a fixed numeric level in a threshold market. It may be different from an
  interval start/reference level.
- Settlement evaluation point: the time or window when the final comparison is evaluated.
- Settlement level: the observed price/value used at settlement evaluation time.

## Consequences

- `EventMarket.outcomes` may preserve Up/Down labels, but pricing-engine v1 cannot infer payoff
  direction from those labels alone.
- Up/Down markets must receive no non-placeholder quote unless payoff specification, reference
  level, settlement evaluation point, settlement value source, and tie rule are all confirmed.
- Existing scanner and pricing-engine v0 placeholder behavior remains valid.
- Future extraction logic must be fixture-backed and fail closed.

## Rejected Alternative

Treating `Up` as automatically equivalent to "settlement price greater than start price" and
`Down` as the opposite was rejected. That may be a reasonable human inference, but the current
approved fixtures do not prove comparator semantics, tie handling, reference price source, or
settlement source. Encoding that assumption now would make pricing outputs look more certain than
the evidence supports.

## TODO

- TODO: Capture or document an official/public source that exposes the Up/Down payoff rule.
- TODO: Confirm whether reference level, start price, or strike is exposed in Gamma fields,
  market text, or another public read source.
- TODO: Confirm settlement evaluation timestamp, settlement value source, and tie rule.
- TODO: Add fixture tests that prove extraction accepts confirmed examples and rejects missing or
  ambiguous payoff evidence.
