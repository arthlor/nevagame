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
import { NEVA_HEADWATERS, headwaterElevationAt, headwaterGradientAt } from "../../world/NevaHeadwaters";
import { WorldLayout } from "../../world/WorldLayout";
import { WATER_NOISE_GLSL } from "./waveGlsl";
import { WATER_SHADING_UNIFORMS_GLSL } from "./waterShadingGlsl";
import { WATER_OUTPUT_GLSL } from "./CoastalOptics";
import { HeadwaterFallMist } from "./HeadwaterFallMist";

export interface HeadwaterFallOptions {
  /** The main water material's uniform map; shared names must reference the same objects. */
  sharedUniforms: Record<string, THREE.IUniform>;
}

export interface HeadwaterFallSheetPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Normalized arc across the whole sheet: lip 0, landing `uFallLandingArc`, tip 1. */
  readonly arc: number;
}

function fallConfig() {
  return CANONICAL_RENDER_CONFIG.waterSurface.headwaters.fall;
}

/**
 * The sheet *is* the falling water surface. Every row is pinned to the live
 * profile at both ends, so the sheet meets the level crest and the pool
 * without a step; in between it follows the authored ballistic arc — water
 * leaves the lip horizontally at the upstream surface velocity and accelerates
 * under gravity to the landing. `nappeDetach` blends that arc against the
 * carved face, so the drop reads as a leaping nappe rather than a decal.
 *
 * The cross-section is convex (`crossBulgeMeters`): the centre of the falling
 * curtain pushes out along the local surface normal while the edges tuck back,
 * which is what gives the sheet a readable volume at gameplay distance.
 *
 * Past the landing the same parabola continues for `sinkRunMeters`, burying
 * the geometry edge below the pool so the plunge enters the water and no cut
 * line or see-through gap can appear at the foot.
 */
export function headwaterFallSheetPoint(
  row: number,
  column: number,
  rows: number,
  acrossSegments: number
): HeadwaterFallSheetPoint {
  const fall = NEVA_HEADWATERS.fall;
  const config = fallConfig();
  const run = fall.landingZ - fall.lipZ;
  const drop = fall.lipElevation - fall.landingElevation;
  const sinkRows = Math.min(Math.max(1, config.sinkRows), Math.max(1, rows - 1));
  const mainRows = Math.max(1, rows - sinkRows);
  const sinkFraction = config.sinkRunMeters / Math.max(0.001, run);
  // Rows 0..mainRows span the lip to the landing exactly; the reserved rows
  // continue the same parabola into the pool at uniform sink fractions.
  const t = row <= mainRows
    ? row / mainRows
    : 1 + sinkFraction * (row - mainRows) / sinkRows;
  const stationZ = fall.lipZ + run * t;
  const nappeY = fall.lipElevation - drop * t * t;
  const y = t <= 1
    ? THREE.MathUtils.lerp(headwaterElevationAt(stationZ), nappeY, config.nappeDetach)
    : nappeY;
  // The jet carries the lip discharge into a wider basin; using the pool
  // width here turned the falling water into a triangular dam spillway.
  const section = WorldLayout.riverSectionAt(fall.lipZ);
  const centerX = WorldLayout.riverCenterX(Math.min(stationZ, fall.landingZ));
  const meanHalfWidth = (section.leftWaterWidth + section.rightWaterWidth) * 0.5;
  const waist = meanHalfWidth > 0.001 ? config.widthWaistMeters / meanHalfWidth : 0;
  const shape = Math.min(1, t);
  const widthScale = Math.max(
    0.25,
    1 + config.widthSpread * shape - waist * Math.sin(Math.PI * shape)
  );
  const across = Math.max(1, acrossSegments);
  const lateralUnit = (column / across) * 2 - 1;
  // Bulge vanishes at both pinned ends, so lip and landing stay exact.
  const lipLobes = 0.7 + 0.3 * Math.cos(lateralUnit * 7.4 + 0.8);
  const bulge = config.crossBulgeMeters * (1 - lateralUnit * lateralUnit)
    * Math.sin(Math.PI * shape) * lipLobes;
  const grade = headwaterGradientAt(Math.min(stationZ, fall.landingZ));
  const normalLength = Math.hypot(1, grade);
  const halfWidth = lateralUnit < 0 ? section.leftWaterWidth : section.rightWaterWidth;
  return {
    x: centerX + lateralUnit * halfWidth * widthScale
      + config.crossBulgeMeters * Math.sin(Math.PI * shape) * (0.35 + lateralUnit * 0.2),
    y: y + bulge / normalLength,
    z: stationZ + bulge * (-grade / normalLength),
    arc: t / (1 + sinkFraction)
  };
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
      uvs.push(column / across, point.arc);
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
  // Shader displacement and the cross-section bulge must participate in
  // bounds; the sphere also drives frustum culling for the whole sheet.
  if (geometry.boundingSphere) {
    geometry.boundingSphere.radius += config.rippleMeters * 4 + config.crossBulgeMeters;
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
      const normal = new THREE.Vector3().crossVectors(downVector, acrossVector).normalize();
      normals.push(normal.x, normal.y, normal.z);
    }
  }
  return normals;
}

