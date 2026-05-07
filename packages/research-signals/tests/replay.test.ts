import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  Candle,
  FairValueMarketEligibility,
  ReplaySignal,
  ReplayTradeLikeResult
} from "@ept/shared-types";
import {
  computeReplayMetrics,
  fetchBinanceHistoricalKlines,
  fetchPolymarketPriceHistory,
  labelReplayOutcome,
  resolveReplayWindow,
  runSignalReplay,
  type FetchLike
} from "../src/index.js";

const checkedAt = "2026-05-06T00:00:00.000Z";

describe("replay windows", () => {
  it("resolves 1d 3d 1w and 1m windows", () => {
    assert.deepEqual(resolveReplayWindow("1d", checkedAt), {
      id: "1d",
      startTime: "2026-05-05T00:00:00.000Z",
      endTime: checkedAt,
      label: "Past 1 day"
    });
    assert.equal(resolveReplayWindow("3d", checkedAt).startTime, "2026-05-03T00:00:00.000Z");
    assert.equal(resolveReplayWindow("1w", checkedAt).startTime, "2026-04-29T00:00:00.000Z");
    assert.equal(resolveReplayWindow("1m", checkedAt).startTime, "2026-04-06T00:00:00.000Z");
  });

  it("rejects invalid custom windows", () => {
    assert.throws(() => resolveReplayWindow({
      id: "custom",
      startTime: "2026-05-06T00:00:00.000Z",
      endTime: "2026-05-05T00:00:00.000Z",
      label: "bad"
    }));
  });
});

describe("replay outcome labeling", () => {
  it("maps LONG_YES and LONG_NO against explicit resolved outcomes", () => {
    assert.equal(labelReplayOutcome({
      signal: signal({ side: "LONG_YES" }),
      historicalCandles: candles(),
      closedMarketData: { market: market(), resolvedOutcome: "YES", outcomeSource: "mock-fixture" },
      now: checkedAt
    }).status, "WIN");
    assert.equal(labelReplayOutcome({
      signal: signal({ side: "LONG_YES" }),
      historicalCandles: candles(),
      closedMarketData: { market: market(), resolvedOutcome: "NO", outcomeSource: "mock-fixture" },
      now: checkedAt
    }).status, "LOSS");
    assert.equal(labelReplayOutcome({
      signal: signal({ side: "LONG_NO" }),
      historicalCandles: candles(),
      closedMarketData: { market: market(), resolvedOutcome: "NO", outcomeSource: "mock-fixture" },
      now: checkedAt
    }).status, "WIN");
    assert.equal(labelReplayOutcome({
      signal: signal({ side: "LONG_NO" }),
      historicalCandles: candles(),
      closedMarketData: { market: market(), resolvedOutcome: "YES", outcomeSource: "mock-fixture" },
      now: checkedAt
    }).status, "LOSS");
  });

  it("does not count pending unresolved rejected or no_signal outcomes in win rate", () => {
    const window = resolveReplayWindow("1w", checkedAt);
    const results: ReplayTradeLikeResult[] = [
      resultWithStatus("PENDING", "LONG_YES"),
      resultWithStatus("UNRESOLVED", "LONG_NO"),
      resultWithStatus("REJECTED", "REJECTED"),
      resultWithStatus("NO_SIGNAL", "NO_SIGNAL")
    ];
    const metrics = computeReplayMetrics({ symbol: "BTC", window, results, checkedAt });

    assert.equal(metrics.sampleCount, 0);
    assert.equal(metrics.winRate, null);
    assert.equal(metrics.pendingCount, 1);
    assert.equal(metrics.unresolvedCount, 1);
    assert.equal(metrics.rejectedCount, 1);
    assert.equal(metrics.noSignalCount, 1);
  });

  it("marks unexpired signals pending", () => {
    const outcome = labelReplayOutcome({
      signal: signal({ expiryTime: "2026-05-06T01:00:00.000Z" }),
      historicalCandles: candles(),
      now: checkedAt
    });

    assert.equal(outcome.status, "PENDING");
  });

  it("does not use terminal expiry price for path-dependent markets", () => {
    const outcome = labelReplayOutcome({
      signal: signal({ question: "Will Bitcoin hit $70,000 before Friday?" }),
      historicalCandles: candles(100, 20),
      eligibility: eligibility({ comparator: "HIT", thresholdPrice: 70000 }),
      now: checkedAt
    });

    assert.equal(outcome.status, "UNRESOLVED");
    assert.ok(outcome.notes.some((note) => note.includes("Path-dependent")));
  });

  it("reconstructs terminal threshold outcomes without guessing exact ties", () => {
    const above = labelReplayOutcome({
      signal: signal({ side: "LONG_YES", expiryTime: "2026-05-05T00:10:00.000Z" }),
      historicalCandles: candles(100, 20),
      eligibility: eligibility({ comparator: "ABOVE", thresholdPrice: 105 }),
      now: checkedAt
    });
    const tie = labelReplayOutcome({
      signal: signal({ side: "LONG_YES", expiryTime: "2026-05-05T00:05:00.000Z" }),
      historicalCandles: candles(100, 20),
      eligibility: eligibility({ comparator: "ABOVE", thresholdPrice: 105 }),
      now: checkedAt
    });

    assert.equal(above.status, "WIN");
    assert.equal(above.outcomeSource, "binance-threshold-reconstruction");
    assert.equal(tie.status, "UNRESOLVED");
  });
});

