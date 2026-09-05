import * as THREE from "three";
import { WATER_OUTPUT_GLSL, type CoastalUniforms } from "./CoastalOptics";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import type { LightingFrame } from "../lighting/LightingRig";
import { GROUND_POLYGON_CELL_GLSL } from "../materials/GroundPolygonCells";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import { WATER_WAVE_CONFIG, type WaterConditions } from "./WaterSurface";
import {
  createHeadwaterUniforms,
  WATER_HEADWATER_FUNCTION_GLSL,
  WATER_HEADWATER_UNIFORMS_GLSL,
  WATER_PROFILE_FUNCTION_GLSL,
  WATER_PROFILE_UNIFORMS_GLSL,
  WATER_WAVE_FUNCTION_GLSL,
  WATER_WAVE_UNIFORMS_GLSL,
  WATER_NOISE_GLSL
} from "./waveGlsl";
import { WATER_SHADING_UNIFORMS_GLSL, WATER_SURFACE_SHADING_GLSL } from "./waterShadingGlsl";

export interface NearWaterPatchOptions {
  size?: number;
  segments?: number;
  waterProfileMap: THREE.DataTexture;
  waterProfileBounds: THREE.Vector4;
  coastalUniforms: CoastalUniforms;
  baseGridSpacing?: THREE.Vector2;
}

