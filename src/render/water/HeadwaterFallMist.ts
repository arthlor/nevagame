/**
 * Plunge-pool spray for the authored headwater fall.
 *
 * The falling sheet lands in a pool that must visibly receive it: a burst of
 * rising, dissolving mist is the cheapest, most readable physical cue. Every
 * puff is a billboard in one geometry (one draw call per tier), placed from a
 * deterministic hash of its index, so the system carries no saved state, no
 * texture, no per-frame allocation and no gameplay RNG.
 *
 * Uniforms are *shared objects* with the main water material (time, daylight,
 * palette, fog, aerial perspective, reduced motion), so weather and quality
 * changes cannot desynchronize the spray from the sheet or the pool. The mesh
 * never samples the opaque capture.
 */

import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import { NEVA_HEADWATERS, headwaterElevationAt } from "../../world/NevaHeadwaters";
import { WorldLayout } from "../../world/WorldLayout";
import { WATER_NOISE_GLSL } from "./waveGlsl";
import { WATER_OUTPUT_GLSL } from "./CoastalOptics";
import { AERIAL_PERSPECTIVE_GLSL } from "../atmosphere/AerialPerspective";

export interface HeadwaterFallMistOptions {
  /** The main water material's uniform map; shared names must reference the same objects. */
  sharedUniforms: Record<string, THREE.IUniform>;
  tier: QualityTier;
}

function mistConfig() {
  return CANONICAL_RENDER_CONFIG.waterSurface.headwaters.fall.mist;
}