describe("replay metrics", () => {
  it("uses only wins and losses for winRate denominator", () => {
    const window = resolveReplayWindow("1w", checkedAt);
    const results = [
      resultWithStatus("WIN", "LONG_YES", 0.4),
      resultWithStatus("LOSS", "LONG_YES", -0.5),
      resultWithStatus("PENDING", "LONG_NO"),
      resultWithStatus("REJECTED", "REJECTED"),
      resultWithStatus("NO_SIGNAL", "NO_SIGNAL")
    ];
    const metrics = computeReplayMetrics({ symbol: "BTC", window, results, checkedAt });

    assert.equal(metrics.sampleCount, 2);
    assert.equal(metrics.winRate, 0.5);
    assert.equal(metrics.coverageRate, 0.6);
    assert.equal(metrics.rejectionRate, 0.2);
    assert.ok(metrics.warnings.includes("LOW_SAMPLE_SIZE"));
  });

  it("returns null winRate for zero actionable and pending-only replays", () => {
    const window = resolveReplayWindow("1w", checkedAt);
    assert.equal(computeReplayMetrics({
      symbol: "BTC",
      window,
      results: [resultWithStatus("NO_SIGNAL", "NO_SIGNAL")],
      checkedAt
    }).winRate, null);
    assert.equal(computeReplayMetrics({
      symbol: "BTC",
      window,
      results: [resultWithStatus("PENDING", "LONG_YES")],
      checkedAt
    }).winRate, null);
  });

  it("computes max drawdown from the theoretical PnL curve", () => {
    const window = resolveReplayWindow("1w", checkedAt);
    const metrics = computeReplayMetrics({
      symbol: "BTC",
      window,
      results: [
        resultWithStatus("WIN", "LONG_YES", 0.4),
        resultWithStatus("LOSS", "LONG_YES", -0.7),
        resultWithStatus("WIN", "LONG_NO", 0.3)
      ],
      checkedAt
    });

    assert.equal(metrics.cumulativeTheoreticalPnl, 0);
    assert.equal(metrics.maxDrawdown, 0.7);
  });
});

