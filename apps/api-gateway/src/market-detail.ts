import type {
  EventMarket,
  EvidenceTrailItem,
  MarketDetailResponse,
  OrderBookSnapshot,
  PricingModelVersion,
  RelatedMarketSummary,
  ScannerCandidate,
  SourceProvenance,
  TokenTraceItem
} from "@ept/shared-types";
import { okMeta } from "./response-contract.js";

type PricingStatus = PricingModelVersion | "local-placeholder-fallback" | "unknown";

export type BuildMarketDetailInput = {
  market: EventMarket;
  sourceMode: SourceProvenance["sourceMode"];
  generatedAt: string;
  candidate?: ScannerCandidate;
  book?: OrderBookSnapshot;
  relatedMarkets?: EventMarket[];
  pricingStatus?: PricingStatus;
};

export function buildMarketDetailResponse(input: BuildMarketDetailInput): MarketDetailResponse {
  const openGaps = input.market.uncertainty.map((item) =>
    evidenceItem("uncertainty", "Open evidence gap", item, input.market.provenance.source)
  );
  const relatedMarkets = (input.relatedMarkets ?? [])
    .filter((market) => market.id !== input.market.id)
    .slice(0, 4)
    .map(toRelatedMarketSummary);

  return {
    market: input.market,
    relatedMarkets,
    researchReadiness: {
      outcomeContract: "binary",
      pricingStatus: input.pricingStatus ?? "unknown",
      classificationSource: input.market.provenance.classificationSource,
      openEvidenceGapCount: openGaps.length,
      isPlaceholderPricing: true,
      notes: researchNotes(openGaps.length)
    },
    tokenTrace: tokenTrace(input.market),
    sourceTrace: input.market.provenance.sourceIds.map((item) =>
      evidenceItem("source_id", "Source ID", item, input.market.provenance.source)
    ),
    evidenceTrail: input.market.provenance.evidence.map((item) =>
      evidenceItem("classification", "Classification evidence", item, input.market.provenance.source)
    ),
    openGaps,
    meta: {
      ...okMeta({
        responseKind: "market_detail",
        generatedAt: input.generatedAt,
        sourceMode: input.sourceMode,
        message:
          "Market detail is read-only and contract-backed. Pricing, confidence, and edge remain placeholders."
      })
    },
    ...(input.candidate ? { candidate: input.candidate } : {}),
    ...(input.book ? { book: input.book } : {})
  };
}

function tokenTrace(market: EventMarket): TokenTraceItem[] {
  const primary = market.outcomes.primary;
  const secondary = market.outcomes.secondary;
  const items: TokenTraceItem[] = [
    {
      label: `${primary.label} token`,
      value: primary.tokenId,
      outcomeRole: primary.role,
      tokenId: primary.tokenId
    },
    {
      label: `${secondary.label} token`,
      value: secondary.tokenId,
      outcomeRole: secondary.role,
      tokenId: secondary.tokenId
    },
    {
      label: "Condition ID",
      value: market.market.conditionId
    }
  ];

  if (market.market.questionId) {
    items.push({
      label: "Question ID",
      value: market.market.questionId
    });
  } else {
    items.push({
      label: "Question ID",
      value: "n/a"
    });
  }

  return items;
}

function toRelatedMarketSummary(market: EventMarket): RelatedMarketSummary {
  return {
    id: market.id,
    question: market.question,
    asset: market.asset,
    window: market.window,
    sourceMode: market.provenance.sourceMode,
    href: `/markets/${encodeURIComponent(market.id)}`
  };
}

function researchNotes(openGapCount: number): string[] {
  return [
    "Outcome contract is normalized as binary primary/secondary outcomes.",
    "Pricing is placeholder-only; no real fair probability, confidence, or edge is computed.",
    openGapCount > 0
      ? "Open evidence gaps must fail closed before any future non-placeholder quote."
      : "No open evidence gaps are present on the normalized fixture record."
  ];
}

function evidenceItem(
  kind: EvidenceTrailItem["kind"],
  label: string,
  value: string,
  source: EvidenceTrailItem["source"]
): EvidenceTrailItem {
  return {
    kind,
    label,
    value,
    source
  };
}
