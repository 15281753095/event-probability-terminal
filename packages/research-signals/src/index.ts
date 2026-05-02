export {
  atrSnapshot,
  bollingerSnapshot,
  buildFeatureSnapshot,
  emaSeries,
  macdSnapshot,
  realizedVolatilitySnapshot,
  rsiSnapshot,
  volumeSnapshot
} from "./indicators.js";
export {
  REQUIRED_CANDLE_COUNT,
  RESEARCH_SIGNAL_MODEL_VERSION,
  buildResearchSignalFromOHLCV,
  buildResearchSignal,
  getResearchSignalFixture,
  rebaseFixtureCandles,
  listLiveResearchSignals,
  listResearchSignals
} from "./engine.js";
export type { ListLiveSignalsInput, ListSignalsInput, OHLCVFetcher } from "./engine.js";
export { evaluateConfluence } from "./confluence.js";
export {
  CONSOLE_CANDLE_LOOKBACK,
  RECENT_CANDLE_LIMIT,
  RECENT_MARKER_LIMIT,
  buildFixtureEventSignalConsole,
  buildLiveEventSignalConsole
} from "./console.js";
export type { BuildEventSignalConsoleInput, BuildLiveEventSignalConsoleInput } from "./console.js";
export { findResearchSignalFixture, researchSignalFixtures } from "./fixtures.js";
export {
  AGGRESSIVE_SIGNAL_PROFILE,
  BALANCED_SIGNAL_PROFILE,
  CONSERVATIVE_SIGNAL_PROFILE,
  SIGNAL_PROFILES,
  getSignalProfile
} from "./profiles.js";
export type { HorizonThresholdConfig, SignalProfile, SignalProfileName } from "./profiles.js";
export {
  buildCoinbaseProductId,
  coinbaseGranularity,
  emptyFailClosedOHLCVResult,
  emptyFailClosedLiveMarketData,
  fetchCoinbaseExchangeCandles,
  fetchCoinbaseExchangeMarketData
} from "./ohlcv/coinbase-exchange.js";
export type {
  CoinbaseExchangeOptions,
  FetchLike,
  LiveMarketDataFetcher,
  LiveMarketDataFetchRequest
} from "./ohlcv/coinbase-exchange.js";