describe("replay adapters and anti-cheat", () => {
  it("fetches Binance historical klines with startTime endTime and pagination", async () => {
    const urls: string[] = [];
    const fetcher: FetchLike = async (url, init) => {
      urls.push(url);
      assert.deepEqual(init.headers, { Accept: "application/json" });
      assert.equal("Authorization" in init.headers, false);
      const startTime = Number(new URL(url).searchParams.get("startTime"));
      return jsonResponse(binanceRows(new Date(startTime).toISOString(), 2));
    };

    const result = await fetchBinanceHistoricalKlines({
      symbol: "BTC",
      interval: "1m",
      startTime: "2026-05-05T00:00:00.000Z",
      endTime: "2026-05-05T00:03:00.000Z",
      requestedAt: checkedAt
    }, { fetcher, limit: 2 });

    assert.ok(urls.length >= 2);
    assert.ok(urls[0]?.includes("startTime="));
    assert.ok(urls[0]?.includes("endTime="));
    assert.equal(result.candles.length, 4);
  });

  it("fails closed when Polymarket prices-history tokenId is missing", async () => {
    const result = await fetchPolymarketPriceHistory({ tokenId: "", requestedAt: checkedAt });

    assert.equal(result.history.length, 0);
    assert.ok(result.failClosedReasons.some((reason) => reason.includes("tokenId")));
  });

  it("maps Polymarket prices-history points to t and p", async () => {
    const fetcher: FetchLike = async (url, init) => {
      assert.ok(url.includes("/prices-history"));
      assert.ok(url.includes("market=token-yes"));
      assert.deepEqual(init.headers, { Accept: "application/json" });
      return jsonResponse({ history: [{ t: 1_777_680_000, p: 0.42 }] });
    };
    const result = await fetchPolymarketPriceHistory({
      tokenId: "token-yes",
      interval: "1h",
      requestedAt: checkedAt
    }, { fetcher });

    assert.deepEqual(result.history, [{ t: 1_777_680_000, p: 0.42 }]);
  });

  it("mock replay returns deterministic metrics and keeps unresolved samples out of realized winRate", async () => {
    const first = await runSignalReplay({ symbol: "BTC", window: "1w", useMock: true, now: () => checkedAt });
    const second = await runSignalReplay({ symbol: "BTC", window: "1w", useMock: true, now: () => checkedAt });

    assert.deepEqual(first.metrics, second.metrics);
    assert.equal(first.sourceType, "mock");
    assert.equal(first.results.length, 10);
    assert.equal(first.metrics.sampleCount, 6);
    assert.equal(first.metrics.winRate, 0.666667);
    assert.equal(first.metrics.pendingCount, 1);
    assert.equal(first.metrics.unresolvedCount, 1);
    assert.equal(first.metrics.rejectedCount, 1);
    assert.equal(first.metrics.noSignalCount, 1);
    assert.ok(first.metrics.warnings.includes("LOW_SAMPLE_SIZE"));
  });

  it("live replay does not use candles after signalTime and active markets remain pending", async () => {
    const requestedUrls: string[] = [];
    const fetcher: FetchLike = async (url, init) => {
      requestedUrls.push(url);
      assert.deepEqual(init.headers, { Accept: "application/json" });
      if (url.includes("/api/v3/klines")) {
        return jsonResponse([
          ...binanceRows("2026-05-05T23:40:00.000Z", 20),
          binanceRow("2026-05-06T00:05:00.000Z", 1000000)
        ]);
      }
      if (url.includes("/markets")) {
        if (url.includes("closed=true")) {
          return jsonResponse([]);
        }
        return jsonResponse([gammaMarket()]);
      }
      if (url.includes("/book")) {
        return jsonResponse({ bids: [{ price: "0.48", size: "100" }], asks: [{ price: "0.52", size: "100" }] });
      }
      if (url.includes("/midpoint")) {
        return jsonResponse({ mid: "0.50" });
      }
      if (url.includes("/spread")) {
        return jsonResponse({ spread: "0.04" });
      }
      if (url.includes("/price")) {
        return jsonResponse({ price: "0.50" });
      }
      if (url.includes("/public-search")) {
        return jsonResponse([]);
      }
      throw new Error(`unexpected url ${url}`);
    };

    const response = await runSignalReplay({
      symbol: "BTC",
      window: {
        id: "custom",
        startTime: "2026-05-05T23:30:00.000Z",
        endTime: "2026-05-06T00:00:00.000Z",
        label: "test"
      },
      useMock: false,
      fetcher,
      now: () => checkedAt
    });

    assert.ok(requestedUrls.some((url) => url.includes("/api/v3/klines")));
    assert.equal(response.results.length >= 1, true);
    assert.equal(response.metrics.winRate, null);
    assert.equal(response.metrics.pendingCount >= 1, true);
    assert.notEqual(response.signals[0]?.priceAtSignal, 1000001);
  });
});