/** Stable integer hash: deterministic placement without touching gameplay RNG. */
function mistHash(value: number): number {
  let x = Math.imul(value + 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Two triangles per puff; aCorner drives the billboard, aSeed the life cycle. */
export function createHeadwaterMistGeometry(tier: QualityTier): THREE.BufferGeometry {
  const config = mistConfig();
  const count = config.count[tier];
  const landingX = WorldLayout.riverCenterX(NEVA_HEADWATERS.fall.landingZ);
  const landingZ = NEVA_HEADWATERS.fall.landingZ;
  const poolElevation = headwaterElevationAt(landingZ);
  const positions: number[] = [];
  const corners: number[] = [];
  const seeds: number[] = [];
  const quad = [
    [-1, -1], [1, -1], [1, 1],
    [-1, -1], [1, 1], [-1, 1]
  ] as const;
  for (let index = 0; index < count; index += 1) {
    const hash = (salt: number): number => mistHash(index * 5 + salt);
    // Bias the ring toward the impact: mist is densest where the sheet hits,
    // thinning as it drifts into the pool.
    const radial = Math.pow(hash(1), 1.35) * config.spreadMeters;
    const angle = hash(2) * Math.PI * 2;
    // Two thirds of the puffs boil up from the plunge itself; the rest cling
    // to the lower sheet, where the foot dissolves into falling spray.
    const alongSheet = hash(4) < 0.42;
    const x = landingX + Math.cos(angle) * radial;
    const z = alongSheet
      ? landingZ - 0.35 - hash(5) * 0.85
      : landingZ + 0.4 + Math.sin(angle) * radial * 0.85;
    const y = poolElevation + (alongSheet ? 0.35 + hash(6) * 1.2 : hash(7) * 0.55);
    const seed = hash(3);
    for (const [cornerX, cornerY] of quad) {
      positions.push(x, y, z);
      corners.push(cornerX, cornerY);
      seeds.push(seed);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aCorner", new THREE.Float32BufferAttribute(corners, 2));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) {
    geometry.boundingSphere.radius += config.sizeMeters + config.riseMeters + config.driftMeters;
  }
  return geometry;
}

export const HEADWATER_MIST_VERTEX_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uReducedMotion;
  uniform float uMistSizeMeters;
  uniform float uMistRiseMeters;
  uniform float uMistDriftMeters;
  uniform float uMistCycleSeconds;
  uniform float uMistOpacity;

  attribute vec2 aCorner;
  attribute float aSeed;

  out vec3 vWorldPosition;
  out vec2 vCorner;
  out float vAlpha;
  out float vSeed;

  void main() {
    float time = uTime * (1.0 - uReducedMotion * 0.6);
    float cycle = max(0.5, uMistCycleSeconds);
    float phase = fract(time / cycle + aSeed);
    // A puff grows, rises and fades over one cycle; the sine keeps both ends
    // at zero opacity, so recycled sprites can never pop.
    float life = sin(3.14159265 * phase);
    float variation = 0.65 + 0.7 * fract(aSeed * 7.13);
    float size = uMistSizeMeters * variation * (0.4 + 0.9 * life);
    float angle = aSeed * 6.2831853;
    vec3 drift = vec3(cos(angle), 0.0, sin(angle)) * (uMistDriftMeters * phase);
    vec3 center = position + drift
      + vec3(0.0, uMistRiseMeters * phase * (0.65 + 0.35 * variation), 0.0);
    vec3 toCamera = normalize(cameraPosition - center);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCamera) + vec3(0.0001, 0.0, 0.0));
    vec3 up = cross(toCamera, right);
    vec3 world = center + right * aCorner.x * size + up * aCorner.y * size;
    vWorldPosition = world;
    vCorner = aCorner;
    vSeed = aSeed;
    vAlpha = uMistOpacity * life * variation;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

export const HEADWATER_MIST_FRAGMENT_GLSL = /* glsl */ `
  ${AERIAL_PERSPECTIVE_GLSL}
  ${WATER_NOISE_GLSL}
  uniform vec3 uFoamColor;
  uniform vec3 uSkyColor;
  uniform float uDaylight;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uMistErosion;

  in vec3 vWorldPosition;
  in vec2 vCorner;
  in float vAlpha;
  in float vSeed;
  out vec4 outColor;

  void main() {
    // A soft spray puff: a radial density whose rim is eaten by two noise
    // octaves, so neighbouring puffs never share a silhouette and the edge
    // feathers into air instead of ending on a disc.
    float radius = length(vec2(vCorner.x, vCorner.y * 1.15));
    float erosion = nevaGradientNoise(vCorner * 2.2 + vec2(vSeed * 31.7, vSeed * 17.3)) * 0.65
      + nevaGradientNoise(vCorner * 4.7 - vec2(vSeed * 11.3, vSeed * 5.9)) * 0.35;
    float density = (1.0 - smoothstep(0.15, 0.95, radius + uMistErosion * 0.28 * erosion));
    density *= density;
    float alpha = vAlpha * density;
    if (alpha < 0.004) discard;
    // Thicker cores self-shadow a little; the rim is lit through.
    float shade = mix(0.97, 0.82, density);
    float cameraDistance = distance(cameraPosition, vWorldPosition);
    // Mist is white water lifted into the air: warm foam against the sky,
    // dimmed with the daylight like every other water surface.
    vec3 color = mix(uFoamColor, uSkyColor, 0.14) * shade * mix(0.25, 1.0, uDaylight);
    vec4 aerial = nevaAerialSegment(vWorldPosition);
    color = color * aerial.a + aerial.rgb;
    float fogFactor = smoothstep(uFogNear, uFogFar, cameraDistance);
    outColor = vec4(color, alpha * mix(0.65, 1.0, uDaylight) * (1.0 - fogFactor));
    ${WATER_OUTPUT_GLSL}
  }
`;

export class HeadwaterFallMist {
  public readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  public readonly group = new THREE.Group();
  private tier: QualityTier;

  constructor(options: HeadwaterFallMistOptions) {
    this.tier = options.tier;
    const config = mistConfig();
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: HEADWATER_MIST_VERTEX_GLSL,
      fragmentShader: HEADWATER_MIST_FRAGMENT_GLSL,
      uniforms: {
        ...options.sharedUniforms,
        uMistSizeMeters: { value: config.sizeMeters },
        uMistRiseMeters: { value: config.riseMeters },
        uMistDriftMeters: { value: config.driftMeters },
        uMistCycleSeconds: { value: config.cycleSeconds },
        uMistOpacity: { value: config.opacity },
        uMistErosion: { value: config.erosion }
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(createHeadwaterMistGeometry(this.tier), material);
    this.mesh.name = "headwater_fall_mist";
    this.mesh.frustumCulled = true;
    // Drawn after the falling sheet: spray blends over the lower face while
    // depth testing still keeps it behind the pool's opaque terrain.
    this.mesh.renderOrder = -98;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.group.name = "headwater_fall_mist";
    this.group.add(this.mesh);
  }

  public setQuality(tier: QualityTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.mesh.geometry.dispose();
    this.mesh.geometry = createHeadwaterMistGeometry(tier);
  }

  public get count(): number {
    return mistConfig().count[this.tier];
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.group.clear();
  }
}
