import type {
  BoundEventMarket,
  BoundEventMarketStatus,
  EventMarketCandidate,
  EventMarketOdds,
  RealtimePriceSymbol,
  SignalSymbol
} from "@ept/shared-types";
import type { GammaMarketRecord } from "./types.js";

export function mapGammaMarketToCandidate(input: {
  market: GammaMarketRecord;
  event?: GammaMarketRecord;
}): { candidate?: EventMarketCandidate; failClosedReasons: string[] } {
  const market = input.market;
  const event = input.event ?? {};
  const marketId = stringValue(market.id) ?? stringValue(market.marketId);
  const question = stringValue(market.question) ?? stringValue(market.title);
  const slug = stringValue(market.slug) ?? marketId;
  const failClosedReasons: string[] = [];

  if (!marketId) {
    failClosedReasons.push("Gamma market missing id.");
  }
  if (!question) {
    failClosedReasons.push("Gamma market missing question/title.");
  }
  if (!slug) {
    failClosedReasons.push("Gamma market missing slug.");
  }

  const outcomes = parseStringArray(market.outcomes ?? market.shortOutcomes);
  const outcomePrices = parseNumberArray(market.outcomePrices);
  const clobTokenIds = parseStringArray(market.clobTokenIds);
  if (!outcomes?.length) {
    failClosedReasons.push("Gamma market missing outcomes.");
  }
  if (!clobTokenIds?.length) {
    failClosedReasons.push("Gamma market missing clobTokenIds.");
  }

  if (!marketId || !question || !slug) {
    return { failClosedReasons };
  }

  return {
    candidate: {
      id: `polymarket:${marketId}`,
      eventId: stringValue(market.eventId) ?? stringValue(event.id) ?? "unknown-event",
      marketId,
      question,
      slug,
      ...optionalString("description", market.description ?? event.description),
      active: booleanValue(market.active) ?? true,
      closed: booleanValue(market.closed) ?? false,
      ...optionalBoolean("archived", market.archived ?? event.archived),
      ...optionalString("endDate", market.endDateIso ?? market.endDate ?? event.endDate),
      ...optionalString("startDate", market.startDateIso ?? market.startDate ?? event.startDate),
      ...optionalNumber("volume", numberValue(market.volumeNum) ?? numberValue(market.volume)),
      ...optionalNumber("liquidity", numberValue(market.liquidityNum) ?? numberValue(market.liquidity)),
      outcomes: outcomes ?? [],
      outcomePrices: outcomePrices ?? [],
      clobTokenIds: clobTokenIds ?? [],
      ...optionalString("conditionId", market.conditionId),
      ...optionalString("questionId", market.questionID ?? market.questionId),
      ...optionalString("resolutionSource", market.resolutionSource ?? event.resolutionSource),
      rawSource: "gamma"
    },
    failClosedReasons
  };
}

export function bindMarketToUnderlying(input: {
  candidate: EventMarketCandidate;
  odds: EventMarketOdds;
  realtimeUnderlyingPrice?: Partial<Record<SignalSymbol, number | null>> | undefined;
}): BoundEventMarket {
  const symbols = inferSymbols(input.candidate);
  const bindingStatus: BoundEventMarketStatus =
    symbols.length === 1 ? "bound" : symbols.length > 1 ? "ambiguous" : "unsupported";
  const symbol = symbols[0] ?? "BTC";
  const underlyingSymbol: RealtimePriceSymbol = symbol === "ETH" ? "ETHUSDT" : "BTCUSDT";
  const researchRejectReasons = researchRejectReasonsFor(input.candidate, bindingStatus, input.odds);
  return {
    symbol,
    underlyingSymbol,
    market: input.candidate,
    odds: input.odds,
    realtimeUnderlyingPrice: input.realtimeUnderlyingPrice?.[symbol] ?? null,
    bindingStatus,
    bindingReasons: bindingReasonsFor(symbols, input.candidate),
    researchEligible: researchRejectReasons.length === 0,
    researchRejectReasons
  };
}

export function inferSymbols(candidate: Pick<EventMarketCandidate, "question" | "slug" | "description">): SignalSymbol[] {
  const text = `${candidate.question} ${candidate.slug} ${candidate.description ?? ""}`.toLowerCase();
  const btc = /\b(bitcoin|btc)\b/.test(text);
  const eth = /\b(ethereum|eth)\b/.test(text);
  return [
    ...(btc ? ["BTC" as const] : []),
    ...(eth ? ["ETH" as const] : [])
  ];
}

function bindingReasonsFor(symbols: SignalSymbol[], candidate: EventMarketCandidate): string[] {
  if (symbols.length === 1) {
    return [`Question/slug text binds market to ${symbols[0] === "BTC" ? "BTCUSDT" : "ETHUSDT"}.`];
  }
  if (symbols.length > 1) {
    return ["Question/slug text contains both BTC and ETH, so binding is ambiguous."];
  }
  return [`No BTC/Bitcoin or ETH/Ethereum binding keyword found in ${candidate.marketId}.`];
}

function researchRejectReasonsFor(
  candidate: EventMarketCandidate,
  bindingStatus: BoundEventMarketStatus,
  odds: EventMarketOdds
): string[] {
  const reasons: string[] = [];
  if (bindingStatus !== "bound") {
    reasons.push(`Binding status is ${bindingStatus}.`);
  }
  if (candidate.outcomes.length < 2) {
    reasons.push("Outcome labels are missing or not binary.");
  }
  if (candidate.clobTokenIds.length < 2) {
    reasons.push("CLOB token IDs are missing or not binary.");
  }
  if (!candidate.endDate) {
    reasons.push("Event end time is missing.");
  }
  if (!candidate.resolutionSource) {
    reasons.push("Resolution source/rule is not confirmed.");
  }
  if (odds.failClosedReasons.length > 0) {
    reasons.push(...odds.failClosedReasons);
  }
  return unique(reasons);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  const parsed = parseArray(value);
  if (!parsed) {
    return undefined;
  }
  const strings = parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length ? strings : undefined;
}

function parseNumberArray(value: unknown): number[] | undefined {
  const parsed = parseArray(value);
  if (!parsed) {
    return undefined;
  }
  const numbers = parsed.map(numberValue).filter((item): item is number => item !== undefined);
  return numbers.length ? numbers : undefined;
}

function parseArray(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function optionalString<K extends string>(key: K, value: unknown): Partial<Record<K, string>> {
  const parsed = stringValue(value);
  return parsed ? { [key]: parsed } as Record<K, string> : {};
}

function optionalNumber<K extends string>(key: K, value: number | undefined): Partial<Record<K, number>> {
  return value !== undefined ? { [key]: value } as Record<K, number> : {};
}

function optionalBoolean<K extends string>(key: K, value: unknown): Partial<Record<K, boolean>> {
  const parsed = booleanValue(value);
  return parsed !== undefined ? { [key]: parsed } as Record<K, boolean> : {};
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
