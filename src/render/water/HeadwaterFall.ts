/**
 * W07 falling sheet for the authored headwater fall.
 *
 * Topology (lip, landing, elevations) is owned by `NEVA_HEADWATERS.fall`; every
 * number here lives in `VisualRenderConfig.waterSurface.headwaters.fall`. The
 * sheet is presentation over that topology: it carries no support, no physics
 * and no saved state, and it never samples the opaque scene capture, so the
 * refraction pass cannot feed back on itself.
 *
 * Uniforms are *shared objects* with the main water material, so time, sun,
 * weather, quality and reduced-motion changes cannot desynchronize the fall
 * from the channel it connects to.
 */

import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import { NEVA_HEADWATERS, headwaterElevationAt } from "../../world/NevaHeadwaters";
import { WorldLayout } from "../../world/WorldLayout";
import { WATER_NOISE_GLSL } from "./waveGlsl";
import { WATER_SHADING_UNIFORMS_GLSL } from "./waterShadingGlsl";
import { WATER_OUTPUT_GLSL } from "./CoastalOptics";

export interface HeadwaterFallOptions {
  /** The main water material's uniform map; shared names must reference the same objects. */
  sharedUniforms: Record<string, THREE.IUniform>;
}

export interface HeadwaterFallSheetPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function fallConfig() {
  return CANONICAL_RENDER_CONFIG.waterSurface.headwaters.fall;
}

/**
 * The sheet *is* the water surface of the authored falling segment: each row
 * takes the live profile elevation at its station, so the fall hangs exactly
 * where the terrain drops and hands off to the pool at the landing station. A
 * small downstream bow shapes the silhouette without detaching either end.
 */
export function headwaterFallSheetPoint(
  row: number,
  column: number,
  rows: number,
  acrossSegments: number
): HeadwaterFallSheetPoint {
  const fall = NEVA_HEADWATERS.fall;
  const t = rows > 0 ? row / rows : 0;
  const run = fall.landingZ - fall.lipZ;
  const z = fall.lipZ + run * t;
  const bow = Math.sin(Math.PI * t) * fallConfig().bowMeters;
  // The bow slides rows along the authored surface instead of detaching them,
  // so the whole sheet still lies on the fall face.
  const surfaceZ = z + bow;
  const y = headwaterElevationAt(surfaceZ);
  const centerX = WorldLayout.riverCenterX(surfaceZ);
  // Match the live channel the sheet hands off to, widening only slightly as
  // the falling water spreads toward the pool.
  const section = WorldLayout.riverSectionAt(z);
  const halfWidth = (section.leftWaterWidth + section.rightWaterWidth) * 0.5 * (1 + t * 0.12);
  const across = Math.max(1, acrossSegments);
  const lateralUnit = (column / across) * 2 - 1;
  return { x: centerX + lateralUnit * halfWidth, y, z: surfaceZ };
}