function signal(overrides: Partial<ReplaySignal> = {}): ReplaySignal {
  return {
    id: "signal-1",
    symbol: "BTC",
    underlyingSymbol: "BTCUSDT",
    marketId: "market-1",
    question: overrides.question ?? "Will Bitcoin be above $100 at the end of the window?",
    signalTime: "2026-05-05T00:00:00.000Z",
    expiryTime: "2026-05-05T00:10:00.000Z",
    priceAtSignal: 101,
    side: "LONG_YES",
    modelProbabilityYes: 0.65,
    marketProbabilityYes: 0.5,
    edge: 0.15,
    confidence: 0.5,
    reason: "test",
    rejectReasons: [],
    assumptions: ["test"],
    isResearchOnly: true,
    ...overrides
  };
}

function resultWithStatus(
  status: ReplayTradeLikeResult["outcome"]["status"],
  side: ReplaySignal["side"],
  pnl: number | null = null
): ReplayTradeLikeResult {
  const replaySignal = signal({ id: `signal-${status}-${side}`, side });
  return {
    signal: replaySignal,
    outcome: {
      signalId: replaySignal.id,
      marketId: replaySignal.marketId,
      status,
      outcomeSource: "mock-fixture",
      notes: []
    },
    theoreticalEntryPrice: side === "LONG_YES" || side === "LONG_NO" ? 0.5 : null,
    theoreticalExitValue: status === "WIN" ? 1 : status === "LOSS" ? 0 : null,
    theoreticalPnl: pnl,
    feesAssumption: "test",
    slippageAssumption: "test",
    spreadAssumption: "test",
    countedInWinRate: status === "WIN" || status === "LOSS"
  };
}

function eligibility(overrides: Partial<FairValueMarketEligibility["extracted"]>): FairValueMarketEligibility {
  return {
    eligible: true,
    rejectReasons: [],
    extracted: {
      resolutionRuleConfidence: "high",
      expiryTime: "2026-05-05T00:10:00.000Z",
      underlyingSymbol: "BTCUSDT",
      ...overrides
    }
  };
}

function market() {
  return {
    id: "polymarket:market-1",
    eventId: "event-1",
    marketId: "market-1",
    question: "Will Bitcoin be above $100 at the end of the window?",
    slug: "bitcoin-above-100",
    active: false,
    closed: true,
    endDate: "2026-05-05T00:10:00.000Z",
    outcomes: ["Yes", "No"],
    outcomePrices: [1, 0],
    clobTokenIds: ["yes-token", "no-token"],
    resolutionSource: "Mock",
    rawSource: "mock" as const
  };
}

function candles(startClose = 100, count = 12): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const timestamp = new Date(Date.parse("2026-05-05T00:00:00.000Z") + index * 60_000).toISOString();
    return {
      source: "binance_spot_public",
      sourceType: "live",
      provider: "binance-spot-public",
      symbol: "BTC",
      interval: "1m",
      granularity: 60,
      productId: "BTCUSDT",
      displaySymbol: "BTCUSDT",
      openTime: timestamp,
      startTime: timestamp,
      timestamp,
      open: startClose + index,
      high: startClose + index + 1,
      low: startClose + index - 1,
      close: startClose + index,
      volume: 100,
      isLive: true,
      isMock: false,
      isFixtureBacked: false,
      isClosed: true
    };
  });
}

function binanceRows(start: string, count: number) {
  const startMs = Date.parse(start);
  return Array.from({ length: count }, (_, index) => binanceRow(new Date(startMs + index * 60_000).toISOString(), 100 + index));
}

function binanceRow(start: string, open: number) {
  const openTime = Date.parse(start);
  return [
    openTime,
    String(open),
    String(open + 2),
    String(open - 1),
    String(open + 1),
    "1000",
    openTime + 60_000 - 1
  ];
}

function gammaMarket() {
  return {
    id: "active-btc-above-100",
    eventId: "event-active",
    question: "Will Bitcoin be above $100 on May 7?",
    slug: "bitcoin-above-100-may-7",
    active: true,
    closed: false,
    endDate: "2026-05-07T00:00:00.000Z",
    outcomes: "[\"Yes\",\"No\"]",
    outcomePrices: "[0.5,0.5]",
    clobTokenIds: "[\"yes-token\",\"no-token\"]",
    resolutionSource: "Mock"
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
