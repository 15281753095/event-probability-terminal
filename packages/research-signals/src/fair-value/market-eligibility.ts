import type {
  BoundEventMarket,
  EventMarketCandidate,
  FairValueComparator,
  FairValueMarketEligibility,
  PolymarketLiquidityStatus,
  RealtimePriceSymbol,
  SignalSymbol
} from "@ept/shared-types";
import { inferSymbols } from "../polymarket/market-mapper.js";

const liquidityRank = {
  unknown: 0,
  thin: 1,
  ok: 2
} satisfies Record<PolymarketLiquidityStatus, number>;

export function evaluateMarketEligibility(
  boundMarket: BoundEventMarket,
  options: {
    maxSpread?: number | undefined;
    minLiquidityStatus?: PolymarketLiquidityStatus | undefined;
    now?: string | undefined;
  } = {}
): FairValueMarketEligibility {
  const maxSpread = options.maxSpread ?? 0.08;
  const minLiquidityStatus = options.minLiquidityStatus ?? "ok";
  const rejectReasons: string[] = [];
  const market = boundMarket.market;
  const extractedSymbol = extractUnderlyingSymbol(boundMarket);
  const thresholdPrice = extractThresholdPrice(market);
  const comparator = extractComparator(market);
  const expiryTime = extractExpiryTime(market);
  const resolutionRuleConfidence = resolutionConfidence(market, comparator, expiryTime);
  const text = combinedText(market);
  const symbols = inferSymbols(market);

  if (boundMarket.bindingStatus !== "bound" || !extractedSymbol) {
    rejectReasons.push(`Market is not clearly bound to one BTCUSDT/ETHUSDT underlying; bindingStatus=${boundMarket.bindingStatus}.`);
  }
  if (symbols.length > 1) {
    rejectReasons.push("Market text contains both BTC and ETH, so the underlying binding is ambiguous.");
  }
  if (symbols.length === 0) {
    rejectReasons.push("Market text does not explicitly name BTC/Bitcoin or ETH/Ethereum.");
  }
  if (!hasYesNoTokens(market)) {
    rejectReasons.push("Yes/No token IDs are missing or not binary.");
  }
  if (!hasYesNoPrices(boundMarket)) {
    rejectReasons.push("Yes/No price or midpoint is missing.");
  }
  if (boundMarket.odds.spread === null || !Number.isFinite(boundMarket.odds.spread)) {
    rejectReasons.push("Market spread is missing.");
  } else if (boundMarket.odds.spread > maxSpread) {
    rejectReasons.push(`Market spread ${boundMarket.odds.spread.toFixed(4)} exceeds maxSpread ${maxSpread.toFixed(4)}.`);
  }
  if (boundMarket.odds.liquidityStatus === "unknown") {
    rejectReasons.push("Market liquidityStatus is unknown.");
  } else if (liquidityRank[boundMarket.odds.liquidityStatus] < liquidityRank[minLiquidityStatus]) {
    rejectReasons.push(`Market liquidityStatus ${boundMarket.odds.liquidityStatus} is below required ${minLiquidityStatus}.`);
  }
  if (thresholdPrice === undefined) {
    rejectReasons.push("No explicit BTC/ETH price threshold could be extracted from question, description, or slug.");
  }
  if (!comparator) {
    rejectReasons.push("No clear above/below terminal direction could be extracted.");
  }
  if (!expiryTime) {
    rejectReasons.push("No valid expiry/endDate could be identified.");
  } else if (options.now && Date.parse(expiryTime) <= Date.parse(options.now)) {
    rejectReasons.push("Market expiry/endDate is not after checkedAt.");
  }
  if (comparator === "HIT") {
    rejectReasons.push("Path-dependent HIT/reach/trade-above market is not supported by terminal probability v1.");
  }
  if (resolutionRuleConfidence === "unknown" || resolutionRuleConfidence === "low") {
    rejectReasons.push("Resolution rule is not explicit enough for fair value v1.");
  }
  if (isLongVagueEvent(text, thresholdPrice)) {
    rejectReasons.push("Long or vague path-dependent event is out of scope for short-horizon K-line terminal modeling.");
  }
  if (boundMarket.odds.failClosedReasons.length) {
    rejectReasons.push(...boundMarket.odds.failClosedReasons);
  }

  return {
    eligible: rejectReasons.length === 0,
    rejectReasons: unique(rejectReasons),
    extracted: {
      ...(thresholdPrice !== undefined ? { thresholdPrice } : {}),
      ...(comparator ? { comparator } : {}),
      ...(expiryTime ? { expiryTime } : {}),
      ...(extractedSymbol ? { underlyingSymbol: extractedSymbol } : {}),
      resolutionRuleConfidence
    }
  };
}