/** Builds the sheet grid; rows advance downstream, columns span the channel. */
export function createHeadwaterFallGeometry(tier: QualityTier): THREE.BufferGeometry {
  const config = fallConfig();
  const rows = config.rows[tier];
  const across = config.acrossSegments;
  const grid: HeadwaterFallSheetPoint[][] = [];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const rowPoints: HeadwaterFallSheetPoint[] = [];
    for (let column = 0; column <= across; column += 1) {
      const point = headwaterFallSheetPoint(row, column, rows, across);
      rowPoints.push(point);
      positions.push(point.x, point.y, point.z);
      uvs.push(column / across, row / rows);
    }
    grid.push(rowPoints);
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < across; column += 1) {
      const a = row * (across + 1) + column;
      const b = a + 1;
      const c = a + across + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(sheetNormals(grid), 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  // Shader displacement must participate in bounds; the sphere also drives
  // frustum culling for the whole sheet.
  if (geometry.boundingSphere) {
    geometry.boundingSphere.radius += config.rippleMeters + config.bowMeters;
  }
  return geometry;
}

/** Local tangent-frame normals sampled from the sheet grid, never the ocean formula. */
function sheetNormals(grid: HeadwaterFallSheetPoint[][]): number[] {
  const normals: number[] = [];
  const across = grid[0].length;
  for (let row = 0; row < grid.length; row += 1) {
    for (let column = 0; column < across; column += 1) {
      const left = grid[row][Math.max(0, column - 1)];
      const right = grid[row][Math.min(across - 1, column + 1)];
      const up = grid[Math.max(0, row - 1)][column];
      const down = grid[Math.min(grid.length - 1, row + 1)][column];
      const acrossVector = new THREE.Vector3(right.x - left.x, right.y - left.y, right.z - left.z);
      const downVector = new THREE.Vector3(down.x - up.x, down.y - up.y, down.z - up.z);
      const normal = new THREE.Vector3().crossVectors(acrossVector, downVector).normalize();
      // Wound so the waterward face points back upstream/up-slope.
      if (normal.z > 0) normal.multiplyScalar(-1);
      normals.push(normal.x, normal.y, normal.z);
    }
  }
  return normals;
}

export const HEADWATER_FALL_VERTEX_GLSL = /* glsl */ `
  // The shared shading block declares fragment-only helpers (screen-space
  // derivatives), so the vertex stage declares only what it reads.
  uniform float uTime;
  uniform float uReducedMotion;
  uniform float uFallRippleMeters;

  out vec3 vWorldPosition;
  out vec3 vSheetNormal;
  out float vArc;
  out float vAcross;

  void main() {
    float time = uTime * (1.0 - uReducedMotion * 0.65);
    // Fine surface life along the sheet; the mesh stays a thin shell.
    float ripple = sin(uv.y * 9.0 - time * 2.4 + uv.x * 4.0) * 0.5
      + sin(uv.y * 17.0 - time * 3.1 - uv.x * 7.0) * 0.5;
    vec3 displaced = position + normal * ripple * uFallRippleMeters;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPosition.xyz;
    vSheetNormal = normalize(mat3(modelMatrix) * normal);
    vArc = uv.y;
    vAcross = uv.x;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const HEADWATER_FALL_FRAGMENT_GLSL = /* glsl */ `
  ${WATER_SHADING_UNIFORMS_GLSL}
  ${WATER_NOISE_GLSL}
  uniform float uFallBodyOpacity;
  uniform float uFallStreakStrength;
  uniform float uFallStreakSpeed;
  uniform float uFallStreakScale;
  uniform float uFallThreadCount;
  uniform float uFallBreakupStrength;
  uniform float uFallImpactFoamStrength;
  uniform float uFallImpactFoamSpan;
  uniform float uFallApronFoamStrength;
  uniform float uFallApronStart;

  in vec3 vWorldPosition;
  in vec3 vSheetNormal;
  in float vArc;
  in float vAcross;
  out vec4 outColor;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float cameraDistance = distance(cameraPosition, vWorldPosition);
    vec3 normal = normalize(vSheetNormal);
    if (dot(normal, viewDirection) < 0.0) normal = -normal;
    float ndv = clamp(dot(viewDirection, normal), 0.0, 1.0);
    float light = mix(0.08, 1.0, uDaylight);
    float cloudSunlight = nevaCloudSunlight(vWorldPosition);
    float time = uTime * (1.0 - uReducedMotion * 0.65);

    // 1) Readable main aqua body with restrained light/dark variation. The
    // night floor sits deep: still water goes dark with the sky and only the
    // moving white water keeps reading after dusk.
    float grain = nevaGradientNoise(vec2(vAcross * 6.0, vArc * 14.0 - time * 0.35));
    float turbulence = nevaGradientNoise(vec2(vAcross * 11.0 + time * 0.2, vArc * 21.0 - time * 0.85));
    vec3 body = mix(uShallowColor, uMidColor,
      clamp(smoothstep(0.12, 0.9, vArc) * 0.85 + grain * 0.1, 0.0, 1.0));
    body = mix(body, uDeepColor, smoothstep(0.55, 1.0, vArc) * 0.35);
    body *= light * mix(1.0, cloudSunlight, 0.55 * uDaylight);
    body *= 0.9 + 0.2 * turbulence;
    float sssBack = max(0.0, dot(viewDirection, normalize(-uSunDirection)));
    body += uShallowColor * (sssBack * sssBack * 0.35 * uSssStrength * uDaylight);

    // 2) Streaks travel along the sheet arc, never by world Z. They read
    // strongest where the water leaves the lip and blur out as it falls.
    // Fine threads dominate over broad bands so the face never reads as
    // static Venetian blinds. The large across-phase turns the bands into
    // diagonal falling threads, and the per-thread jitter breaks any residual
    // periodicity: without it the threads line up as corduroy.
    float threadSeed = nevaGradientNoise(vec2(vAcross * 3.0, 4.7));
    float streakPhase = vArc * uFallStreakScale - time * uFallStreakSpeed
      + vAcross * uFallThreadCount + (threadSeed - 0.5) * 9.0;
    float streak = 0.5 + 0.5 * sin(streakPhase * 6.28318);
    streak *= 0.65 + 0.35 * nevaGradientNoise(vec2(vAcross * 9.0 + 2.3, vArc * 5.0));
    float streakFine = 0.5 + 0.5 * sin(streakPhase * 14.7 + vAcross * 5.0);
    float streakMask = mix(1.0, 0.3, smoothstep(0.1, 0.85, vArc));
    float threadAmp = 0.35 + 0.65 * nevaGradientNoise(vec2(vAcross * 3.0, 9.1));
    // The sheet grows out of the channel water over its first rows: full
    // streaks and opacity from row zero would draw a bright line (and a
    // z-fighting pop against the channel's own lip row) exactly where the
    // water should read as turning over the lip.
    float lipBlend = smoothstep(0.0, 0.07, vArc);
    body += uFoamColor * (streak * 0.55 + streakFine * 0.45) * threadAmp
      * uFallStreakStrength * streakMask * 0.45 * mix(0.35, 1.0, uDaylight) * lipBlend;

    // 3) Limited breakup so the sheet edge is uneven rather than a rectangle.
    // The silhouette itself goes ragged: the alpha edge follows the breakup
    // field, so straight triangle edges cannot survive.
    float breakup = nevaGradientNoise(vec2(vAcross * 5.0 + 7.1, vArc * 3.0 - time * 0.55));
    float raggedHalf = 0.22 * (0.35 + 0.65 * breakup);
    float edgeFade = smoothstep(0.0, raggedHalf, vAcross) * (1.0 - smoothstep(1.0 - raggedHalf, 1.0, vAcross));
    edgeFade = mix(1.0, edgeFade, uFallBreakupStrength);
    body *= mix(1.0, 0.86 + 0.28 * breakup, uFallBreakupStrength);

    // Sky reflection keeps the sheet reading as water rather than paint.
    vec3 reflectView = reflect(-viewDirection, normal);
    vec3 sky = mix(uSkyHorizonColor, uSkyColor, smoothstep(0.015, 0.58, reflectView.y));
    float fresnel = clamp((0.02 + 0.98 * pow(1.0 - ndv, 5.0)) * uFresnelStrength, 0.02, 0.9);
    vec3 color = mix(body, sky * light, fresnel * 0.55);

    // 4) Impact foam tied to the actual landing intersection. A real plunge
    // reads white-detaching at the lip, glassy accelerating mid-face, and a
    // full-width burst at the landing line — never a blob narrowing to a
    // point. So the impact is a level band across the whole width (edges
    // handled by alpha, not by dimming the foam), and the lip keeps its own
    // aeration through the streak mask above.
    float impact = smoothstep(1.0 - uFallImpactFoamSpan, 1.0, vArc);
    float impactPattern = nevaGradientNoise(vec2(vAcross * 7.0 + time * 0.4, vArc * 18.0 - time * 1.3));
    float impactFoam = impact * uFallImpactFoamStrength * mix(0.55, 1.0, impactPattern);

    // 5) Pool foam that settles downstream across the apron.
    float apron = smoothstep(uFallApronStart, 1.0, vArc);
    float apronPattern = nevaGradientNoise(vec2(vAcross * 4.0 + time * 0.22, vArc * 7.0 - time * 0.5));
    float apronFoam = apron * uFallApronFoamStrength * mix(0.3, 1.0, apronPattern);
    // Impact foam spans the full landing width: the silhouette edges stay
    // soft through edgeFade on alpha, but the foam itself must not collapse
    // into a center blob that reads as a narrowing fall.
    float foam = clamp(max(impactFoam, apronFoam), 0.0, 0.95);
    // Foam stays warm-tinted rather than blowing out to white in daylight.
    color = mix(color, uFoamColor * mix(0.18, 0.82, uDaylight), foam);

    float alpha = clamp(uFallBodyOpacity + foam * 0.4, 0.0, 1.0) * mix(0.75, 1.0, edgeFade);
    alpha *= smoothstep(0.0, 0.07, vArc);
    float fogFactor = smoothstep(uFogNear, uFogFar, cameraDistance);
    vec4 aerial = nevaAerialSegment(vWorldPosition);
    color = color * aerial.a + aerial.rgb;
    outColor = vec4(color, mix(alpha, 1.0, fogFactor));
    ${WATER_OUTPUT_GLSL}
  }
