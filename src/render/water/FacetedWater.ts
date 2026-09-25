import { runSync, runCooperatively } from "../../utils/CooperativeTask";
import * as THREE from "three";
import { createCoastalUniforms, WATER_OUTPUT_GLSL, type CoastalUniforms } from "./CoastalOptics";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import type { LightingFrame } from "../lighting/LightingRig";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import { WATER_SURFACE } from "../../world/WorldLayout";
import { NEVA_HEADWATERS } from "../../world/NevaHeadwaters";
import {
  bandDirection,
  createWaveUniforms,
  maxWaveDisplacement,
  swashRunupMeters,
  WATER_WAVE_CONFIG,
  WaterSurface,
  type WaterConditions
} from "./WaterSurface";
import { createWaterSpatialProfile, waterSpatialProfile } from "./waterProfile";
import {
  createWaterDepthTexture,
  createWaterProfileTexture,
  WATER_FIELD_BANK_DILATION_METERS,
  WATER_FIELD_METERS_PER_TEXEL,
  WaterFieldStore,
  waterFieldDimensions,
  waterFieldGrid,
  waterSurfaceFieldBounds,
  writeWaterProfileTexel
} from "./waterField";
import {
  createHeadwaterUniforms,
  WATER_HEADWATER_FUNCTION_GLSL,
  WATER_HEADWATER_UNIFORMS_GLSL,
  WATER_WAVE_FUNCTION_GLSL,
  WATER_WAVE_UNIFORMS_GLSL,
  WATER_NOISE_GLSL
} from "./waveGlsl";
import { WATER_SHADING_UNIFORMS_GLSL, WATER_SURFACE_SHADING_GLSL } from "./waterShadingGlsl";
import { WATER_LOD_VERTEX_GLSL, WaterLodSurface } from "./WaterLod";
import { HeadwaterFall } from "./HeadwaterFall";
import { waterDetailNormalTexture } from "./WaterDetailNormals";

export interface WaterOptions {
  width?: number;
  depth?: number;
  centerX?: number;
  centerZ?: number;
  /** Retained for callers of the former uniform grid; the LOD lattice ignores them. */
  segmentsX?: number;
  segmentsZ?: number;
}

/**
 * World-space sampling for the baked water profile and depth maps. Keeping
 * this independent from the total ocean dimensions prevents a larger
 * archipelago from multiplying startup work, while linear filtering preserves
 * the authored shoreline transition between samples.
 */
export const SHORE_MASK_METERS_PER_TEXEL = WATER_FIELD_METERS_PER_TEXEL;

export function createWaterProfileMap(bounds: THREE.Vector4, width: number, height: number): THREE.DataTexture {
  return runSync(waterProfileMapSteps(bounds, width, height));
}

export function* waterProfileMapSteps(
  bounds: THREE.Vector4, width: number, height: number
): Generator<void, THREE.DataTexture, void> {
  const data = new Uint8Array(width * height * 4);
  const profile = createWaterSpatialProfile();
  const profileOptions = { bankDilationMeters: WATER_FIELD_BANK_DILATION_METERS };
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      if (column % 32 === 0) yield;
      const x = bounds.x + (column / (width - 1)) * bounds.z;
      const z = bounds.y + (row / (height - 1)) * bounds.w;
      writeWaterProfileTexel(data, (row * width + column) * 4,
        waterSpatialProfile(x, z, undefined, profileOptions, profile));
    }
  }
  return createWaterProfileTexture(data, width, height);
}

/**
 * Bake both field maps through one store. For the canonical surface this is
 * the store the CPU wave mirror reads, so the textures upload the very arrays
 * buoyancy samples. Textures are allocated only after the abortable work.
 */
export function* waterFieldMapsSteps(
  bounds: THREE.Vector4, width: number, height: number
): Generator<void, { profile: THREE.DataTexture; depth: THREE.DataTexture }, void> {
  const grid = waterFieldGrid(bounds, width, height);
  const store = WaterFieldStore.isCanonicalGrid(grid) ? WaterFieldStore.canonical() : new WaterFieldStore(grid);
  yield* store.bakeSteps();
  return {
    profile: createWaterProfileTexture(store.profile, grid.columns, grid.rows),
    depth: createWaterDepthTexture(store.depth, grid.columns, grid.rows)
  };
}

