/**
 * Low mist over the Silverwater.
 *
 * Cold air pools over running water: on a still dawn the valley mist settles
 * thickest on the river, a lighter layer returns as the air cools in the
 * evening, and fog weather keeps it all day. The lighting frame owns that
 * share (`LightingFrame.riverMist`); this layer only draws it. Wide, low,
 * soft puffs sit just above the water along the whole channel, drift slowly
 * downstream along the channel tangent, and fade in and out over their life
 * so recycling never pops. The lower edge of each puff thins to nothing, so
 * a card tilted toward the camera never cuts a line into the water, and puffs
 * near the camera thin out rather than smearing across the view.
 *
 * One geometry and one draw call per tier, placed from a deterministic hash:
 * no texture, no saved state, no gameplay RNG. Time, daylight, sky, fog and
 * aerial perspective are the main water material's uniform objects, so the
 * mist can never disagree with the water under it. The layer is hidden
 * whenever the frame's share is zero.
 */

import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import { NEVA_HEADWATERS, isInHeadwaterFallBand } from "../../world/NevaHeadwaters";
import { WorldLayout } from "../../world/WorldLayout";
import { WATER_NOISE_GLSL } from "./waveGlsl";
import { WATER_OUTPUT_GLSL } from "./CoastalOptics";
import { AERIAL_PERSPECTIVE_GLSL } from "../atmosphere/AerialPerspective";

export interface RiverMistOptions {
  /** The main water material's uniform map; shared names must reference the same objects. */
  sharedUniforms: Record<string, THREE.IUniform>;
  tier: QualityTier;
}

function riverMistConfig() {
  return CANONICAL_RENDER_CONFIG.waterSurface.riverMist;
}

