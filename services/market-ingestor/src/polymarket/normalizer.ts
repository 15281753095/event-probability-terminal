import type {
  EventMarketCandidate,
  GammaEvent,
  GammaMarket,
  PolymarketClassification,
  PolymarketSourceMode
} from "./types.js";

export function normalizeEventMarket(input: {
  event: GammaEvent;
  market: GammaMarket;
  classification?: PolymarketClassification;
  sourceMode: PolymarketSourceMode;
  sourceIds: string[];
}): { candidate?: EventMarketCandidate; rejection?: string } {
  const marketId = stringValue(input.market.id);
  if (!marketId) {
    return { rejection: "missing market id" };
  }

  if (!input.classification) {
    return {
      rejection:
        "missing asset/window classification; TODO confirm official BTC/ETH and 10m/1h classification source"
    };
  }

  const tokenIds = parseYesNoTokenIds(input.market.clobTokenIds, input.market.outcomes);
  if (!tokenIds) {
    return { rejection: "ambiguous or missing Yes/No token mapping" };
  }

  const conditionId = stringValue(input.market.conditionId);
  if (!conditionId) {
    return { rejection: "missing conditionId" };
  }

  const question = stringValue(input.market.question);
  if (!question) {
    return { rejection: "missing market question" };
  }

  const enableOrderBook = booleanValue(input.market.enableOrderBook);
  if (enableOrderBook !== true) {
    return { rejection: "enableOrderBook is not true" };
  }

  const marketActive = booleanValue(input.market.active);
  const marketClosed = booleanValue(input.market.closed);
  if (marketActive !== true || marketClosed === true) {
    return { rejection: "market is not active open public-read candidate" };
  }

  const eventId = stringValue(input.event.id) ?? "unknown-event";

  const eventInfo = {
    id: eventId,
    ...optionalString("slug", input.event.slug),
    ...optionalString("title", input.event.title),
    ...optionalString("startAt", input.event.startDate),
    ...optionalString("endAt", input.event.endDate)
  };

  const marketInfo = {
    id: marketId,
    ...optionalString("slug", input.market.slug),
    conditionId,
    ...optionalString("questionId", input.market.questionID),
    ...optionalString("startAt", input.market.startDateIso ?? input.market.startDate),
    ...optionalString("endAt", input.market.endDateIso ?? input.market.endDate),
    active: marketActive,
    closed: marketClosed ?? false,
    enableOrderBook
  };

  const metrics = {
    ...optionalNumber("liquidity", numberValue(input.market.liquidityNum) ?? numberValue(input.event.liquidity)),
    ...optionalNumber("volume", numberValue(input.market.volumeNum) ?? numberValue(input.event.volume)),
    ...optionalNumber("bestBid", numberValue(input.market.bestBid)),
    ...optionalNumber("bestAsk", numberValue(input.market.bestAsk)),
    ...optionalNumber("lastTradePrice", numberValue(input.market.lastTradePrice)),
    ...optionalNumber("spread", numberValue(input.market.spread))
  };

  return {
    candidate: {
      id: `polymarket:${marketId}`,
      venue: "polymarket",
      asset: input.classification.asset,
      window: input.classification.window,
      question,
      event: eventInfo,
      market: marketInfo,
      tokens: {
        yes: tokenIds[0],
        no: tokenIds[1]
      },
      metrics,
      provenance: {
        source: "polymarket",
        sourceIds: input.sourceIds,
        sourceMode: input.sourceMode,
        classificationSource: input.classification.source,
        evidence: input.classification.evidence
      },
      uncertainty: [
        "TODO: replace fixture_metadata classification with confirmed official Polymarket BTC/ETH and 10m/1h taxonomy before live use",
        "TODO: confirm raw clobTokenIds shape with approved public-read fixture capture"
      ],
      raw: {
        event: input.event,
        market: input.market
      }
    }
  };
}

export function extractMarkets(event: GammaEvent): GammaMarket[] {
  return Array.isArray(event.markets) ? (event.markets as GammaMarket[]) : [];
}

export function parseTokenIds(value: unknown): [string, string] | undefined {
  const parsed = parseStringArray(value);
  if (parsed?.length !== 2) {
    return undefined;
  }
  const [yes, no] = parsed;
  return yes && no ? [yes, no] : undefined;
}

export function parseOutcomeLabels(value: unknown): [string, string] | undefined {
  const parsed = parseStringArray(value);
  if (parsed?.length !== 2) {
    return undefined;
  }
  const [yes, no] = parsed;
  return yes && no ? [yes, no] : undefined;
}

export function parseYesNoTokenIds(
  tokenIdsValue: unknown,
  outcomesValue: unknown
): [string, string] | undefined {
  const tokenIds = parseTokenIds(tokenIdsValue);
  const outcomes = parseOutcomeLabels(outcomesValue);
  if (!tokenIds || !outcomes) {
    return undefined;
  }

  return outcomes[0] === "Yes" && outcomes[1] === "No" ? tokenIds : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const parsed = value.map(stringValue);
    return parsed.every((item): item is string => item !== undefined) ? parsed : undefined;
  }

  if (typeof value === "string") {
    try {
      return parseStringArray(JSON.parse(value) as unknown);
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

function optionalNumber<K extends string>(
  key: K,
  value: number | undefined
): Partial<Record<K, number>> {
  return value !== undefined ? { [key]: value } as Record<K, number> : {};
}
