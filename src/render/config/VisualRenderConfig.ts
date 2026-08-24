import * as THREE from "three";
import { PALETTE_HEX } from "../materials/PaletteTokens";

export type QualityTier = "low" | "medium" | "high";

export interface VisualRenderConfig {
  outputColorSpace: THREE.ColorSpace;
  toneMapping: THREE.ToneMapping;
  exposure: number;
  qualityTier: QualityTier;
  sun: {
    minElevationDeg: number;
    maxElevationDeg: number;
    azimuthDeg: number;
    colorHex: string;
    horizonColorHex: string;
    intensity: number;
    nightIntensity: number;
  };
  skyFill: {
    skyColorHex: string;
    groundColorHex: string;
    intensity: number;
    nightIntensity: number;
  };
  shadows: {
    type: THREE.ShadowMapType;
    bias: number;
    normalBias: number;
    radius: number;
    near: number;
    far: number;
    followSnap: boolean;
  };
  quality: Record<
    QualityTier,
    {
      shadowMapSize: number;
      shadowCameraSize: number;
      pixelRatioCap: number;
      dynamicContactShadows: boolean;
    }
  >;
  contact: {
    enabled: boolean;
    opacity: number;
    playerRadius: number;
  };
  weather: {
    stormFogNear: number;
    stormFogFar: number;
    stormSunMultiplier: number;
    lightningColorHex: string;
    lightningIntensity: number;
    lightningCycleSeconds: number;
    lightningDurationSeconds: number;
  };
  fog: {
    colorHex: string;
    near: number;
    far: number;
    distanceDesaturation: number;
  };
  bloom: {
    enabled: boolean;
    strength: number;
    threshold: number;
  };
  grade: {
    saturation: number;
    contrast: number;
    warmth: number;
  };
  motion: {
    locomotionBlendSeconds: number;
    ambientScale: number;
    reducedMotionScale: number;
  };
}

/**
 * The single renderer baseline. Weather and time-of-day may modulate these
 * values through the lighting rig; zones and assets must not override them.
 */
export const CANONICAL_RENDER_CONFIG: VisualRenderConfig = {
  outputColorSpace: THREE.SRGBColorSpace,
  toneMapping: THREE.ACESFilmicToneMapping,
  exposure: 1.04,
  qualityTier: "high",
  sun: {
    minElevationDeg: 8,
    maxElevationDeg: 54,
    azimuthDeg: 52,
    colorHex: PALETTE_HEX.horizon_warm_01,
    horizonColorHex: PALETTE_HEX.emissive_window_01,
    intensity: 2.1,
    nightIntensity: 0.14
  },
  skyFill: {
    skyColorHex: PALETTE_HEX.sky_pale_01,
    groundColorHex: PALETTE_HEX.foliage_sage_01,
    intensity: 1.45,
    nightIntensity: 0.28
  },
  shadows: {
    type: THREE.PCFSoftShadowMap,
    bias: -0.00012,
    normalBias: 0.032,
    radius: 2.8,
    near: 0.5,
    far: 180,
    followSnap: true
  },
  quality: {
    low: {
      shadowMapSize: 1024,
      shadowCameraSize: 20,
      pixelRatioCap: 1,
      dynamicContactShadows: false
    },
    medium: {
      shadowMapSize: 1536,
      shadowCameraSize: 24,
      pixelRatioCap: 1.5,
      dynamicContactShadows: true
    },
    high: {
      shadowMapSize: 2048,
      shadowCameraSize: 28,
      pixelRatioCap: 2,
      dynamicContactShadows: true
    }
  },
  contact: {
    enabled: true,
    opacity: 0.2,
    playerRadius: 0.62
  },
  weather: {
    stormFogNear: 18,
    stormFogFar: 88,
    stormSunMultiplier: 0.42,
    lightningColorHex: PALETTE_HEX.sky_pale_01,
    lightningIntensity: 6.4,
    lightningCycleSeconds: 11,
    lightningDurationSeconds: 0.48
  },
  fog: {
    colorHex: PALETTE_HEX.sky_pale_01,
    near: 64,
    far: 220,
    distanceDesaturation: 0.2
  },
  bloom: {
    enabled: false,
    strength: 0.12,
    threshold: 0.96
  },
  grade: {
    saturation: 1,
    contrast: 1,
    warmth: 0.04
  },
  motion: {
    locomotionBlendSeconds: 0.16,
    ambientScale: 1,
    reducedMotionScale: 0.35
  }
};
