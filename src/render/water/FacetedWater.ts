import * as THREE from "three";
import { createWaterDepthMap, createCoastalUniforms, WATER_OUTPUT_GLSL, type CoastalUniforms } from "./CoastalOptics";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import type { LightingFrame } from "../lighting/LightingRig";
import { GROUND_POLYGON_CELL_GLSL } from "../materials/GroundPolygonCells";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import { WATER_SURFACE } from "../../world/WorldLayout";
import { NEVA_HEADWATERS } from "../../world/NevaHeadwaters";
import {
  WATER_WAVE_CONFIG,
  WaterSurface,
  waterSpatialProfile,
  type WaterConditions
} from "./WaterSurface";
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
import { NearWaterPatch } from "./NearWaterPatch";

export interface WaterOptions {
  width?: number;
  depth?: number;
  segmentsX?: number;
  segmentsZ?: number;
  centerX?: number;
  centerZ?: number;
}

export const SHORE_MASK_RESOLUTION = 512;
export const SHORE_MASK_METERS_PER_TEXEL = 750 / (SHORE_MASK_RESOLUTION - 1);

export function createWaterProfileMap(
  bounds: THREE.Vector4,
  width: number,
  height: number
): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const x = bounds.x + (column / (width - 1)) * bounds.z;
      const z = bounds.y + (row / (height - 1)) * bounds.w;
      const profile = waterSpatialProfile(x, z);
      const offset = (row * width + column) * 4;
      data[offset] = Math.round(
        THREE.MathUtils.clamp((profile.signedWaterDistance + 16) / 32, 0, 1) * 255
      );
      data[offset + 1] = Math.round(profile.weights.river * 255);
      data[offset + 2] = Math.round(profile.weights.ocean * 255);
      const angle = Math.atan2(profile.localDirection.y, profile.localDirection.x);
      data[offset + 3] = Math.round(((angle + Math.PI) / (Math.PI * 2)) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const vertexShader = /* glsl */ `
  ${WATER_WAVE_UNIFORMS_GLSL}
  ${WATER_HEADWATER_UNIFORMS_GLSL}

  out vec3 vWorldPosition;
  out vec3 vWaveNormal;
  out float vWaveHeight;
  out float vSignedWaterDistance;
  out vec3 vRegionWeights;

  ${WATER_WAVE_FUNCTION_GLSL}
  ${WATER_HEADWATER_FUNCTION_GLSL}

  void main() {
    vec4 baseWorldPosition = modelMatrix * vec4(position, 1.0);
    vec4 profile = profileAt(baseWorldPosition.xz);
    float height;
    vec3 waveNormal;
    waveHeightAndNormal(baseWorldPosition.xz, profile, height, waveNormal);
    vec2 headwater = nevaHeadwaterElevationAndGrade(baseWorldPosition.xz);
    vec3 displaced = position;
    displaced.y += headwater.x + height;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    float riverWeight = profile.g;
    float oceanWeight = profile.b;
    vRegionWeights = vec3(riverWeight, max(0.0, 1.0 - riverWeight - oceanWeight), oceanWeight);
    vSignedWaterDistance = profile.r * 32.0 - 16.0;
    vWorldPosition = worldPosition.xyz;
    vWaveNormal = nevaWaterSurfaceNormal(waveNormal, headwater.y);
    vWaveHeight = height;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  ${WATER_SHADING_UNIFORMS_GLSL}
  ${WATER_PROFILE_UNIFORMS_GLSL}
  ${WATER_HEADWATER_UNIFORMS_GLSL}

  uniform vec2 uNearPatchCenter;
  uniform float uNearPatchRadius;

  in vec3 vWorldPosition;
  in vec3 vWaveNormal;
  in float vWaveHeight;
  in float vSignedWaterDistance;
  in vec3 vRegionWeights;
  out vec4 outColor;

  ${GROUND_POLYGON_CELL_GLSL}
  ${WATER_NOISE_GLSL}
  ${WATER_PROFILE_FUNCTION_GLSL}
  ${WATER_HEADWATER_FUNCTION_GLSL}
  ${WATER_SURFACE_SHADING_GLSL}

  void main() {
    // When the high-tier near detail patch is active, discard base water
    // fragments inside the inner radius to eliminate overdraw, double-blending,
    // and geometric chord-clipping between coarse and fine meshes.
    if (uNearPatchRadius > 0.5 && !nevaHeadwaterOwnsSurface(vWorldPosition.xz)) {
      if (length(vWorldPosition.xz - uNearPatchCenter) < uNearPatchRadius) {
        discard;
      }
    }

    outColor = nevaShadeWaterSurface(
      vWorldPosition,
      normalize(vWaveNormal),
      vWaveHeight,
      vSignedWaterDistance,
      vRegionWeights
    );
    ${WATER_OUTPUT_GLSL}
  }
`;

function vector(values: readonly [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(values[0], values[1], values[2]);
}

/** Keep the ocean grid unchanged and spend extra rows only on the steep run. */
export function createWaterGeometry(
  width: number,
  depth: number,
  segmentsX: number,
  segmentsZ: number,
  centerX: number,
  centerZ: number
): THREE.PlaneGeometry {
  const { bounds, elevationKnots } = NEVA_HEADWATERS;
  const minZ = centerZ - depth * 0.5;
  const maxZ = centerZ + depth * 0.5;
  const touchesHeadwaters = centerX + width * 0.5 >= bounds.minX
    && centerX - width * 0.5 <= bounds.maxX
    && maxZ >= bounds.minZ && minZ <= bounds.maxZ;
  const rows: number[] = [];
  const refinementStart = Math.max(minZ, bounds.minZ);
  const refinementEnd = Math.min(maxZ, bounds.maxZ);
  for (let row = 0; row <= segmentsZ; row++) {
    const z = minZ + row / segmentsZ * depth;
    if (!touchesHeadwaters || z < refinementStart || z > refinementEnd) rows.push(z);
  }
  if (touchesHeadwaters) {
    const boundaries = [refinementStart, refinementEnd, ...elevationKnots.map((knot) => knot.z)]
      .filter((z) => z >= refinementStart && z <= refinementEnd)
      .sort((a, b) => a - b);
    const spacing = CANONICAL_RENDER_CONFIG.waterSurface.headwaters.maxRowSpacingMeters;
    rows.push(refinementStart);
    for (let index = 1; index < boundaries.length; index++) {
      const start = boundaries[index - 1];
      const end = boundaries[index];
      const count = Math.max(1, Math.ceil((end - start) / spacing));
      for (let step = 1; step <= count; step++) rows.push(start + (end - start) * step / count);
    }
  }
  const orderedRows = [...new Set(rows)].sort((a, b) => a - b);
  const geometry = new THREE.PlaneGeometry(width, depth, segmentsX, orderedRows.length - 1);
  geometry.rotateX(-Math.PI / 2);
  if (touchesHeadwaters) {
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
    for (let row = 0; row < orderedRows.length; row++) {
      for (let column = 0; column <= segmentsX; column++) {
        const index = row * (segmentsX + 1) + column;
        positions.setZ(index, orderedRows[row] - centerZ);
        uv.setY(index, 1 - (orderedRows[row] - minZ) / depth);
      }
    }
    positions.needsUpdate = true;
    uv.needsUpdate = true;
  }
  geometry.computeBoundingBox();
  // GPU displacement must participate in frustum bounds even though the
  // underlying attribute stays at zero. One metre also encloses wave motion.
  geometry.boundingBox!.min.y = -1;
  geometry.boundingBox!.max.y = (touchesHeadwaters ? elevationKnots[0].elevation : 0) + 1;
  geometry.boundingSphere = geometry.boundingBox!.getBoundingSphere(new THREE.Sphere());
  return geometry;
}

export class FacetedWater {
  public mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  public readonly group = new THREE.Group();
  public readonly meshes: readonly THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[];
  public readonly waterProfileMap: THREE.DataTexture;
  public readonly depthMap: THREE.DataTexture;
  public readonly coastalUniforms: CoastalUniforms;
  public readonly waterProfileBounds: THREE.Vector4;
  public readonly nearPatch: NearWaterPatch;
  private qualityTier: QualityTier = CANONICAL_RENDER_CONFIG.qualityTier;
  private conditions: WaterConditions = {
    seaRoughness: 0.2,
    windDirectionDeg: 0,
    windSpeed: 0
  };

  constructor(options: WaterOptions = {}) {
    const width = options.width ?? WATER_SURFACE.width;
    const depth = options.depth ?? WATER_SURFACE.depth;
    const segmentsX = options.segmentsX ?? WATER_SURFACE.segmentsX;
    const segmentsZ = options.segmentsZ ?? WATER_SURFACE.segmentsZ;
    const centerX = options.centerX ?? WATER_SURFACE.centerX;
    const centerZ = options.centerZ ?? WATER_SURFACE.centerZ;
    const profileBounds = new THREE.Vector4(
      centerX - width * 0.5,
      centerZ - depth * 0.5,
      width,
      depth
    );
    this.waterProfileBounds = profileBounds;

    const profileWidth = Math.max(2, Math.round(width / SHORE_MASK_METERS_PER_TEXEL) + 1);
    const profileHeight = Math.max(2, Math.round(depth / SHORE_MASK_METERS_PER_TEXEL) + 1);
    this.waterProfileMap = createWaterProfileMap(profileBounds, profileWidth, profileHeight);
    this.depthMap = createWaterDepthMap(profileBounds, profileWidth, profileHeight);
    this.coastalUniforms = createCoastalUniforms(this.depthMap, profileBounds);
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        ...createHeadwaterUniforms(),
        ...this.coastalUniforms,
        uTime: { value: 0 },
        uReducedMotion: { value: 0 },
        uRoughness: { value: 0.2 },
        uWindSpeed: { value: 0 },
        uWindDirection: { value: new THREE.Vector2(0, 1) },
        uWaterProfileMap: { value: this.waterProfileMap },
        uWaterProfileBounds: { value: profileBounds },
        uReflectionMode: { value: 2 },
        uNormalQuantization: { value: CANONICAL_RENDER_CONFIG.waterSurface.normalQuantizationSteps },
        uNearPatchCenter: { value: new THREE.Vector2() },
        uNearPatchRadius: { value: 0 },
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
      opacity: 0.96,
      depthWrite: true,
      side: THREE.FrontSide
    });

    const chunkCountX = width > 900 ? 2 : 1;
    const chunkMeshes: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
    let consumedSegments = 0;
    for (let chunkIndex = 0; chunkIndex < chunkCountX; chunkIndex += 1) {
      const remainingSegments = segmentsX - consumedSegments;
      const chunkSegmentsX = chunkIndex === chunkCountX - 1
        ? remainingSegments
        : Math.max(1, Math.round(segmentsX / chunkCountX));
      const chunkWidth = width * chunkSegmentsX / segmentsX;
      const chunkCenterX = centerX - width * 0.5 + width * (consumedSegments + chunkSegmentsX * 0.5) / segmentsX;
      consumedSegments += chunkSegmentsX;
      const geometry = createWaterGeometry(chunkWidth, depth, chunkSegmentsX, segmentsZ, chunkCenterX, centerZ);
      const chunk = new THREE.Mesh(geometry, material);
      chunk.position.set(
        chunkCenterX,
        0,
        centerZ
      );
      chunk.receiveShadow = false;
      chunk.castShadow = false;
      chunk.frustumCulled = true;
      chunk.name = `faceted_water_${chunkIndex}`;
      chunkMeshes.push(chunk);
      this.group.add(chunk);
    }
    this.meshes = chunkMeshes;
    this.mesh = chunkMeshes[0];
    this.group.name = "faceted_water";

    this.nearPatch = new NearWaterPatch({
      waterProfileMap: this.waterProfileMap,
      waterProfileBounds: this.waterProfileBounds,
      coastalUniforms: this.coastalUniforms,
      baseGridSpacing: new THREE.Vector2(width/segmentsX, depth/segmentsZ)
    });
    this.group.add(this.nearPatch.mesh);
    for (const mesh of [...this.meshes, this.nearPatch.mesh]) mesh.renderOrder = -100;
    this.setQuality(this.qualityTier);
  }

  public setQuality(tier: QualityTier): void {
    this.qualityTier = tier;
    const tierConfig = CANONICAL_RENDER_CONFIG.waterSurface.quality[tier];
    const mode = tierConfig.reflection === "flat" ? 0 : tierConfig.reflection === "skyGradient" ? 1 : 2;
    this.mesh.material.uniforms.uReflectionMode.value = mode;
    this.coastalUniforms.uRippleNormalStrength.value = tierConfig.detailNormal
      ? CANONICAL_RENDER_CONFIG.waterSurface.optics.rippleNormalStrength : 0;
    this.mesh.material.uniforms.uNormalQuantization.value = CANONICAL_RENDER_CONFIG.waterSurface.normalQuantizationSteps;
    this.mesh.material.uniforms.uNearPatchRadius.value = tierConfig.nearPatch
      ? CANONICAL_RENDER_CONFIG.waterSurface.nearPatch.innerFadeRadiusMeters
      : 0;
    this.nearPatch.setQuality(tier);
  }

  public update(
    timeSeconds: number,
    conditions: WaterConditions,
    cameraTarget?: THREE.Vector3,
    options?: { reducedMotion?: boolean }
  ): void {
    this.conditions = {
      seaRoughness: THREE.MathUtils.clamp(conditions.seaRoughness, 0, 1),
      windDirectionDeg: conditions.windDirectionDeg,
      windSpeed: Math.max(0, conditions.windSpeed)
    };
    const uniforms = this.mesh.material.uniforms;
    const windRadians = THREE.MathUtils.degToRad(this.conditions.windDirectionDeg);
    this.coastalUniforms.uCoastTime.value = timeSeconds;
    this.coastalUniforms.uCoastReducedMotion.value = options?.reducedMotion ? 1 : 0;
    uniforms.uTime.value = timeSeconds;
    uniforms.uReducedMotion.value = options?.reducedMotion ? 1 : 0;
    uniforms.uRoughness.value = this.conditions.seaRoughness;
    uniforms.uWindSpeed.value = this.conditions.windSpeed;
    (uniforms.uWindDirection.value as THREE.Vector2).set(
      Math.sin(windRadians),
      Math.cos(windRadians)
    );

    if (cameraTarget) {
      if (this.nearPatch.mesh.visible) {
        this.nearPatch.update(timeSeconds, this.conditions, cameraTarget, options);
        // Complementary coverage must use the patch's actual lattice-snapped
        // center; a separate one-meter snap creates a crescent of missing water.
        (uniforms.uNearPatchCenter.value as THREE.Vector2).copy(
          this.nearPatch.mesh.material.uniforms.uPatchCenter.value as THREE.Vector2
        );
      }
    }
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

    this.nearPatch.updateLighting(frame);
  }

  public sample(x: number, z: number, timeSeconds: number): ReturnType<typeof WaterSurface.sample> {
    return WaterSurface.sample(x, z, timeSeconds, this.conditions);
  }

  public dispose(): void {
    this.waterProfileMap.dispose();
    this.depthMap.dispose();
    for (const mesh of this.meshes) mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.nearPatch.dispose();
  }
}