function extractUnderlyingSymbol(boundMarket: BoundEventMarket): RealtimePriceSymbol | undefined {
  if (boundMarket.symbol === "BTC" && boundMarket.underlyingSymbol === "BTCUSDT") {
    return "BTCUSDT";
  }
  if (boundMarket.symbol === "ETH" && boundMarket.underlyingSymbol === "ETHUSDT") {
    return "ETHUSDT";
  }
  return undefined;
}

function hasYesNoTokens(market: EventMarketCandidate): boolean {
  const outcomes = market.outcomes.map((outcome) => outcome.toLowerCase());
  return market.clobTokenIds.length >= 2 && outcomes.includes("yes") && outcomes.includes("no");
}

function hasYesNoPrices(boundMarket: BoundEventMarket): boolean {
  return (
    firstNumber(boundMarket.odds.yesMidpoint, boundMarket.odds.yesPrice) !== null &&
    firstNumber(boundMarket.odds.noMidpoint, boundMarket.odds.noPrice) !== null
  );
}

function extractThresholdPrice(market: EventMarketCandidate): number | undefined {
  const text = combinedText(market);
  const dollarMatch = /\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)(?:\s*([kKmM]))?/g;
  const dollar = firstThresholdMatch(text, dollarMatch);
  if (dollar !== undefined) {
    return dollar;
  }
  return firstThresholdMatch(text, /\b([0-9]+(?:\.[0-9]+)?)\s*([kKmM])\b/g);
}

function firstThresholdMatch(text: string, pattern: RegExp): number | undefined {
  for (const match of text.matchAll(pattern)) {
    const raw = match[1];
    if (!raw) {
      continue;
    }
    const suffix = match[2]?.toLowerCase();
    const base = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(base)) {
      continue;
    }
    const value = suffix === "m" ? base * 1_000_000 : suffix === "k" ? base * 1_000 : base;
    if (value >= 100) {
      return value;
    }
  }
  return undefined;
}

function extractComparator(market: EventMarketCandidate): FairValueComparator | undefined {
  const text = combinedText(market);
  if (/\b(hit|reach|touch|trade above|trade below|trades above|trades below)\b/.test(text)) {
    return "HIT";
  }
  if (/\b(above|over|greater than|higher than|close above|settle above|be above)\b/.test(text)) {
    return "ABOVE";
  }
  if (/\b(below|under|less than|lower than|close below|settle below|be below)\b/.test(text)) {
    return "BELOW";
  }
  return undefined;
}

function extractExpiryTime(market: EventMarketCandidate): string | undefined {
  if (!market.endDate) {
    return undefined;
  }
  const parsed = Date.parse(market.endDate);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function resolutionConfidence(
  market: EventMarketCandidate,
  comparator: FairValueComparator | undefined,
  expiryTime: string | undefined
): FairValueMarketEligibility["extracted"]["resolutionRuleConfidence"] {
  if (!market.resolutionSource || !expiryTime || !comparator) {
    return "unknown";
  }
  if (comparator === "HIT") {
    return "low";
  }
  const text = combinedText(market);
  if (/\b(on|at end of|close above|close below|settle above|settle below|be above|be below)\b/.test(text)) {
    return "high";
  }
  return "medium";
}

function isLongVagueEvent(text: string, thresholdPrice: number | undefined): boolean {
  if (/\b(gta|before gta|before .*release|before .*launch|someday|ever)\b/.test(text)) {
    return true;
  }
  if (/\bbefore\b/.test(text) && /\b(hit|reach|touch)\b/.test(text)) {
    return true;
  }
  return thresholdPrice !== undefined && thresholdPrice >= 1_000_000 && /\b(bitcoin|btc)\b/.test(text) && /\b(hit|reach|before)\b/.test(text);
}

function combinedText(market: Pick<EventMarketCandidate, "question" | "slug" | "description">): string {
  return `${market.question} ${market.slug} ${market.description ?? ""}`.toLowerCase();
}

function firstNumber(...values: Array<number | null | undefined>): number | null {
  const value = values.find((item) => item !== null && item !== undefined && Number.isFinite(item));
  return value === undefined ? null : value;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