function vector(values: readonly [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(values[0], values[1], values[2]);
}

const nearVertexShader = /* glsl */ `
  ${WATER_WAVE_UNIFORMS_GLSL}
  ${WATER_HEADWATER_UNIFORMS_GLSL}

  uniform vec2 uPatchCenter;
  uniform float uInnerFadeRadius;
  uniform float uOuterFadeRadius;
  uniform float uDetailBandAmplitude;
  uniform float uDetailBandFrequency;
  uniform float uDetailBandSpeed;

  out vec3 vWorldPosition;
  out vec3 vWaveNormal;
  out float vWaveHeight;
  out float vSignedWaterDistance;
  out vec3 vRegionWeights;
  out float vRimFade;

  ${WATER_WAVE_FUNCTION_GLSL}
  ${WATER_HEADWATER_FUNCTION_GLSL}

  void main() {
    vec4 baseWorldPosition = modelMatrix * vec4(position, 1.0);
    vec4 profile = profileAt(baseWorldPosition.xz);
    float height;
    vec3 waveNormal;
    waveHeightAndNormal(baseWorldPosition.xz, profile, height, waveNormal);
    vec2 headwater = nevaHeadwaterElevationAndGrade(baseWorldPosition.xz);

    // Fade out near-field additions toward the patch perimeter
    float dist = length(baseWorldPosition.xz - uPatchCenter);
    float rimFade = 1.0 - smoothstep(uInnerFadeRadius, uOuterFadeRadius, dist);

    // Retained band uniforms stay at zero amplitude: extra motion is normal-only.
    float riverWeight = profile.g;
    float oceanWeight = profile.b;
    float seaWeight = max(0.0, 1.0 - riverWeight - oceanWeight);
    vec3 weights = vec3(riverWeight, seaWeight, oceanWeight);
    float localAngle = profile.a * 6.28318530718 - 3.14159265359;
    vec2 localDirection = vec2(cos(localAngle), sin(localAngle));
    vec2 direction = normalize(mix(localDirection, uWindDirection, oceanWeight));
    vec2 crossDirection = vec2(-direction.y, direction.x);
    vec2 detail4Direction = normalize(direction * 0.82 + crossDirection * 0.57);
    float detail4Pos = dot(baseWorldPosition.xz, detail4Direction);
    float detail4Phase = detail4Pos * uDetailBandFrequency + uTime * uDetailBandSpeed + 2.7;
    float detail4Wave = sin(detail4Phase) * uDetailBandAmplitude * (0.6 + 0.4 * uRoughness) * (1.0 - riverWeight * 0.6);

    // No geometric bias: both surfaces must share exactly the same elevation.
    float headwaterDetailWeight = nevaHeadwaterDetailWeight(baseWorldPosition.xz);
    height += detail4Wave * rimFade * headwaterDetailWeight;

    vec3 displaced = position;
    displaced.y += headwater.x + height;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);

    vRegionWeights = vec3(riverWeight, seaWeight, oceanWeight);
    vSignedWaterDistance = profile.r * 32.0 - 16.0;
    vWorldPosition = worldPosition.xyz;
    vWaveNormal = nevaWaterSurfaceNormal(waveNormal, headwater.y);
    vWaveHeight = height;
    vRimFade = rimFade;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const nearFragmentShader = /* glsl */ `
  ${WATER_SHADING_UNIFORMS_GLSL}
  ${WATER_PROFILE_UNIFORMS_GLSL}
  ${WATER_HEADWATER_UNIFORMS_GLSL}

  uniform float uDetailNormalStrength;
  uniform float uDetailNormalScrollSpeed;
  uniform vec2 uPatchCenter;
  uniform float uInnerFadeRadius;

  in vec3 vWorldPosition;
  in vec3 vWaveNormal;
  in float vWaveHeight;
  in float vSignedWaterDistance;
  in vec3 vRegionWeights;
  in float vRimFade;
  out vec4 outColor;

  ${GROUND_POLYGON_CELL_GLSL}
  ${WATER_NOISE_GLSL}
  ${WATER_PROFILE_FUNCTION_GLSL}
  ${WATER_HEADWATER_FUNCTION_GLSL}
  ${WATER_SURFACE_SHADING_GLSL}

  void main() {
    if (length(vWorldPosition.xz - uPatchCenter) >= uInnerFadeRadius || nevaHeadwaterOwnsSurface(vWorldPosition.xz)) {
      discard;
    }

    // Subtle low-frequency scrolling normal, respecting reduced motion. This is
    // the only shading difference from the base plane, and it fades out with
    // the rim so the two surfaces agree at their complementary coverage boundary.
    float scrollSpeed = mix(uDetailNormalScrollSpeed, 0.0, uReducedMotion);
    vec3 detailScrollNormal = nevaScrollingDetailNormal(
      vWorldPosition.xz,
      uTime,
      scrollSpeed,
      uDetailNormalStrength * (1.0 - smoothstep(uInnerFadeRadius * 0.66, uInnerFadeRadius, length(vWorldPosition.xz - uPatchCenter))) * nevaHeadwaterDetailWeight(vWorldPosition.xz)
    );
    vec3 shadingNormal = normalize(
      normalize(vWaveNormal) + (detailScrollNormal - vec3(0.0, 1.0, 0.0))
    );

    vec4 shaded = nevaShadeWaterSurface(
      vWorldPosition,
      shadingNormal,
      vWaveHeight,
      vSignedWaterDistance,
      vRegionWeights
    );

    // The coarse surface covers only the fragments discarded above.
    outColor = shaded;
    ${WATER_OUTPUT_GLSL}
  }
`;

export class NearWaterPatch {
  public readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly config = CANONICAL_RENDER_CONFIG.waterSurface.nearPatch;
  private readonly patchCenter = new THREE.Vector2();
  private readonly gridSpacing: THREE.Vector2;
  private readonly gridOrigin: THREE.Vector2;

  constructor(options: NearWaterPatchOptions) {
    const size = options.size ?? this.config.sizeMeters;
    const segments = options.segments ?? this.config.segments;

    this.gridSpacing = options.baseGridSpacing?.clone() ?? new THREE.Vector2(size/segments,size/segments);
    this.gridOrigin = new THREE.Vector2(options.waterProfileBounds.x,options.waterProfileBounds.y);
    // Fine motion is normal-only. Matching the base lattice also matches its
    // displaced triangle chords, so complementary fragment coverage cannot
    // reveal sub-pixel cracks along the circular handoff.
    const sx = Math.ceil(size / this.gridSpacing.x / 2) * 2;
    const sz = Math.ceil(size / this.gridSpacing.y / 2) * 2;
    const geometry = new THREE.PlaneGeometry(sx*this.gridSpacing.x, sz*this.gridSpacing.y, sx, sz);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: nearVertexShader,
      fragmentShader: nearFragmentShader,
      uniforms: {
        ...createHeadwaterUniforms(),
        ...options.coastalUniforms,
        uTime: { value: 0 },
        uRoughness: { value: 0.2 },
        uWindSpeed: { value: 0 },
        uWindDirection: { value: new THREE.Vector2(0, 1) },
        uWaterProfileMap: { value: options.waterProfileMap },
        uWaterProfileBounds: { value: options.waterProfileBounds },
        uPatchCenter: { value: this.patchCenter },
        uInnerFadeRadius: { value: this.config.innerFadeRadiusMeters },
        uOuterFadeRadius: { value: this.config.outerFadeRadiusMeters },
        uDetailBandAmplitude: { value: this.config.detailBandAmplitude },
        uDetailBandFrequency: { value: this.config.detailBandFrequency },
        uDetailBandSpeed: { value: this.config.detailBandSpeed },
        uDetailNormalStrength: { value: this.config.detailNormalStrength },
        uDetailNormalScrollSpeed: { value: this.config.detailNormalScrollSpeed },
        uReducedMotion: { value: 0 },
        uReflectionMode: { value: 2 },
        uNormalQuantization: { value: CANONICAL_RENDER_CONFIG.waterSurface.normalQuantizationSteps },
        uGlitterFocusNearMeters: { value: CANONICAL_RENDER_CONFIG.waterSurface.glitterFocusNearMeters },
        uGlitterFocusFarMeters: { value: CANONICAL_RENDER_CONFIG.waterSurface.glitterFocusFarMeters },
        uGlitterFarBroadening: { value: CANONICAL_RENDER_CONFIG.waterSurface.glitterFarBroadening },
        uPrimaryAmplitude: { value: vector(WATER_WAVE_CONFIG.primary.amplitude) },
        uPrimaryFrequency: { value: vector(WATER_WAVE_CONFIG.primary.frequency) },
        uPrimarySpeed: { value: vector(WATER_WAVE_CONFIG.primary.speed) },
        uCrossAmplitude: { value: vector(WATER_WAVE_CONFIG.cross.amplitude) },
        uCrossFrequency: { value: vector(WATER_WAVE_CONFIG.cross.frequency) },
        uCrossSpeed: { value: vector(WATER_WAVE_CONFIG.cross.speed) },
        uDetailAmplitude: { value: vector(WATER_WAVE_CONFIG.detail.amplitude) },
        uDetailFrequency: { value: vector(WATER_WAVE_CONFIG.detail.frequency) },
        uDetailSpeed: { value: vector(WATER_WAVE_CONFIG.detail.speed) },
        uRoughnessGain: { value: vector(WATER_WAVE_CONFIG.roughnessGain) },
        uOceanWindGain: { value: WATER_WAVE_CONFIG.oceanWindGainPerMeterSecond },
        uShallowColor: { value: new THREE.Color(PALETTE_HEX.water_shallow_01) },
        uMidColor: { value: new THREE.Color(PALETTE_HEX.water_mid_01) },
        uDeepColor: { value: new THREE.Color(PALETTE_HEX.water_deep_01) },
        uFoamColor: { value: new THREE.Color(PALETTE_HEX.foam_warm_01) },
        uSunDirection: { value: new THREE.Vector3(0.62, 0.62, 0.48).normalize() },
        uSunColor: { value: new THREE.Color(CANONICAL_RENDER_CONFIG.sun.colorHex) },
        uKeyLightStrength: { value: 1 },
        uDaylight: { value: 1 },
        uSkyColor: { value: new THREE.Color(PALETTE_HEX.sky_pale_01) },
        uSkyHorizonColor: { value: new THREE.Color(PALETTE_HEX.horizon_warm_01) },
        uFogColor: { value: new THREE.Color(CANONICAL_RENDER_CONFIG.fog.colorHex) },
        uFogNear: { value: CANONICAL_RENDER_CONFIG.fog.near },
        uFogFar: { value: CANONICAL_RENDER_CONFIG.fog.far },
        uFogDistanceDesaturation: { value: CANONICAL_RENDER_CONFIG.fog.distanceDesaturation },
        uPolygonCellScale: { value: CANONICAL_RENDER_CONFIG.waterSurface.polygonCellScaleMeters },
        uPolygonColorVariation: { value: CANONICAL_RENDER_CONFIG.waterSurface.polygonColorVariationStrength },
        uPolygonNormalStrength: { value: CANONICAL_RENDER_CONFIG.waterSurface.polygonNormalStrength },
        uFresnelStrength: { value: CANONICAL_RENDER_CONFIG.waterSurface.fresnelStrength },
        uSunGlintStrength: { value: CANONICAL_RENDER_CONFIG.waterSurface.sunGlintStrength },
        uShallowStartMeters: { value: CANONICAL_RENDER_CONFIG.waterSurface.shoreline.shallowStartMeters },
        uShallowEndMeters: { value: CANONICAL_RENDER_CONFIG.waterSurface.shoreline.shallowEndMeters },
        uShallowColorStrength: { value: CANONICAL_RENDER_CONFIG.waterSurface.shoreline.shallowColorStrength },
        uNearShoreNormalScale: { value: CANONICAL_RENDER_CONFIG.waterSurface.shoreline.nearShoreNormalScale },
        uDepthRampStartMeters: { value: CANONICAL_RENDER_CONFIG.waterSurface.depthRampStartMeters },
        uDepthRampEndMeters: { value: CANONICAL_RENDER_CONFIG.waterSurface.depthRampEndMeters },
        uDepthColorStrength: { value: CANONICAL_RENDER_CONFIG.waterSurface.depthColorStrength },
        uRapidsFoamStrength: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.rapidsFoamStrength },
        uRapidsGradeStart: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.rapidsGradeStart },
        uRapidsGradeFull: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.rapidsGradeFull },
        uRapidsCellScale: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.rapidsCellScaleMeters },
        uRapidsFlowSpeed: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.rapidsFlowMetersPerSecond },
        uEdgeOpacity: { value: CANONICAL_RENDER_CONFIG.waterSurface.shoreline.edgeOpacity },
        uBodyOpacity: { value: CANONICAL_RENDER_CONFIG.waterSurface.shoreline.bodyOpacity },
        uOpacityRampMeters: { value: CANONICAL_RENDER_CONFIG.waterSurface.shoreline.opacityRampMeters }
      },
      transparent: true,
      depthWrite: true,
      side: THREE.FrontSide
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "near_water_detail_patch";
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
  }

  public setQuality(tier: QualityTier): void {
    const tierConfig = CANONICAL_RENDER_CONFIG.waterSurface.quality[tier];
    this.mesh.visible = tierConfig.nearPatch;
    const mode = tierConfig.reflection === "flat" ? 0 : tierConfig.reflection === "skyGradient" ? 1 : 2;
    this.mesh.material.uniforms.uReflectionMode.value = mode;
    this.mesh.material.uniforms.uDetailNormalStrength.value = tierConfig.detailNormal
      ? this.config.detailNormalStrength
      : 0;
  }

  public update(
    timeSeconds: number,
    conditions: WaterConditions,
    cameraTarget: THREE.Vector3,
    options?: { reducedMotion?: boolean }
  ): void {
    const uniforms = this.mesh.material.uniforms;
    const windRadians = THREE.MathUtils.degToRad(conditions.windDirectionDeg);

    const snappedX = this.gridOrigin.x + Math.round((cameraTarget.x-this.gridOrigin.x) / this.gridSpacing.x) * this.gridSpacing.x;
    const snappedZ = this.gridOrigin.y + Math.round((cameraTarget.z-this.gridOrigin.y) / this.gridSpacing.y) * this.gridSpacing.y;
    this.mesh.position.set(snappedX, 0, snappedZ);
    this.patchCenter.set(snappedX, snappedZ);

    uniforms.uTime.value = timeSeconds;
    uniforms.uRoughness.value = THREE.MathUtils.clamp(conditions.seaRoughness, 0, 1);
    uniforms.uWindSpeed.value = Math.max(0, conditions.windSpeed);
    (uniforms.uWindDirection.value as THREE.Vector2).set(
      Math.sin(windRadians),
      Math.cos(windRadians)
    );
    uniforms.uReducedMotion.value = options?.reducedMotion ? 1 : 0;
  }

  public updateLighting(frame: LightingFrame): void {
    const uniforms = this.mesh.material.uniforms;
    const lightningOwnsKey = frame.lightning > 0.025;
    const moonOwnsKey = !lightningOwnsKey && frame.moonIntensity > frame.sunIntensity;
    (uniforms.uSunDirection.value as THREE.Vector3).copy(
      lightningOwnsKey
        ? frame.lightningDirection
        : moonOwnsKey ? frame.moonDirection : frame.sunDirection
    );
    (uniforms.uSunColor.value as THREE.Color).copy(
      lightningOwnsKey ? frame.lightningColor : moonOwnsKey ? frame.moonColor : frame.sunColor
    );
    uniforms.uKeyLightStrength.value = THREE.MathUtils.clamp(
      Math.max(
        frame.sunIntensity,
        frame.moonIntensity,
        frame.lightning * CANONICAL_RENDER_CONFIG.sun.intensity * 0.82
      ) / CANONICAL_RENDER_CONFIG.sun.intensity,
      0,
      1
    );
    uniforms.uDaylight.value = frame.daylight;
    (uniforms.uSkyColor.value as THREE.Color).copy(frame.skyTopColor);
    (uniforms.uSkyHorizonColor.value as THREE.Color).copy(frame.skyHorizonColor);
    (uniforms.uFogColor.value as THREE.Color).copy(frame.fogColor);
    uniforms.uFogNear.value = frame.fogNear;
    uniforms.uFogFar.value = frame.fogFar;
    uniforms.uFogDistanceDesaturation.value = CANONICAL_RENDER_CONFIG.fog.distanceDesaturation;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