export const HEADWATER_FALL_VERTEX_GLSL = /* glsl */ `
  // The shared shading block declares fragment-only helpers (screen-space
  // derivatives), so the vertex stage declares only what it reads.
  ${WATER_NOISE_GLSL}
  uniform float uTime;
  uniform float uReducedMotion;
  uniform float uFallRippleMeters;

  out vec3 vWorldPosition;
  out vec3 vSheetNormal;
  out float vArc;
  out float vAcross;

  void main() {
    float time = uTime * (1.0 - uReducedMotion * 0.65);
    // Surface life runs *along* the fall as irregular filaments. An
    // across-sheet sine here corrugated the whole curtain into regular
    // transverse bands when seen from above, so the displacement is noise
    // stretched down the arc instead of phase-coherent across it.
    float ripple = (nevaGradientNoise(vec2(uv.x * 24.0, uv.y * 5.0 - time * 1.9)) - 0.5) * 1.4
      + (nevaGradientNoise(vec2(uv.x * 52.0 + 3.7, uv.y * 11.0 - time * 2.6)) - 0.5) * 0.6;
    float arcEnvelope = sin(clamp(uv.y, 0.0, 1.0) * 3.14159265);
    float edgeFlutter = (nevaGradientNoise(vec2(uv.x * 3.0 + 2.1, uv.y * 9.0 - time * 2.4)) - 0.5);
    vec3 displaced = position + normal * ripple * uFallRippleMeters;
    displaced.x += edgeFlutter * uFallRippleMeters * 5.0 * arcEnvelope;
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
  uniform float uFallStreakAcceleration;
  uniform float uFallThreadConvergence;
  uniform float uFallBreakupStrength;
  uniform float uFallCrestSpan;
  uniform float uFallCrestStrength;
  uniform float uFallAerationStart;
  uniform float uFallLandingArc;
  uniform float uFallImpactFoamStrength;
  uniform float uFallImpactFoamSpan;
  uniform float uFallImpactPlumeStrength;
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
    // Arc is the ballistic parameter: 0 at the lip, 1 at the landing, and a
    // little past 1 along the submerged foot.
    float arc = vArc / max(0.001, uFallLandingArc);
    float dryArc = min(1.0, arc);

    // 1) Dense aqua body. Glassy at the crest, aerated white water down the
    // face: a plunging sheet is milky, not a window, so the far gorge can
    // never read through it.
    float crest = 1.0 - smoothstep(0.0, uFallCrestSpan, arc);
    float aeration = smoothstep(uFallAerationStart, 0.98, dryArc);
    // Body grain is stretched down the arc, not across it: a sheet of falling
    // water is vertical filaments. Roughly square noise mottled the curtain and
    // read as transverse corrugation from above.
    float grain = nevaGradientNoise(vec2(vAcross * 7.0, dryArc * 3.2 - time * 0.22));
    float turbulence = nevaGradientNoise(vec2(vAcross * 16.0 + time * 0.15, dryArc * 5.5 - time * 0.7));
    vec3 body = mix(uShallowColor, uMidColor,
      clamp(smoothstep(0.1, 0.75, dryArc) * 0.8 + grain * 0.1, 0.0, 1.0));
    body = mix(body, uDeepColor, smoothstep(0.45, 1.0, dryArc) * 0.3 * (1.0 - aeration * 0.55));
    body *= light * mix(1.0, cloudSunlight, 0.55 * uDaylight);
    body *= 0.7 + 0.45 * turbulence;
    body = mix(body, uFoamColor * mix(0.22, 0.95, uDaylight), aeration * 0.48);
    float sssBack = max(0.0, dot(viewDirection, normalize(-uSunDirection)));
    body += uShallowColor * (sssBack * sssBack * 0.35 * uSssStrength * uDaylight);

    // 2) Falling threads. The phase stretches with the arc — the water is
    // accelerating and thinning — and the across coordinate converges toward
    // the channel centre, so filaments and sheet meet at the plunge instead of
    // reading as corduroy sliding over a fixed plane. Fine threads dominate.
    float acrossConverged = (vAcross - 0.5)
      * (1.0 - uFallThreadConvergence * sin(3.14159265 * dryArc)) + 0.5;
    // Elongated, advected packets break into uneven ropes. A periodic sine
    // linking across and along coordinates produces diagonal zebra stripes.
    float stretch = 1.0 - uFallStreakAcceleration * smoothstep(0.0, 1.0, dryArc);
    float packetTravel = dryArc * uFallStreakScale * stretch - time * uFallStreakSpeed;
    float ropeWarp = nevaGradientNoise(vec2(acrossConverged * 4.1, dryArc * 1.7 - time * 0.18));
    float threadCoordinate = acrossConverged * uFallThreadCount + ropeWarp * 1.5;
    float filament = nevaGradientNoise(vec2(threadCoordinate, packetTravel * 0.48));
    float streak = smoothstep(0.42, 0.67, filament);
    float fineFilter = 1.0 - smoothstep(0.3, 1.2, fwidth(threadCoordinate));
    float streakFine = smoothstep(0.35, 0.76,
      nevaGradientNoise(vec2(threadCoordinate * 2.1 + 6.7, packetTravel * 0.8))) * fineFilter;
    float threadAmp = 0.35 + 0.65 * nevaGradientNoise(vec2(acrossConverged * 5.0, 9.1));
    // The sheet grows out of the channel water over its first rows: full
    // streaks at row zero would draw a seam exactly where the water turns
    // over the lip.
    float lipBlend = smoothstep(0.0, 0.05, arc);
    float threadWhite = mix(0.65, 1.0, aeration);
    body *= mix(0.7, 1.05, smoothstep(0.2, 0.72, filament));
    body = mix(body, uFoamColor * mix(0.3, 0.98, uDaylight),
      (streak * 0.72 + streakFine * 0.28) * threadAmp
      * uFallStreakStrength * threadWhite * lipBlend);

    // 3) Crest: a short bright band where the surface rolls over the lip and
    // catches the sky, so the nappe has a rounded readable edge rather than a
    // transparent gap that lets dark rock show through.
    body += uFoamColor * crest * uFallCrestStrength * mix(0.35, 1.0, uDaylight)
      * (0.55 + 0.45 * nevaGradientNoise(vec2(vAcross * 8.0, dryArc * 9.0 - time * 0.6)));

    // 4) Ragged silhouette. Two noise scales keep the rim uneven at thread and
    // patch size; alpha follows the same field, so straight triangle edges
    // cannot survive. Only the thin rim dissolves: the body stays opaque so no
    // backdrop can show through the falling water.
    float breakup = nevaGradientNoise(vec2(vAcross * 5.0 + 7.1, dryArc * 3.0 - time * 0.55));
    float breakupFine = nevaGradientNoise(vec2(vAcross * 13.0 + 1.9, dryArc * 8.0 - time * 0.8));
    float raggedField = breakup * 0.6 + breakupFine * 0.4;
    float raggedHalf = uFallBreakupStrength * (0.04 + 0.2 * (0.5 + 0.5 * raggedField));
    float edgeFade = smoothstep(0.0, raggedHalf, vAcross)
      * (1.0 - smoothstep(1.0 - raggedHalf, 1.0, vAcross));
    edgeFade = mix(1.0, edgeFade, min(1.0, uFallBreakupStrength * 1.4));
    body *= mix(1.0, 0.88 + 0.24 * raggedField, uFallBreakupStrength * 0.5);

    // Sky reflection keeps the sheet reading as water rather than paint. The
    // crest is at a glancing angle over the lip, so it reflects more.
    vec3 reflectView = reflect(-viewDirection, normal);
    vec3 sky = mix(uSkyHorizonColor, uSkyColor, smoothstep(0.015, 0.58, reflectView.y));
    float fresnel = clamp((0.02 + 0.98 * pow(1.0 - ndv, 5.0)) * uFresnelStrength, 0.02, 0.92);
    fresnel = min(1.0, fresnel + crest * uFallCrestStrength * 0.3);
    vec3 color = mix(body, sky * light, fresnel * 0.35);

    // 5) Impact. The landing line foams across the full width and throws
    // vertical plumes that rise against the sheet; the foam stays opaque so
    // the plunge terminates the fall instead of fading into the gorge behind.
    float impact = smoothstep(1.0 - uFallImpactFoamSpan, 1.0, arc);
    float impactPattern = nevaGradientNoise(vec2(vAcross * 7.0 + time * 0.4, arc * 18.0 - time * 1.3));
    float plume = nevaGradientNoise(vec2(vAcross * 16.0 + 5.3, arc * 9.0 - time * 2.1));
    float impactFoam = impact * uFallImpactFoamStrength
      * mix(0.5, 1.0, impactPattern)
      * (1.0 + uFallImpactPlumeStrength * max(0.0, plume));

    // 6) Pool foam that settles downstream across the apron and over the
    // submerged foot, so the buried tip stays white water.
    float apron = smoothstep(uFallApronStart, 1.0, arc);
    float apronPattern = nevaGradientNoise(vec2(vAcross * 4.0 + time * 0.22, arc * 7.0 - time * 0.5));
    float apronFoam = apron * uFallApronFoamStrength * mix(0.3, 1.0, apronPattern);
    float foam = clamp(max(impactFoam, apronFoam), 0.0, 0.95);
    color = mix(color, uFoamColor * mix(0.18, 0.9, uDaylight), foam);

    // The body is opaque; only the crest keeps a glassy sheen and only the
    // thin ragged rim fades, so the falling water always occludes the gorge.
    float alpha = clamp(uFallBodyOpacity + foam * 0.4, 0.0, 1.0) * edgeFade;
    alpha *= mix(1.0, 0.9, crest);
    if (alpha < 0.035) discard;
    float fogFactor = smoothstep(uFogNear, uFogFar, cameraDistance);
    vec4 aerial = nevaAerialSegment(vWorldPosition);
    color = color * aerial.a + aerial.rgb;
    outColor = vec4(color, mix(alpha, 1.0, fogFactor));
    ${WATER_OUTPUT_GLSL}
  }
`;

