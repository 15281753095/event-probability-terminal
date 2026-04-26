import type { OhlcvCandle, SignalContextSnapshot, SignalHorizon, SignalSymbol } from "@ept/shared-types";

export type ResearchSignalFixture = {
  symbol: SignalSymbol;
  horizon: SignalHorizon;
  candles: OhlcvCandle[];
  context: SignalContextSnapshot;
};

const baseTimestamp = Date.parse("2026-04-22T23:20:00.000Z");

export const researchSignalFixtures: ResearchSignalFixture[] = [
  {
    symbol: "BTC",
    horizon: "5m",
    candles: buildCandles(100000, [
      0.0002, 0.0003, 0.0001, 0.0004, 0.0005, 0.0002, 0.0004, 0.0006, 0.0003, 0.0005,
      0.0004, 0.0007, 0.0003, 0.0006, 0.0008, 0.0004, 0.0007, 0.0009, 0.0005, 0.0008,
      0.001, 0.0007, 0.001, 0.0011, 0.0009, 0.0012, 0.0013, 0.001, 0.0014, 0.0015,
      0.0012, 0.0016, 0.0017, 0.0014, 0.0018, 0.0019, 0.0015, 0.002, 0.0022, 0.0024
    ], 1800, 72),
    context: manualContext("risk_on", 0.08, 0.04, false, "Manual fixture context mildly supports upside bias.")
  },
  {
    symbol: "BTC",
    horizon: "10m",
    candles: buildCandles(100000, [
      0.0002, -0.0001, 0.0003, -0.0002, 0.0002, -0.0003, 0.0004, -0.0004, 0.0003, -0.0002,
      0.0001, -0.0001, 0.0002, -0.0002, 0.0001, 0.0001, -0.0002, 0.0003, -0.0001, 0.0002,
      -0.0003, 0.0004, -0.0002, 0.0002, -0.0001, 0.0001, -0.0002, 0.0002, -0.0002, 0.0003,
      -0.0001, 0.0002, -0.0002, 0.0001, -0.0001, 0.0001, -0.0002, 0.0002, -0.0001, 0.0001
    ], 1500, 18),
    context: manualContext("neutral", 0, 0, false, "Manual fixture context is neutral.")
  },
  {
    symbol: "ETH",
    horizon: "5m",
    candles: buildCandles(3200, [
      -0.0001, -0.0002, -0.0003, -0.0001, -0.0004, -0.0002, -0.0005, -0.0003, -0.0004,
      -0.0006, -0.0003, -0.0005, -0.0007, -0.0004, -0.0008, -0.0005, -0.0007, -0.0009,
      -0.0006, -0.0008, -0.001, -0.0007, -0.0011, -0.0008, -0.0012, -0.001, -0.0013,
      -0.0011, -0.0014, -0.0012, -0.0015, -0.0013, -0.0016, -0.0014, -0.0017, -0.0015,
      -0.0018, -0.0016, -0.0019, -0.0021
    ], 2400, 64),
    context: manualContext("risk_off", -0.05, -0.06, false, "Manual fixture context mildly supports downside bias.")
  },
  {
    symbol: "ETH",
    horizon: "10m",
    candles: buildCandles(3200, [
      0.001, -0.0012, 0.0013, -0.0014, 0.0011, -0.001, 0.0015, -0.0016, 0.0012, -0.0013,
      0.0014, -0.0015, 0.001, -0.0011, 0.0016, -0.0017, 0.0012, -0.0014, 0.0013, -0.0012,
      0.0015, -0.0016, 0.0011, -0.0013, 0.0014, -0.0015, 0.0012, -0.0014, 0.0015, -0.0016,
      0.0011, -0.0012, 0.0013, -0.0015, 0.0014, -0.0016, 0.0012, -0.0014, 0.0013, -0.0015
    ], 2100, 22),
    context: manualContext("unknown", null, null, true, "Manual fixture flags event risk; no live news/X/macro adapter is configured.")
  }
];

export function findResearchSignalFixture(
  symbol: SignalSymbol,
  horizon: SignalHorizon
): ResearchSignalFixture | undefined {
  return researchSignalFixtures.find((fixture) => fixture.symbol === symbol && fixture.horizon === horizon);
}

function buildCandles(start: number, returns: number[], baseVolume: number, volumeStep: number): OhlcvCandle[] {
  let previousClose = start;
  return returns.map((change, index) => {
    const open = previousClose;
    const close = roundPrice(open * (1 + change));
    const range = Math.max(Math.abs(close - open) * 1.8, open * 0.0008);
    const high = roundPrice(Math.max(open, close) + range / 2);
    const low = roundPrice(Math.min(open, close) - range / 2);
    const volumePulse = index > returns.length - 6 ? volumeStep * 3 : 0;
    const volume = Math.round(baseVolume + index * volumeStep + (index % 5) * volumeStep * 1.2 + volumePulse);
    previousClose = close;
    return {
      timestamp: new Date(baseTimestamp + index * 60_000).toISOString(),
      open: roundPrice(open),
      high,
      low,
      close,
      volume
    };
  });
}

function manualContext(
  macroRiskState: SignalContextSnapshot["macroRiskState"],
  newsScore: number | null,
  xSignalScore: number | null,
  marketEventRiskFlag: boolean,
  note: string
): SignalContextSnapshot {
  return {
    sourceMode: "manual_fixture",
    newsScore,
    xSignalScore,
    macroRiskState,
    marketEventRiskFlag,
    notes: [
      note,
      "No live X, news, or macro API is used by default; context is fixture/manual research input."
    ]
  };
}

function roundPrice(value: number): number {
  return Number(value.toFixed(2));
}
