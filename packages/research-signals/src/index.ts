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
  BINANCE_SPOT_PUBLIC_PROVIDER,
  BINANCE_SPOT_PUBLIC_SOURCE,
  binanceSpotInterval,
  binanceSpotIntervalSeconds,
  buildBinanceSpotSymbol,
  emptyFailClosedBinanceMarketData,
  emptyFailClosedBinanceOHLCVResult,
  fetchBinanceSpotCandles,
  fetchBinanceSpotMarketData
} from "./ohlcv/binance-spot.js";
export type { BinanceSpotOptions } from "./ohlcv/binance-spot.js";
export {
  buildCoinbaseProductId,
  coinbaseGranularity,
  COINBASE_EXCHANGE_PROVIDER,
  COINBASE_EXCHANGE_SOURCE,
  emptyFailClosedOHLCVResult,
  emptyFailClosedLiveMarketData,
  fetchCoinbaseExchangeCandles,
  fetchCoinbaseExchangeMarketData
} from "./ohlcv/coinbase-exchange.js";
export type { CoinbaseExchangeOptions } from "./ohlcv/coinbase-exchange.js";
export type { FetchLike, LiveMarketDataFetcher, LiveMarketDataFetchRequest } from "./ohlcv/types.js";