/** Stable integer hash: deterministic placement without touching gameplay RNG. */
function mistHash(value: number): number {
  let x = Math.imul(value + 0x7f4a7c15, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Stretch of river the mist lies on: the plunge pool down to where the estuary opens. */
export function riverMistReach(): { startZ: number; endZ: number } {
  let endZ = NEVA_HEADWATERS.endZ;
  for (let z = NEVA_HEADWATERS.endZ; z <= 120; z += 2) {
    if (WorldLayout.riverSectionAt(z).estuaryInfluence > 0.35) break;
    endZ = z;
  }
  return { startZ: NEVA_HEADWATERS.fall.landingZ + 0.5, endZ };
}

const QUAD = [
  [-1, -1], [1, -1], [1, 1],
  [-1, -1], [1, 1], [-1, 1]
] as const;

export function createRiverMistGeometry(tier: QualityTier): THREE.BufferGeometry {
  const config = riverMistConfig();
  const count = config.count[tier];
  const { startZ, endZ } = riverMistReach();
  const positions: number[] = [];
  const corners: number[] = [];
  const seeds: number[] = [];
  const flows: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const hash = (salt: number): number => mistHash(index * 7 + salt);
    // Stratified along the channel so the layer never bunches or leaves gaps.
    const z = startZ + (endZ - startZ) * ((index + hash(1)) / count);
    if (isInHeadwaterFallBand(z, 0.5)) continue;
    const section = WorldLayout.riverSectionAt(z);
    const across = hash(2) * 2 - 1;
    const halfWidth = (across < 0 ? section.leftWaterWidth : section.rightWaterWidth) + config.bankOverhangMeters;
    const x = section.centerX + across * halfWidth;
    const y = section.surfaceElevation + config.liftMeters * (0.75 + hash(4) * 0.5);
    const length = Math.hypot(section.tangent.x, section.tangent.z) || 1;
    const sign = section.tangent.z < 0 ? -1 : 1;
    const flowX = (section.tangent.x / length) * sign;
    const flowZ = (section.tangent.z / length) * sign;
    const seed = hash(3);
    for (const [cornerX, cornerY] of QUAD) {
      positions.push(x, y, z);
      corners.push(cornerX, cornerY);
      seeds.push(seed);
      flows.push(flowX, flowZ);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aCorner", new THREE.Float32BufferAttribute(corners, 2));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute("aFlow", new THREE.Float32BufferAttribute(flows, 2));
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) geometry.boundingSphere.radius += config.sizeMeters * 1.4 + config.driftMeters;
  return geometry;
}

export const RIVER_MIST_VERTEX_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uReducedMotion;
  uniform float uRiverMistAmount;
  uniform float uRiverMistSize;
  uniform float uRiverMistHeightRatio;
  uniform float uRiverMistOpacity;
  uniform float uRiverMistDrift;
  uniform float uRiverMistCycle;

  attribute vec2 aCorner;
  attribute float aSeed;
  attribute vec2 aFlow;

  out vec3 vWorldPosition;
  out vec2 vCorner;
  out float vAlpha;
  out float vSeed;

  void main() {
    float time = uTime * (1.0 - uReducedMotion * 0.7);
    float phase = fract(time / max(1.0, uRiverMistCycle) + aSeed);
    // Both ends of the life are transparent, so a recycled puff never pops.
    float life = sin(3.14159265 * phase);
    float variation = 0.7 + 0.6 * fract(aSeed * 7.13);
    float size = uRiverMistSize * variation * (0.8 + 0.2 * life);
    vec3 center = position
      + vec3(aFlow.x, 0.0, aFlow.y) * (uRiverMistDrift * (phase - 0.5))
      + vec3(0.0, 0.1 * sin(time * 0.19 + aSeed * 6.2831853), 0.0);
    vec3 toCamera = normalize(cameraPosition - center);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCamera) + vec3(0.0001, 0.0, 0.0));
    vec3 up = cross(toCamera, right);
    vec3 world = center + right * aCorner.x * size + up * aCorner.y * size * uRiverMistHeightRatio;
    vWorldPosition = world;
    vCorner = aCorner;
    vSeed = aSeed;
    vAlpha = uRiverMistOpacity * uRiverMistAmount * life * variation;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

export const RIVER_MIST_FRAGMENT_GLSL = /* glsl */ `
  ${AERIAL_PERSPECTIVE_GLSL}
  ${WATER_NOISE_GLSL}
  uniform vec3 uFoamColor;
  uniform vec3 uSkyHorizonColor;
  uniform float uDaylight;
  uniform float uFogNear;
  uniform float uFogFar;

  in vec3 vWorldPosition;
  in vec2 vCorner;
  in float vAlpha;
  in float vSeed;
  out vec4 outColor;

  void main() {
    // A wide soft bank whose rim two noise octaves eat away, so neighbouring
    // puffs merge into one layer instead of reading as discs.
    float radius = length(vec2(vCorner.x, vCorner.y * 1.1));
    float erosion = nevaGradientNoise(vCorner * 1.7 + vec2(vSeed * 23.1, vSeed * 9.7)) * 0.7
      + nevaGradientNoise(vCorner * 3.9 - vec2(vSeed * 7.3, vSeed * 13.9)) * 0.3;
    float density = 1.0 - smoothstep(0.1, 0.95, radius + 0.3 * erosion);
    density *= density;
    // The layer hugs the water: the lower edge thins so it never cuts a line into the surface.
    density *= smoothstep(-0.55, 0.05, vCorner.y);
    float cameraDistance = distance(cameraPosition, vWorldPosition);
    // Close to the camera the mist thins instead of smearing across the view.
    float nearFade = smoothstep(2.0, 8.0, cameraDistance);
    float alpha = vAlpha * density * nearFade;
    if (alpha < 0.003) discard;
    // Mist is the sky's horizon light caught in cold air over the water.
    vec3 color = mix(uSkyHorizonColor, uFoamColor, 0.55) * mix(0.28, 1.0, uDaylight);
    vec4 aerial = nevaAerialSegment(vWorldPosition);
    color = color * aerial.a + aerial.rgb;
    float fogFactor = smoothstep(uFogNear, uFogFar, cameraDistance);
    outColor = vec4(color, alpha * (1.0 - fogFactor));
    ${WATER_OUTPUT_GLSL}
  }
`;

export class RiverMist {
  public readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  public readonly group = new THREE.Group();
  private tier: QualityTier;

  constructor(options: RiverMistOptions) {
    this.tier = options.tier;
    const config = riverMistConfig();
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: RIVER_MIST_VERTEX_GLSL,
      fragmentShader: RIVER_MIST_FRAGMENT_GLSL,
      uniforms: {
        ...options.sharedUniforms,
        uRiverMistAmount: { value: 0 },
        uRiverMistSize: { value: config.sizeMeters },
        uRiverMistHeightRatio: { value: config.heightRatio },
        uRiverMistOpacity: { value: config.opacity },
        uRiverMistDrift: { value: config.driftMeters },
        uRiverMistCycle: { value: config.cycleSeconds }
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(createRiverMistGeometry(this.tier), material);
    this.mesh.name = "river_mist";
    this.mesh.frustumCulled = true;
    // After the water surfaces and the fall's spray, so it lies over both.
    this.mesh.renderOrder = -97;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
    this.group.name = "river_mist";
    this.group.add(this.mesh);
  }

  /** The lighting frame's river-mist share; zero hides the layer outright. */
  public setAmount(amount: number): void {
    const share = THREE.MathUtils.clamp(amount, 0, 1);
    this.mesh.material.uniforms.uRiverMistAmount.value = share;
    this.mesh.visible = share > 0.005;
  }

  public setQuality(tier: QualityTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.mesh.geometry.dispose();
    this.mesh.geometry = createRiverMistGeometry(tier);
  }

  public get count(): number {
    return riverMistConfig().count[this.tier];
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.group.clear();
  }
}