const LOD_VERTEX_SHADER = /* glsl */ `
  ${WATER_WAVE_UNIFORMS_GLSL}
  ${WATER_HEADWATER_UNIFORMS_GLSL}
  ${WATER_LOD_VERTEX_GLSL}

  out vec3 vWorldPosition;
  out vec3 vWaveNormal;
  out float vWaveHeight;
  out vec3 vRegionWeights;
  out vec2 vFlow;
  out float vWaveFold;
  out float vSurfEnergy;
  out vec2 vSlopeVariance;
  out float vCellMeters;

  ${WATER_WAVE_FUNCTION_GLSL}
  ${WATER_HEADWATER_FUNCTION_GLSL}

  void main() {
    float cellMeters;
    vec2 lattice = nevaLodLattice(cellMeters);
    float height;
    vec2 offset;
    vec3 waveNormal;
    float fold;
    float surf;
    vec2 slopeVariance;
    vec3 weights;
    vec2 flow;
    nevaWaveField(lattice, cellMeters, height, offset, waveNormal, fold, surf, slopeVariance, weights, flow);
    // The sea-level lattice yields the graded headwater reach to its own
    // surface, so it never lifts onto the channel profile; toward that seam it
    // suppresses the horizontal orbit exactly as the headwater surface does.
    offset *= nevaHeadwaterDetailWeight(lattice);
    vec3 worldPosition = vec3(lattice.x + offset.x, height, lattice.y + offset.y);
    vWorldPosition = worldPosition;
    vWaveNormal = waveNormal;
    vWaveHeight = height;
    vRegionWeights = weights;
    vFlow = flow;
    vWaveFold = fold;
    vSurfEnergy = surf;
    vSlopeVariance = slopeVariance;
    vCellMeters = cellMeters;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
  }
`;

const HEADWATER_VERTEX_SHADER = /* glsl */ `
  ${WATER_WAVE_UNIFORMS_GLSL}
  ${WATER_HEADWATER_UNIFORMS_GLSL}
  uniform float uSurfaceCellMeters;

  out vec3 vWorldPosition;
  out vec3 vWaveNormal;
  out float vWaveHeight;
  out vec3 vRegionWeights;
  out vec2 vFlow;
  out float vWaveFold;
  out float vSurfEnergy;
  out vec2 vSlopeVariance;
  out float vCellMeters;

  ${WATER_WAVE_FUNCTION_GLSL}
  ${WATER_HEADWATER_FUNCTION_GLSL}

  void main() {
    vec3 base = (modelMatrix * vec4(position, 1.0)).xyz;
    float height;
    vec2 offset;
    vec3 waveNormal;
    float fold;
    float surf;
    vec2 slopeVariance;
    vec3 weights;
    vec2 flow;
    nevaWaveField(base.xz, uSurfaceCellMeters, height, offset, waveNormal, fold, surf, slopeVariance, weights, flow);
    vec2 headwater = nevaHeadwaterElevationAndGrade(base.xz);
    // The authored fall and its graded approach own their shape: the
    // trochoid may lift them but must not slide them off the channel.
    offset *= nevaHeadwaterDetailWeight(base.xz);
    vec3 worldPosition = vec3(base.x + offset.x, headwater.x + height, base.z + offset.y);
    vWorldPosition = worldPosition;
    vWaveNormal = nevaWaterSurfaceNormal(waveNormal, headwater.y);
    vWaveHeight = height;
    vRegionWeights = weights;
    vFlow = flow;
    vWaveFold = fold;
    vSurfEnergy = surf;
    vSlopeVariance = slopeVariance;
    vCellMeters = uSurfaceCellMeters;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  ${WATER_SHADING_UNIFORMS_GLSL}
  ${WATER_HEADWATER_UNIFORMS_GLSL}

  in vec3 vWorldPosition;
  in vec3 vWaveNormal;
  in float vWaveHeight;
  in vec3 vRegionWeights;
  in vec2 vFlow;
  in float vWaveFold;
  in float vSurfEnergy;
  in vec2 vSlopeVariance;
  in float vCellMeters;
  out vec4 outColor;

  ${WATER_NOISE_GLSL}
  ${WATER_HEADWATER_FUNCTION_GLSL}
  ${WATER_SURFACE_SHADING_GLSL}

  void main() {
    // Complementary ownership: the refined headwater surface draws the
    // elevated reach and the sea-level lattice draws everything else, split
    // on the same world-space test so the seam has neither gap nor overlap.
#ifdef NEVA_HEADWATER_SURFACE
    if (!nevaHeadwaterOwnsSurface(vWorldPosition.xz)) discard;
#else
    if (nevaHeadwaterOwnsSurface(vWorldPosition.xz)) discard;
#endif
    outColor = nevaShadeWaterSurface(
      vWorldPosition,
      vWaveNormal,
      vWaveHeight,
      vRegionWeights,
      vFlow,
      vWaveFold,
      vSurfEnergy,
      vSlopeVariance,
      vCellMeters
    );
    ${WATER_OUTPUT_GLSL}
  }
`;

