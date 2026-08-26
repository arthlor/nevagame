import * as THREE from "three";
import { PALETTE_HEX } from "../materials/PaletteTokens";

export type QualityTier = "low" | "medium" | "high";

export interface VisualRenderConfig {
  outputColorSpace: THREE.ColorSpace;
  toneMapping: THREE.ToneMapping;
  exposure: number;
  nightExposure: number;
  qualityTier: QualityTier;
  sun: {
    maxElevationDeg: number;
    noonAzimuthDeg: number;
    colorHex: string;
    horizonColorHex: string;
    intensity: number;
  };
  moon: {
    colorHex: string;
    intensity: number;
    cloudAttenuationFloor: number;
    stormAttenuation: number;
    discSize: number;
  };
  skyFill: {
    skyColorHex: string;
    groundColorHex: string;
    nightSkyColorHex: string;
    nightGroundColorHex: string;
    nightSkyColorStrength: number;
    nightGroundColorStrength: number;
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
    castPlayer: boolean;
    castSmallProps: boolean;
    castRocks: boolean;
    vegetationCastDistanceMeters: number;
  };
  quality: Record<
    QualityTier,
    {
      shadowMapSize: number;
      shadowCameraSize: number;
      pixelRatioCap: number;
      dynamicContactShadows: boolean;
      ambientOcclusion: "off" | "contact" | "gtao";
      postProcessPixelRatioCap: number;
      practicalLightBudget: number;
      lodDistanceScale: number;
      groundCoverDrawDistanceMeters: number;
      groundCoverDensityScale: number;
    }
  >;
  contact: {
    enabled: boolean;
    opacity: number;
    playerRadius: number;
  };
  farmGround: {
    cultivationMarginMeters: number;
    gridSegments: number;
    furrowCount: number;
    furrowSegments: number;
    clodCount: number;
  };
  terrainSurface: {
    textureSize: number;
    largeSampleScaleMeters: number;
    smallSampleScaleMeters: number;
    polygonCellScaleMeters: number;
    smallLayerRotationRadians: number;
    colorVariationStrength: number;
    paletteVariationStrength: number;
    polygonVariationStrength: number;
    polygonJaggedStrength: number;
    roughnessVariation: number;
    normals: {
      continuityStartNormalY: number;
      fullyFacetedNormalY: number;
      cliffWeightStart: number;
      cliffWeightFull: number;
      facetedColorBlend: number;
    };
    wetness: {
      riseSeconds: number;
      fallSeconds: number;
      colorMix: number;
    };
    roughness: {
      dry: number;
      wet: number;
      min: number;
      max: number;
    };
  };
  roadSurface: {
    polygonCellScaleMeters: number;
    polygonVariationStrength: number;
    polygonJaggedStrength: number;
    roughness: number;
    roughnessVariation: number;
  };
  practicalLights: {
    colorHex: string;
    localIntensity: number;
    localDistance: number;
    lighthouseIntensity: number;
    lighthouseDistance: number;
  };
  stars: {
    count: number;
    size: number;
  };
  gtao: {
    blendIntensity: number;
    radius: number;
    thickness: number;
    distanceFallOff: number;
    samples: number;
    denoiseSamples: number;
    resolutionScale: number;
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
    actionBlendSeconds: number;
    recoveryBlendSeconds: number;
    locomotionPlaybackMinimum: number;
    locomotionPlaybackMaximum: number;
    groundingMaxFootOffsetMeters: number;
    groundingMaxTiltRadians: number;
    groundingResponse: number;
    cameraLookAheadSeconds: number;
    cameraLookAheadMaxMeters: number;
    cameraLookAheadResponse: number;
    cameraLandingImpulseMeters: number;
    cameraLandingResponse: number;
    cameraBoatAccelerationMeters: number;
    cameraBoatYawMeters: number;
    ambientScale: number;
    reducedMotionScale: number;
    reducedMotionSecondaryScale: number;
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
  nightExposure: 1.24,
  qualityTier: "high",
  sun: {
    maxElevationDeg: 54,
    noonAzimuthDeg: 32,
    colorHex: PALETTE_HEX.horizon_warm_01,
    horizonColorHex: PALETTE_HEX.emissive_window_01,
    intensity: 2.1
  },
  moon: {
    colorHex: PALETTE_HEX.sky_pale_01,
    intensity: 0.92,
    cloudAttenuationFloor: 0.68,
    stormAttenuation: 0.45,
    discSize: 24
  },
  skyFill: {
    skyColorHex: PALETTE_HEX.sky_pale_01,
    groundColorHex: PALETTE_HEX.foliage_sage_01,
    nightSkyColorHex: PALETTE_HEX.water_deep_01,
    nightGroundColorHex: PALETTE_HEX.foliage_shadow_01,
    nightSkyColorStrength: 0.82,
    nightGroundColorStrength: 1.08,
    intensity: 1.45,
    nightIntensity: 0.88
  },
  shadows: {
    type: THREE.PCFSoftShadowMap,
    bias: -0.00012,
    normalBias: 0.032,
    radius: 2.8,
    near: 0.5,
    far: 260,
    followSnap: true,
    castPlayer: false,
    castSmallProps: false,
    castRocks: false,
    vegetationCastDistanceMeters: 28
  },
  quality: {
    low: {
      shadowMapSize: 1024,
      shadowCameraSize: 20,
      pixelRatioCap: 1,
      dynamicContactShadows: false,
      ambientOcclusion: "off",
      postProcessPixelRatioCap: 1,
      practicalLightBudget: 1,
      lodDistanceScale: 0.7,
      groundCoverDrawDistanceMeters: 55,
      groundCoverDensityScale: 0.24
    },
    medium: {
      shadowMapSize: 1536,
      shadowCameraSize: 24,
      pixelRatioCap: 1.5,
      dynamicContactShadows: true,
      ambientOcclusion: "contact",
      postProcessPixelRatioCap: 1.25,
      practicalLightBudget: 3,
      lodDistanceScale: 0.85,
      groundCoverDrawDistanceMeters: 78,
      groundCoverDensityScale: 0.48
    },
    high: {
      shadowMapSize: 2048,
      shadowCameraSize: 28,
      pixelRatioCap: 2,
      dynamicContactShadows: true,
      ambientOcclusion: "contact",
      postProcessPixelRatioCap: 1.5,
      practicalLightBudget: 4,
      lodDistanceScale: 0.95,
      groundCoverDrawDistanceMeters: 96,
      groundCoverDensityScale: 0.6
    }
  },
  contact: {
    enabled: true,
    opacity: 0.2,
    playerRadius: 0.62
  },
  farmGround: {
    cultivationMarginMeters: 0.8,
    gridSegments: 10,
    furrowCount: 6,
    furrowSegments: 14,
    clodCount: 24
  },
  terrainSurface: {
    textureSize: 128,
    largeSampleScaleMeters: 46,
    smallSampleScaleMeters: 13,
    polygonCellScaleMeters: 5.2,
    smallLayerRotationRadians: 0.61,
    colorVariationStrength: 0.06,
    paletteVariationStrength: 0.42,
    polygonVariationStrength: 0.72,
    polygonJaggedStrength: 0.62,
    roughnessVariation: 0.025,
    normals: {
      continuityStartNormalY: 0.88,
      fullyFacetedNormalY: 0.66,
      cliffWeightStart: 0.08,
      cliffWeightFull: 0.5,
      facetedColorBlend: 0.7
    },
    wetness: {
      riseSeconds: 3,
      fallSeconds: 8,
      colorMix: 0.06
    },
    roughness: {
      dry: 0.92,
      wet: 0.8,
      min: 0.775,
      max: 0.945
    }
  },
  roadSurface: {
    polygonCellScaleMeters: 2.8,
    polygonVariationStrength: 0.78,
    polygonJaggedStrength: 0.62,
    roughness: 0.94,
    roughnessVariation: 0.04
  },
  practicalLights: {
    colorHex: PALETTE_HEX.emissive_lantern_01,
    localIntensity: 18,
    localDistance: 13,
    lighthouseIntensity: 32,
    lighthouseDistance: 34
  },
  stars: {
    count: 180,
    size: 0.72
  },
  gtao: {
    blendIntensity: 0.72,
    radius: 0.72,
    thickness: 1.15,
    distanceFallOff: 0.9,
    samples: 8,
    denoiseSamples: 6,
    resolutionScale: 0.68
  },
  weather: {
    stormFogNear: 28,
    stormFogFar: 145,
    stormSunMultiplier: 0.42,
    lightningColorHex: PALETTE_HEX.sky_pale_01,
    lightningIntensity: 6.4,
    lightningCycleSeconds: 11,
    lightningDurationSeconds: 0.48
  },
  fog: {
    colorHex: PALETTE_HEX.sky_pale_01,
    near: 120,
    far: 450,
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
    actionBlendSeconds: 0.1,
    recoveryBlendSeconds: 0.18,
    locomotionPlaybackMinimum: 0.45,
    locomotionPlaybackMaximum: 1.85,
    groundingMaxFootOffsetMeters: 0.16,
    groundingMaxTiltRadians: THREE.MathUtils.degToRad(14),
    groundingResponse: 18,
    cameraLookAheadSeconds: 0.18,
    cameraLookAheadMaxMeters: 0.82,
    cameraLookAheadResponse: 8,
    cameraLandingImpulseMeters: 0.22,
    cameraLandingResponse: 12,
    cameraBoatAccelerationMeters: 0.08,
    cameraBoatYawMeters: 0.12,
    ambientScale: 1,
    reducedMotionScale: 0.35,
    reducedMotionSecondaryScale: 0
  }
};

export function groundCoverActiveCount(highCount: number, tier: QualityTier): number {
  return Math.max(
    0,
    Math.min(
      highCount,
      Math.floor(highCount * CANONICAL_RENDER_CONFIG.quality[tier].groundCoverDensityScale)
    )
  );
}