`;

export class HeadwaterFall {
  public readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  public readonly group = new THREE.Group();
  private tier: QualityTier;

  constructor(options: HeadwaterFallOptions) {
    const config = fallConfig();
    this.tier = CANONICAL_RENDER_CONFIG.qualityTier;
    const run = Math.max(0.001, NEVA_HEADWATERS.fall.landingZ - NEVA_HEADWATERS.fall.lipZ);
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: HEADWATER_FALL_VERTEX_GLSL,
      fragmentShader: HEADWATER_FALL_FRAGMENT_GLSL,
      uniforms: {
        ...options.sharedUniforms,
        uFallRippleMeters: { value: config.rippleMeters },
        uFallBodyOpacity: { value: config.bodyOpacity },
        uFallStreakStrength: { value: config.streakStrength },
        uFallStreakSpeed: { value: config.streakSpeed },
        uFallStreakScale: { value: config.streakScale },
        uFallThreadCount: { value: config.streakThreadCount },
        uFallBreakupStrength: { value: config.breakupStrength },
        uFallImpactFoamStrength: { value: config.impactFoamStrength },
        uFallImpactFoamSpan: { value: config.impactFoamSpan },
        uFallApronFoamStrength: { value: config.apronFoamStrength },
        uFallApronStart: { value: 1 - config.apronMeters / run }
      },
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(createHeadwaterFallGeometry(this.tier), material);
    this.mesh.name = "headwater_fall_sheet";
    this.mesh.frustumCulled = true;
    this.mesh.renderOrder = -99;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.group.name = "headwater_fall";
    this.group.add(this.mesh);
  }

  public setQuality(tier: QualityTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.mesh.geometry.dispose();
    this.mesh.geometry = createHeadwaterFallGeometry(tier);
  }

  public get segments(): { rows: number; across: number } {
    return {
      rows: fallConfig().rows[this.tier],
      across: fallConfig().acrossSegments
    };
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.group.clear();
  }
}
