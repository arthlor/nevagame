import { runSync, runCooperatively } from "../../utils/CooperativeTask";
import * as THREE from "three";
import { createWaterDepthTexture, writeWaterDepthTexel, createCoastalUniforms, WATER_OUTPUT_GLSL, type CoastalUniforms } from "./CoastalOptics";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import type { LightingFrame } from "../lighting/LightingRig";
import { GROUND_POLYGON_CELL_GLSL } from "../materials/GroundPolygonCells";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import { WATER_SURFACE, WorldLayout } from "../../world/WorldLayout";
import { NEVA_HEADWATERS } from "../../world/NevaHeadwaters";
import {
  createWaveUniforms,
  maxWaveDisplacement,
  WaterSurface,
  waterSpatialProfile,
  type WaterConditions,
  type WaterSpatialProfile,
  type WaterSpatialQueries
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
import { HeadwaterFall } from "./HeadwaterFall";
import { tileWaterGeometry } from "./waterSurfaceTiles";

export interface WaterOptions {
  width?: number;
  depth?: number;
  segmentsX?: number;
  segmentsZ?: number;
  centerX?: number;
  centerZ?: number;
}

/**
 * World-space sampling for the CPU-authored water profile and depth maps.
 * Keeping this independent from the total ocean dimensions prevents a larger
 * archipelago from multiplying startup work while linear filtering preserves
 * the authored shoreline transition between samples.
 */
export const SHORE_MASK_METERS_PER_TEXEL = 3;

export function createWaterProfileMap(bounds: THREE.Vector4, width: number, height: number): THREE.DataTexture {
  return runSync(waterProfileMapSteps(bounds, width, height));
}

export function* waterProfileMapSteps(
  bounds: THREE.Vector4, width: number, height: number
): Generator<void, THREE.DataTexture, void> {
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      if (column % 32 === 0) yield;
      const x = bounds.x + (column / (width - 1)) * bounds.z;
      const z = bounds.y + (row / (height - 1)) * bounds.w;
      const profile = waterSpatialProfile(x, z);
      const offset = (row * width + column) * 4;
      writeWaterProfileTexel(data, offset, profile);
    }
  }
  return createWaterProfileTexture(data, width, height);
}

function writeWaterProfileTexel(data: Uint8Array, offset: number, profile: WaterSpatialProfile): void {
  data[offset] = Math.round(
    THREE.MathUtils.clamp((profile.signedWaterDistance + 16) / 32, 0, 1) * 255
  );
  data[offset + 1] = Math.round(profile.weights.river * 255);
  data[offset + 2] = Math.round(profile.weights.ocean * 255);
  const angle = Math.atan2(profile.localDirection.y, profile.localDirection.x);
  data[offset + 3] = Math.round(((angle + Math.PI) / (Math.PI * 2)) * 255);
}

function createWaterProfileTexture(data: Uint8Array, width: number, height: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Keep the same lattice/encodings while sharing expensive geography queries per texel. */
export function* waterFieldMapsSteps(
  bounds: THREE.Vector4, width: number, height: number
): Generator<void, { profile: THREE.DataTexture; depth: THREE.DataTexture }, void> {
  const profileData = new Uint8Array(width * height * 4);
  const depthData = new Uint16Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const z = bounds.y + (row / (height - 1)) * bounds.w;
    for (let column = 0; column < width; column += 1) {
      if (column % 32 === 0) yield;
      const x = bounds.x + (column / (width - 1)) * bounds.z;
      const queries: WaterSpatialQueries = { marine: WorldLayout.marineSampleAt(x, z) };
      const profile = waterSpatialProfile(x, z, queries);
      const offset = (row * width + column) * 4;
      writeWaterProfileTexel(profileData, offset, profile);
      writeWaterDepthTexel(depthData, offset, x, z, queries.marine.signedShoreDistance, queries.shore);
    }
  }
  // Textures are allocated only after the abortable sampling work is complete.
  return {
    profile: createWaterProfileTexture(profileData, width, height),
    depth: createWaterDepthTexture(depthData, width, height)
  };
}