/**
 * Fixed surface for the elevated headwater reach: rows follow the authored
 * elevation knots and densify across the fall face, where the default
 * spacing cannot hold the drop's chord error.
 */
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
    // The fall face drops metres over a few metres of run, so it gets its own
    // finer rows, feathered over 2.5 m so the density step cannot shade as a seam.
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
  // GPU displacement participates in the bounds even though the attribute
  // stays flat; the trochoid also moves water sideways.
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

/** The headwater surface covers exactly the reach it owns, at its own spacing. */
function createHeadwaterSurfaceGeometry(): { geometry: THREE.PlaneGeometry; center: THREE.Vector3 } {
  const { bounds, elevationKnots } = NEVA_HEADWATERS;
  const lastKnotZ = elevationKnots[elevationKnots.length - 1]!.z;
  const width = bounds.maxX - bounds.minX;
  const depth = lastKnotZ - bounds.minZ;
  const spacing = CANONICAL_RENDER_CONFIG.waterSurface.headwaters.surfaceColumnSpacingMeters;
  const columns = Math.max(2, Math.ceil(width / spacing));
  const center = new THREE.Vector3((bounds.minX + bounds.maxX) * 0.5, 0, (bounds.minZ + lastKnotZ) * 0.5);
  const geometry = createWaterGeometry(width, depth, columns, Math.max(2, Math.ceil(depth / spacing)), center.x, center.z);
  return { geometry, center };
}

/** Drift velocities of the two sea detail layers: along the swell, then the wind sea. */
function detailDrift(speeds: readonly [number, number]): THREE.Vector4 {
  const bands = WATER_WAVE_CONFIG.bands;
  const [swellX, swellZ] = bandDirection(bands[0]);
  const [windX, windZ] = bandDirection(bands[bands.length - 1]!);
  return new THREE.Vector4(swellX * speeds[0], swellZ * speeds[0], windX * speeds[1], windZ * speeds[1]);
}

function tierReflectionMode(tier: QualityTier): number {
  const reflection = CANONICAL_RENDER_CONFIG.waterSurface.quality[tier].reflection;
  return reflection === "flat" ? 0 : reflection === "skyGradient" ? 1 : 2;
}

export class FacetedWater {
  /** The full-patch LOD mesh; `meshes` lists every horizontal water mesh. */
  public readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  public readonly group = new THREE.Group();
  public readonly meshes: readonly THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[];
  public readonly lod: WaterLodSurface;
  public readonly headwaterSurface: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  public readonly waterProfileMap: THREE.DataTexture;
  public readonly depthMap: THREE.DataTexture;
  public readonly coastalUniforms: CoastalUniforms;
  public readonly waterProfileBounds: THREE.Vector4;
  /** Uniform objects shared by every water material, the fall and its mist. */
  public readonly uniforms: Record<string, THREE.IUniform>;
  public readonly headwaterFall: HeadwaterFall;
  private qualityTier: QualityTier = CANONICAL_RENDER_CONFIG.qualityTier;
  private conditions: WaterConditions = {
    seaRoughness: 0.2,
    windDirectionDeg: 0,
    windSpeed: 0,
    precipitation: 0
  };

