import type { SignalHorizon } from "@ept/shared-types";

export type SignalProfileName = "balanced";

export type HorizonThresholdConfig = {
  longThreshold: number;
  shortThreshold: number;
  minConfidence: number;
  maxChopRisk: number;
  minTrendAbs: number;
  minVolatilityBandwidth: number;
  maxExtremeVolatilityBandwidth: number;
  maxExtremeAtrRatio: number;
  minMacdHistogramAtrRatio: number;
  minEmaSlopeRatio: number;
  volumeConfirmWeight: number;
};

export type SignalProfile = {
  name: SignalProfileName;
  description: string;
  horizons: Record<SignalHorizon, HorizonThresholdConfig>;
};

export const BALANCED_SIGNAL_PROFILE: SignalProfile = {
  name: "balanced",
  description: "Balanced research profile for BTC/ETH 5m and 10m event-contract signal review.",
  horizons: {
    "5m": {
      longThreshold: 0.68,
      shortThreshold: -0.68,
      minConfidence: 0.46,
      maxChopRisk: 0.68,
      minTrendAbs: 0.28,
      minVolatilityBandwidth: 0.006,
      maxExtremeVolatilityBandwidth: 0.045,
      maxExtremeAtrRatio: 0.012,
      minMacdHistogramAtrRatio: 0.0002,
      minEmaSlopeRatio: 0.00004,
      volumeConfirmWeight: 0.1
    },
    "10m": {
      longThreshold: 0.65,
      shortThreshold: -0.65,
      minConfidence: 0.44,
      maxChopRisk: 0.62,
      minTrendAbs: 0.44,
      minVolatilityBandwidth: 0.0075,
      maxExtremeVolatilityBandwidth: 0.05,
      maxExtremeAtrRatio: 0.013,
      minMacdHistogramAtrRatio: 0.00018,
      minEmaSlopeRatio: 0.000035,
      volumeConfirmWeight: 0.1
    }
  }
};

export function getSignalProfile(name: SignalProfileName = "balanced"): SignalProfile {
  return BALANCED_SIGNAL_PROFILE;
}

