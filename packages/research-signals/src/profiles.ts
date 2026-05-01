import type { SignalHorizon, SignalProfileName } from "@ept/shared-types";

export type { SignalProfileName };

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
  minDirectionalVolumeScore: number;
  strongMomentumBypassAbs: number;
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
      minDirectionalVolumeScore: 0.1,
      strongMomentumBypassAbs: 0.72,
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
      minDirectionalVolumeScore: 0.1,
      strongMomentumBypassAbs: 0.72,
      volumeConfirmWeight: 0.1
    }
  }
};

export const CONSERVATIVE_SIGNAL_PROFILE: SignalProfile = {
  name: "conservative",
  description: "Stricter research profile that requires stronger confirmation before directional bias.",
  horizons: {
    "5m": {
      longThreshold: 0.76,
      shortThreshold: -0.76,
      minConfidence: 0.56,
      maxChopRisk: 0.52,
      minTrendAbs: 0.42,
      minVolatilityBandwidth: 0.008,
      maxExtremeVolatilityBandwidth: 0.038,
      maxExtremeAtrRatio: 0.01,
      minMacdHistogramAtrRatio: 0.00028,
      minEmaSlopeRatio: 0.00006,
      minDirectionalVolumeScore: 0.24,
      strongMomentumBypassAbs: 0.82,
      volumeConfirmWeight: 0.12
    },
    "10m": {
      longThreshold: 0.72,
      shortThreshold: -0.72,
      minConfidence: 0.52,
      maxChopRisk: 0.5,
      minTrendAbs: 0.52,
      minVolatilityBandwidth: 0.0085,
      maxExtremeVolatilityBandwidth: 0.043,
      maxExtremeAtrRatio: 0.011,
      minMacdHistogramAtrRatio: 0.00024,
      minEmaSlopeRatio: 0.000055,
      minDirectionalVolumeScore: 0.24,
      strongMomentumBypassAbs: 0.8,
      volumeConfirmWeight: 0.12
    }
  }
};

export const AGGRESSIVE_SIGNAL_PROFILE: SignalProfile = {
  name: "aggressive",
  description: "More permissive research profile for fixture and observation experiments; stale, chop, and extreme-volatility vetoes still apply.",
  horizons: {
    "5m": {
      longThreshold: 0.62,
      shortThreshold: -0.62,
      minConfidence: 0.4,
      maxChopRisk: 0.72,
      minTrendAbs: 0.22,
      minVolatilityBandwidth: 0.0045,
      maxExtremeVolatilityBandwidth: 0.05,
      maxExtremeAtrRatio: 0.014,
      minMacdHistogramAtrRatio: 0.00014,
      minEmaSlopeRatio: 0.00003,
      minDirectionalVolumeScore: 0,
      strongMomentumBypassAbs: 0.62,
      volumeConfirmWeight: 0.08
    },
    "10m": {
      longThreshold: 0.6,
      shortThreshold: -0.6,
      minConfidence: 0.38,
      maxChopRisk: 0.68,
      minTrendAbs: 0.36,
      minVolatilityBandwidth: 0.0055,
      maxExtremeVolatilityBandwidth: 0.055,
      maxExtremeAtrRatio: 0.015,
      minMacdHistogramAtrRatio: 0.00012,
      minEmaSlopeRatio: 0.00003,
      minDirectionalVolumeScore: 0,
      strongMomentumBypassAbs: 0.6,
      volumeConfirmWeight: 0.08
    }
  }
};

export const SIGNAL_PROFILES: Record<SignalProfileName, SignalProfile> = {
  balanced: BALANCED_SIGNAL_PROFILE,
  conservative: CONSERVATIVE_SIGNAL_PROFILE,
  aggressive: AGGRESSIVE_SIGNAL_PROFILE
};

export function getSignalProfile(name: SignalProfileName = "balanced"): SignalProfile {
  return SIGNAL_PROFILES[name] ?? BALANCED_SIGNAL_PROFILE;
}