const vertexShader = /* glsl */ `
  ${WATER_WAVE_UNIFORMS_GLSL}
  ${WATER_HEADWATER_UNIFORMS_GLSL}

  out vec3 vWorldPosition;
  out vec3 vWaveNormal;
  out float vWaveHeight;
  out float vSignedWaterDistance;
  out vec3 vRegionWeights;
  out float vWaveFold;

  ${WATER_WAVE_FUNCTION_GLSL}
  ${WATER_HEADWATER_FUNCTION_GLSL}

  void main() {
    vec4 baseWorldPosition = modelMatrix * vec4(position, 1.0);
    vec4 profile = profileAt(baseWorldPosition.xz);
    float height;
    vec2 offset;
    vec3 waveNormal;
    float fold;
    waveGerstner(baseWorldPosition.xz, profile, nevaBedWaterDepth(baseWorldPosition.xz),
      height, offset, waveNormal, fold);
    vec2 headwater = nevaHeadwaterElevationAndGrade(baseWorldPosition.xz);
    // The authored fall and its graded approach own their own surface shape,
    // so the trochoid may lift them but must not slide them off the channel.
    offset *= nevaHeadwaterDetailWeight(baseWorldPosition.xz);
    // The mesh carries translation only, so a world-space horizontal offset
    // applies unchanged in object space.
    vec3 displaced = position;
    displaced.xz += offset;
    displaced.y += headwater.x + height;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    float riverWeight = profile.g;
    float oceanWeight = profile.b;
    vRegionWeights = vec3(riverWeight, max(0.0, 1.0 - riverWeight - oceanWeight), oceanWeight);
    vSignedWaterDistance = profile.r * 32.0 - 16.0;
    vWorldPosition = worldPosition.xyz;
    vWaveNormal = nevaWaterSurfaceNormal(waveNormal, headwater.y);
    vWaveHeight = height;
    vWaveFold = fold;
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
  in float vWaveFold;
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

    // The profile map carries the authored channel tangent; the shading uses
    // it to carry surface detail downstream with the current.
    float profileAngle = profileAt(vWorldPosition.xz).a * 6.28318530718 - 3.14159265359;
    vec2 localFlow = vec2(cos(profileAngle), sin(profileAngle));
    outColor = nevaShadeWaterSurface(
      vWorldPosition,
      normalize(vWaveNormal),
      vWaveHeight,
      vSignedWaterDistance,
      vRegionWeights,
      localFlow,
      vWaveFold
    );
    ${WATER_OUTPUT_GLSL}
  }
`;

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
    const headwaterConfig = CANONICAL_RENDER_CONFIG.waterSurface.headwaters;
    // The authored fall face drops metres over a few metres of run, so it gets
    // its own finer rows; everywhere else keeps the band's default spacing.
    // The transition feathers over 2.5 m either side: an abrupt density step
    // at the lip/landing lines shades as a visible seam across the water.
    const fall = NEVA_HEADWATERS.fall;
    const spacingFor = (start: number, end: number): number => {
      const mid = (start + end) * 0.5;
      const distanceToBand = mid < fall.lipZ ? fall.lipZ - mid
        : mid > fall.landingZ ? mid - fall.landingZ : 0;
      const feather = THREE.MathUtils.smoothstep(distanceToBand, 0, 2.5);
      return THREE.MathUtils.lerp(
        Math.min(headwaterConfig.maxRowSpacingMeters, headwaterConfig.fallRowSpacingMeters),
        headwaterConfig.maxRowSpacingMeters,
        feather
      );
    };
    rows.push(refinementStart);
    for (let index = 1; index < boundaries.length; index++) {
      const start = boundaries[index - 1];
      const end = boundaries[index];
      const spacing = spacingFor(start, end);
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
  // underlying attribute stays at zero. The trochoid also moves water
  // sideways, so the box grows in X/Z as well; a vertical-only margin would
  // cull a tile whose crests are still on screen.
  const margin = maxWaveDisplacement();
  geometry.boundingBox!.min.y = -margin.vertical;
  geometry.boundingBox!.max.y = (touchesHeadwaters ? elevationKnots[0].elevation : 0) + margin.vertical;
  geometry.boundingBox!.min.x -= margin.horizontal;
  geometry.boundingBox!.max.x += margin.horizontal;
  geometry.boundingBox!.min.z -= margin.horizontal;
  geometry.boundingBox!.max.z += margin.horizontal;
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
  public readonly headwaterFall: HeadwaterFall;
  private qualityTier: QualityTier = CANONICAL_RENDER_CONFIG.qualityTier;
  private conditions: WaterConditions = {
    seaRoughness: 0.2,
    windDirectionDeg: 0,
    windSpeed: 0
  };

  public static async create(options: WaterOptions = {}, signal?: AbortSignal): Promise<FacetedWater> {
    const width = options.width ?? WATER_SURFACE.width;
    const depth = options.depth ?? WATER_SURFACE.depth;
    const bounds = new THREE.Vector4(
      (options.centerX ?? WATER_SURFACE.centerX) - width * 0.5,
      (options.centerZ ?? WATER_SURFACE.centerZ) - depth * 0.5, width, depth
    );
    const columns = Math.max(2, Math.round(width / SHORE_MASK_METERS_PER_TEXEL) + 1);
    const rows = Math.max(2, Math.round(depth / SHORE_MASK_METERS_PER_TEXEL) + 1);
    performance.mark("neva.startup.water-fields.begin");
    const fields = await runCooperatively(waterFieldMapsSteps(bounds, columns, rows), signal);
    performance.mark("neva.startup.water-fields.ready");
    try {
      signal?.throwIfAborted();
      const water = new FacetedWater(options, fields);
      performance.mark("neva.startup.water-geometry.ready");
      return water;
    } catch (error) {
      fields.profile.dispose();
      fields.depth.dispose();
      throw error;
    }
  }

  constructor(options: WaterOptions = {}, prepared?: { profile: THREE.DataTexture; depth: THREE.DataTexture }) {
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
    const fields = prepared ?? runSync(waterFieldMapsSteps(profileBounds, profileWidth, profileHeight));
    this.waterProfileMap = fields.profile;
    this.depthMap = fields.depth;
    this.coastalUniforms = createCoastalUniforms(this.depthMap, profileBounds);
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        ...createHeadwaterUniforms(),
        // The wave field first, so the shared coastal uniforms keep ownership
        // of the bed map the render pipeline updates.
        ...createWaveUniforms(),
        ...this.coastalUniforms,
        uReducedMotion: { value: 0 },
        uWaterProfileMap: { value: this.waterProfileMap },
        uWaterProfileBounds: { value: profileBounds },
        uReflectionMode: { value: 2 },
        uNormalQuantization: { value: CANONICAL_RENDER_CONFIG.waterSurface.normalQuantizationSteps },
        uNearPatchCenter: { value: new THREE.Vector2() },
        uNearPatchRadius: { value: 0 },
        uGlitterFocusNearMeters: { value: CANONICAL_RENDER_CONFIG.waterSurface.glitterFocusNearMeters },
        uGlitterFocusFarMeters: { value: CANONICAL_RENDER_CONFIG.waterSurface.glitterFocusFarMeters },
        uGlitterFarBroadening: { value: CANONICAL_RENDER_CONFIG.waterSurface.glitterFarBroadening },
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
        uWhitecapFold: { value: new THREE.Vector2(...CANONICAL_RENDER_CONFIG.waterSurface.whitecap.foldRange) },
        uWhitecapStrength: { value: CANONICAL_RENDER_CONFIG.waterSurface.whitecap.strength },
        uCrestShading: { value: new THREE.Vector3(
          CANONICAL_RENDER_CONFIG.waterSurface.crestShading.strength,
          ...CANONICAL_RENDER_CONFIG.waterSurface.crestShading.fadeFootprintMeters
        ) },
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
        uRiverFlowSpeed: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.riverFlowMetersPerSecond },
        uRiverFlowDepthStart: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.riverFlowDepthStart },
        uRiverFlowDepthFull: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.riverFlowDepthFullMeters },
        uRiverFlowNormalStrength: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.riverFlowNormalStrength },
        uRiverFlowLaneStrength: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.riverFlowLaneStrength },
        uRiverDepthShadeStrength: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.riverDepthShadeStrength },
        uRiverEdgeDepthFade: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.riverEdgeDepthFadeMeters },
        uRiverEdgeOpacity: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.riverEdgeOpacity },
        uRiverEdgeFoamStrength: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.riverEdgeFoamStrength },
        uRiverEdgeFoamScale: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.riverEdgeFoamScaleMeters },
        uPlungeRingSpeed: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.plungeRingSpeedMetersPerSecond },
        uPlungeRingWavelength: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.plungeRingWavelengthMeters },
        uPlungeRingStrength: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.plungeRingStrength },
        uPlungeRingSpan: { value: CANONICAL_RENDER_CONFIG.waterSurface.headwaters.plungeRingSpanMeters },
        uEdgeOpacity: { value: CANONICAL_RENDER_CONFIG.waterSurface.shoreline.edgeOpacity },
        uBodyOpacity: { value: CANONICAL_RENDER_CONFIG.waterSurface.shoreline.bodyOpacity },
        uOpacityRampMeters: { value: CANONICAL_RENDER_CONFIG.waterSurface.shoreline.opacityRampMeters },
        // Per-surface hull state for the shared contact-energy function.
        // Projection/near/far/SSR uniforms stay shared via coastalUniforms.
        uBodyCount: { value: 0 },
        uBodies: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0)) },
        uBodyVel: { value: Array.from({ length: 16 }, () => new THREE.Vector2(0, 0)) }
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
      // Partition the existing index grid: cell seams retain the same wave
      // chords and refined headwater rows as the unpartitioned surface.
      const tiles = tileWaterGeometry(geometry, CANONICAL_RENDER_CONFIG.waterSurface.cullingTileMeters,
        maxWaveDisplacement().horizontal);
      geometry.dispose();
      for (const [tileIndex, tile] of tiles.entries()) {
        const chunk = new THREE.Mesh(tile, material);
        chunk.position.set(
          chunkCenterX,
          0,
          centerZ
        );
        chunk.receiveShadow = false;
        chunk.castShadow = false;
        chunk.frustumCulled = true;
        chunk.name = `faceted_water_${chunkIndex}_${tileIndex}`;
        chunkMeshes.push(chunk);
        this.group.add(chunk);
      }
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
    // The falling sheet shares this material's uniform objects, so one update
    // path drives the channel, the pool and the fall together.
    this.headwaterFall = new HeadwaterFall({ sharedUniforms: material.uniforms });
    this.group.add(this.headwaterFall.group);
    for (const mesh of [...this.meshes, this.nearPatch.mesh]) mesh.renderOrder = -100;
    this.setQuality(this.qualityTier);
  }

  public setQuality(tier: QualityTier): void {
    this.qualityTier = tier;
    const tierConfig = CANONICAL_RENDER_CONFIG.waterSurface.quality[tier];
    const mode = tierConfig.reflection === "flat" ? 0 : tierConfig.reflection === "skyGradient" ? 1 : 2;
    this.mesh.material.uniforms.uReflectionMode.value = mode;
    // SSR is High-only; Medium/Low keep the analytic sky reflection.
    this.coastalUniforms.uSsrEnabled.value = tier === "high" ? 1 : 0;
    this.coastalUniforms.uRippleNormalStrength.value = tierConfig.detailNormal
      ? CANONICAL_RENDER_CONFIG.waterSurface.optics.rippleNormalStrength : 0;
    this.mesh.material.uniforms.uNormalQuantization.value = CANONICAL_RENDER_CONFIG.waterSurface.normalQuantizationSteps;
    this.mesh.material.uniforms.uNearPatchRadius.value = tierConfig.nearPatch
      ? CANONICAL_RENDER_CONFIG.waterSurface.nearPatch.innerFadeRadiusMeters
      : 0;
    this.nearPatch.setQuality(tier);
    this.headwaterFall.setQuality(tier);
  }

  public setFloatingBodies(
    bodies: ReadonlyArray<{ x: number; z: number; radius: number; strength: number; vx: number; vz: number }>
  ): void {
    const count = Math.min(16, bodies.length);
    for (const material of [this.mesh.material, this.nearPatch.mesh.material]) {
      material.uniforms.uBodyCount.value = count;
      for (let i = 0; i < count; i++) {
        const b = bodies[i]!;
        (material.uniforms.uBodies.value[i] as THREE.Vector4).set(b.x, b.z, b.radius, b.strength);
        (material.uniforms.uBodyVel.value[i] as THREE.Vector2).set(b.vx, b.vz);
      }
    }
  }

  public updateCamera(camera: THREE.Camera): void {
    this.coastalUniforms.uOpticsProjection.value.copy(camera.projectionMatrix);
    if ("near" in camera) this.coastalUniforms.uCameraNear.value = (camera as THREE.PerspectiveCamera).near;
    if ("far" in camera) this.coastalUniforms.uCameraFar.value = (camera as THREE.PerspectiveCamera).far;
  }

  public update(
    timeSeconds: number,
    conditions: WaterConditions,
    cameraTarget?: THREE.Vector3,
    options?: { reducedMotion?: boolean; camera?: THREE.Camera }
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

    if (options?.camera) this.updateCamera(options.camera);

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
    this.coastalUniforms.uCausticSunDirection.value.copy(frame.sunDirection);
    this.coastalUniforms.uCausticSunStrength.value = THREE.MathUtils.clamp(
      frame.sunIntensity / CANONICAL_RENDER_CONFIG.sun.intensity, 0, 1
    );
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
    this.headwaterFall.dispose();
  }
}