  public static async create(options: WaterOptions = {}, signal?: AbortSignal): Promise<FacetedWater> {
    const bounds = FacetedWater.fieldBounds(options);
    const { columns, rows } = waterFieldDimensions(bounds.z, bounds.w);
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

  private static fieldBounds(options: WaterOptions): THREE.Vector4 {
    return waterSurfaceFieldBounds({
      width: options.width ?? WATER_SURFACE.width,
      depth: options.depth ?? WATER_SURFACE.depth,
      centerX: options.centerX ?? WATER_SURFACE.centerX,
      centerZ: options.centerZ ?? WATER_SURFACE.centerZ
    });
  }

  constructor(options: WaterOptions = {}, prepared?: { profile: THREE.DataTexture; depth: THREE.DataTexture }) {
    const bounds = FacetedWater.fieldBounds(options);
    this.waterProfileBounds = bounds;
    const { columns, rows } = waterFieldDimensions(bounds.z, bounds.w);
    const fields = prepared ?? runSync(waterFieldMapsSteps(bounds, columns, rows));
    this.waterProfileMap = fields.profile;
    this.depthMap = fields.depth;
    this.coastalUniforms = createCoastalUniforms(this.depthMap, bounds);
    const surface = CANONICAL_RENDER_CONFIG.waterSurface;
    const headwaters = surface.headwaters;
    this.uniforms = {
      ...createHeadwaterUniforms(),
      // The wave field first, so the shared coastal uniforms keep ownership
      // of the bed map the render pipeline updates.
      ...createWaveUniforms(),
      ...this.coastalUniforms,
      uReducedMotion: { value: 0 },
      uWaterProfileMap: { value: this.waterProfileMap },
      uReflectionMode: { value: 2 },
      uRainIntensity: { value: 0 },
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
      uFogNear: { value: CANONICAL_RENDER_CONFIG.fog.near },
      uFogFar: { value: CANONICAL_RENDER_CONFIG.fog.far },
      uFresnelStrength: { value: surface.fresnelStrength },
      uSunGlintStrength: { value: surface.sunGlintStrength },
      uWaterNormalMap: { value: waterDetailNormalTexture() },
      uDetailScale: { value: new THREE.Vector4(...surface.detailNormals.tileMeters, 1) },
      uDetailStrength: { value: new THREE.Vector2(...surface.detailNormals.strength) },
      // The sea layers drift with the swell and the wind sea, in their fixed
      // world headings.
      uDetailDrift: { value: detailDrift(surface.detailNormals.driftMetersPerSecond) },
      uDetailTier: { value: new THREE.Vector2(1, 1) },
      // The atmosphere's equirectangular sky probe, attached by the scene;
      // until then the analytic gradient stands in.
      uSkyProbe: { value: null as THREE.Texture | null },
      uSkyProbeEnabled: { value: 0 },
      uSkyProbeMaxLod: { value: 0 },
      uMicroSlope: { value: new THREE.Vector2(...surface.microSlopeVariance) },
      uWhitecapFold: { value: new THREE.Vector2(...surface.whitecap.foldRange) },
      uWhitecapScatter: { value: surface.whitecap.scatter },
      uWhitecapStrength: { value: surface.whitecap.strength },
      uCrestShading: { value: surface.crestShading.strength },
      uSurfFoam: { value: new THREE.Vector4(
        surface.surf.energyGain,
        surface.surf.dissolveScale,
        surface.surf.driftMetersPerSecond,
        surface.surf.foamStrength
      ) },
      uEdgeFoam: { value: new THREE.Vector2(surface.edgeFoam.bandMeters, surface.edgeFoam.strength) },
      uShallowEndMeters: { value: surface.shallowEndMeters },
      uDepthRampStartMeters: { value: surface.depthRampStartMeters },
      uDepthRampEndMeters: { value: surface.depthRampEndMeters },
      uDepthColorStrength: { value: surface.depthColorStrength },
      uRapidsFoamStrength: { value: headwaters.rapidsFoamStrength },
      uRapidsGradeStart: { value: headwaters.rapidsGradeStart },
      uRapidsGradeFull: { value: headwaters.rapidsGradeFull },
      uRapidsCellScale: { value: headwaters.rapidsCellScaleMeters },
      uRapidsFlowSpeed: { value: headwaters.rapidsFlowMetersPerSecond },
      uRiverFlowSpeed: { value: headwaters.riverFlowMetersPerSecond },
      uRiverFlowDepthStart: { value: headwaters.riverFlowDepthStart },
      uRiverFlowDepthFull: { value: headwaters.riverFlowDepthFullMeters },
      uRiverFlowLaneStrength: { value: headwaters.riverFlowLaneStrength },
      uRiverDepthShadeStrength: { value: headwaters.riverDepthShadeStrength },
      uRiverEdgeDepthFade: { value: headwaters.riverEdgeDepthFadeMeters },
      uRiverEdgeOpacity: { value: headwaters.riverEdgeOpacity },
      uRiverEdgeFoamStrength: { value: headwaters.riverEdgeFoamStrength },
      uRiverEdgeFoamScale: { value: headwaters.riverEdgeFoamScaleMeters },
      uPlungeRingSpeed: { value: headwaters.plungeRingSpeedMetersPerSecond },
      uPlungeRingWavelength: { value: headwaters.plungeRingWavelengthMeters },
      uPlungeRingStrength: { value: headwaters.plungeRingStrength },
      uPlungeRingSpan: { value: headwaters.plungeRingSpanMeters },
      // Per-surface hull state for the shared contact-energy function.
      uBodyCount: { value: 0 },
      uBodies: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uBodyVel: { value: Array.from({ length: 16 }, () => new THREE.Vector2(0, 0)) }
    };

    const materialParameters = {
      glslVersion: THREE.GLSL3,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: true,
      side: THREE.FrontSide
    } as const;
    this.lod = new WaterLodSurface(
      new THREE.ShaderMaterial({
        ...materialParameters,
        name: "neva_water_lod",
        vertexShader: LOD_VERTEX_SHADER,
        uniforms: { ...this.uniforms, uLodMorph: { value: [] as THREE.Vector2[] } }
      }),
      {
        minX: Math.min(-4096, bounds.x),
        minZ: Math.min(-4096, bounds.y),
        maxX: Math.max(4096, bounds.x + bounds.z),
        maxZ: Math.max(4096, bounds.y + bounds.w)
      }
    );
    this.lod.full.material.uniforms.uLodMorph.value = this.lod.ranges.morph;
    this.mesh = this.lod.full;

    const headwaterGeometry = createHeadwaterSurfaceGeometry();
    this.headwaterSurface = new THREE.Mesh(headwaterGeometry.geometry, new THREE.ShaderMaterial({
      ...materialParameters,
      name: "neva_water_headwater",
      vertexShader: HEADWATER_VERTEX_SHADER,
      defines: { NEVA_HEADWATER_SURFACE: "" },
      uniforms: {
        ...this.uniforms,
        uSurfaceCellMeters: { value: headwaters.surfaceColumnSpacingMeters }
      }
    }));
    this.headwaterSurface.position.copy(headwaterGeometry.center);
    this.headwaterSurface.name = "water_headwater_surface";
    this.headwaterSurface.frustumCulled = true;
    this.headwaterSurface.castShadow = false;
    this.headwaterSurface.receiveShadow = false;

    this.meshes = [this.lod.full, this.lod.quarter, this.headwaterSurface];
    for (const mesh of this.meshes) {
      mesh.renderOrder = -100;
      this.group.add(mesh);
    }
    // The falling sheet shares these uniform objects, so one update path
    // drives the channel, the pool and the fall together.
    this.headwaterFall = new HeadwaterFall({ sharedUniforms: this.uniforms });
    this.group.add(this.headwaterFall.group);
    this.group.name = "faceted_water";
    this.setQuality(this.qualityTier);
  }

  public setQuality(tier: QualityTier): void {
    this.qualityTier = tier;
    const tierConfig = CANONICAL_RENDER_CONFIG.waterSurface.quality[tier];
    this.uniforms.uReflectionMode.value = tierReflectionMode(tier);
    // SSR is High-only; Medium/Low keep the analytic sky reflection.
    this.coastalUniforms.uSsrEnabled.value = tier === "high" ? 1 : 0;
    // Tiers without full detail keep the large wind layer only, a little
    // weaker, so the surface stays alive at one texture tap per layer.
    (this.uniforms.uDetailTier.value as THREE.Vector2).set(
      tierConfig.detailNormal ? 1 : CANONICAL_RENDER_CONFIG.waterSurface.detailNormals.reducedTierStrength,
      tierConfig.detailNormal ? 1 : 0
    );
    this.lod.setQuality(tier);
    this.headwaterFall.setQuality(tier);
  }

  /**
   * Reflect the atmosphere's sky probe (clouds, gradient, sun halo). The
   * texture is owned by the sky; passing null restores the analytic sky.
   */
  public setSkyProbe(texture: THREE.Texture | null, width = 0): void {
    this.uniforms.uSkyProbe.value = texture;
    this.uniforms.uSkyProbeEnabled.value = texture ? 1 : 0;
    // Keep the coarsest mips out: below 8 texels across the sky collapses to
    // one colour, which rough water should never reflect.
    this.uniforms.uSkyProbeMaxLod.value = texture ? Math.max(0, Math.log2(Math.max(1, width)) - 3) : 0;
  }

  public setFloatingBodies(
    bodies: ReadonlyArray<{ x: number; z: number; radius: number; strength: number; vx: number; vz: number }>
  ): void {
    const count = Math.min(16, bodies.length);
    this.uniforms.uBodyCount.value = count;
    for (let i = 0; i < count; i++) {
      const b = bodies[i]!;
      (this.uniforms.uBodies.value[i] as THREE.Vector4).set(b.x, b.z, b.radius, b.strength);
      (this.uniforms.uBodyVel.value[i] as THREE.Vector2).set(b.vx, b.vz);
    }
  }

  /** Per-frame camera hook: SSR projection and the LOD selection for this view. */
  public updateCamera(camera: THREE.Camera): void {
    this.coastalUniforms.uOpticsProjection.value.copy(camera.projectionMatrix);
    if ("near" in camera) this.coastalUniforms.uCameraNear.value = (camera as THREE.PerspectiveCamera).near;
    if ("far" in camera) this.coastalUniforms.uCameraFar.value = (camera as THREE.PerspectiveCamera).far;
    this.lod.update(camera);
  }

  public update(
    timeSeconds: number,
    conditions: WaterConditions,
    _cameraTarget?: THREE.Vector3,
    options?: { reducedMotion?: boolean; camera?: THREE.Camera }
  ): void {
    this.conditions = {
      seaRoughness: THREE.MathUtils.clamp(conditions.seaRoughness, 0, 1),
      windDirectionDeg: conditions.windDirectionDeg,
      windSpeed: Math.max(0, conditions.windSpeed),
      precipitation: THREE.MathUtils.clamp(conditions.precipitation ?? 0, 0, 1)
    };
    const uniforms = this.uniforms;
    this.coastalUniforms.uCoastTime.value = timeSeconds;
    this.coastalUniforms.uCoastReducedMotion.value = options?.reducedMotion ? 1 : 0;
    this.coastalUniforms.uSwashRunup.value = swashRunupMeters(this.conditions.seaRoughness);
    uniforms.uTime.value = timeSeconds;
    uniforms.uReducedMotion.value = options?.reducedMotion ? 1 : 0;
    uniforms.uRoughness.value = this.conditions.seaRoughness;
    uniforms.uWindSpeed.value = this.conditions.windSpeed;
    uniforms.uRainIntensity.value = (options?.reducedMotion ? 0.4 : 1) * this.conditions.precipitation!;
    if (options?.camera) this.updateCamera(options.camera);
  }

  public updateLighting(frame: LightingFrame): void {
    const uniforms = this.uniforms;
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
    uniforms.uFogNear.value = frame.fogNear;
    uniforms.uFogFar.value = frame.fogFar;
  }

  public sample(x: number, z: number, timeSeconds: number): ReturnType<typeof WaterSurface.sample> {
    return WaterSurface.sample(x, z, timeSeconds, this.conditions);
  }

  /** Surface elevation only: the cheap query for buoyancy and effects. */
  public height(x: number, z: number, timeSeconds: number): number {
    return WaterSurface.height(x, z, timeSeconds, this.conditions);
  }

  public dispose(): void {
    this.waterProfileMap.dispose();
    this.depthMap.dispose();
    this.lod.dispose();
    this.lod.full.material.dispose();
    this.headwaterSurface.geometry.dispose();
    this.headwaterSurface.material.dispose();
    this.headwaterFall.dispose();
  }
}
