export const OFFICIAL_SOURCE_IDS = [
  "polymarket-docs",
  "predict-fun-docs",
  "binance-academy-wallet-prediction"
] as const;

export type OfficialSourceId = (typeof OFFICIAL_SOURCE_IDS)[number];