export class HeadwaterFall {
  public readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  public readonly mist: HeadwaterFallMist;
  public readonly group = new THREE.Group();
  private tier: QualityTier;

  constructor(options: HeadwaterFallOptions) {
    const config = fallConfig();
    this.tier = CANONICAL_RENDER_CONFIG.qualityTier;
    const run = Math.max(0.001, NEVA_HEADWATERS.fall.landingZ - NEVA_HEADWATERS.fall.lipZ);
    const drop = NEVA_HEADWATERS.fall.lipElevation - NEVA_HEADWATERS.fall.landingElevation;
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
        uFallStreakAcceleration: { value: config.streakAcceleration },
        uFallThreadConvergence: { value: config.threadConvergence },
        uFallBreakupStrength: { value: config.breakupStrength },
        uFallCrestSpan: { value: config.crestSpan },
        uFallCrestStrength: { value: config.crestStrength },
        uFallAerationStart: { value: config.aerationStart },
        // Arc parameters are ballistic time: 1 is the landing, and the sheet
        // continues a little past it into the pool. The apron is authored in
        // metres and converted with the landing speed along the sheet.
        uFallLandingArc: { value: 1 / (1 + config.sinkRunMeters / Math.max(0.001, run)) },
        uFallImpactFoamStrength: { value: config.impactFoamStrength },
        uFallImpactFoamSpan: { value: config.impactFoamSpan },
        uFallImpactPlumeStrength: { value: config.impactPlumeStrength },
        uFallApronFoamStrength: { value: config.apronFoamStrength },
        uFallApronStart: {
          value: 1 - Math.min(0.9, config.apronMeters / Math.max(0.001, Math.hypot(run, 2 * drop)))
        }
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
    this.mist = new HeadwaterFallMist({ sharedUniforms: options.sharedUniforms, tier: this.tier });
    this.group.name = "headwater_fall";
    this.group.add(this.mesh);
    this.group.add(this.mist.group);
  }

  public setQuality(tier: QualityTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.mesh.geometry.dispose();
    this.mesh.geometry = createHeadwaterFallGeometry(tier);
    this.mist.setQuality(tier);
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
    this.mist.dispose();
    this.group.clear();
  }
}
