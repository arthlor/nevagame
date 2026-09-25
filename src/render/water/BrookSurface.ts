import * as THREE from "three";
import { mainlandBrookCourses, mainlandBrookHalfWidth } from "../../world/MainlandBrooks";
import { mainlandRoadDeckAt } from "../../world/NevaMainland";
import { WorldLayout } from "../../world/WorldLayout";
import { applyWorldAtmosphere } from "../atmosphere/AtmosphereMaterial";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { PALETTE_HEX } from "../materials/PaletteTokens";

/**
 * Running water of the mainland brooks (`MainlandBrooks`): one thin ribbon per
 * traced course, laid on the channel floor the terrain grid actually renders
 * rather than on the analytic bed, which the 3.125 m grid cannot resolve.
 * Detail scrolls downstream along the course, faster where the bed is steep,
 * and steep reaches break into foam. Presentation only; the brooks own no
 * water state. Numbers live in `VisualRenderConfig.waterSurface.brooks`.
 */
const BROOK_PROGRAM_CACHE_KEY = "neva-brook-surface-v2";
/** Lift above the rendered floor, so the water never flickers into it. */
const FLOOR_CLEARANCE_METERS = 0.07;

interface RibbonPoint { x: number; z: number; bed: number; hectares: number }

function smoothstep(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Centripetal-free Catmull-Rom through the knots, spaced along the course. */
function densify(knots: readonly (readonly [number, number, number, number])[], spacing: number): RibbonPoint[] {
  const points: RibbonPoint[] = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[Math.max(0, i - 1)], b = knots[i], c = knots[i + 1], d = knots[Math.min(knots.length - 1, i + 2)];
    const steps = Math.max(1, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / spacing));
    for (let step = 0; step < steps; step++) {
      const t = step / steps, t2 = t * t, t3 = t2 * t;
      const spline = (k: number): number => 0.5 * ((2 * b[k]) + (-a[k] + c[k]) * t
        + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3);
      // Bed and catchment interpolate linearly, so the bed keeps falling downstream.
      points.push({ x: spline(0), z: spline(1), bed: b[2] + (c[2] - b[2]) * t, hectares: b[3] + (c[3] - b[3]) * t });
    }
  }
  const last = knots[knots.length - 1];
  points.push({ x: last[0], z: last[1], bed: last[2], hectares: last[3] });
  return points;
}

function brookGeometry(): THREE.BufferGeometry {
  const config = CANONICAL_RENDER_CONFIG.waterSurface.brooks;
  const positions: number[] = [];
  const uvs: number[] = [];
  const flows: number[] = [];
  const indices: number[] = [];
  for (const course of mainlandBrookCourses()) {
    const points = densify(course.knots, config.spacingMeters);
    const base = positions.length / 3;
    let courseLength = 0;
    for (let i = 1; i < points.length; i++) courseLength += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    // A brook seeps out of the ground at its source and spreads into the water
    // it joins at its mouth, so neither end is a cut edge.
    const joinsBrook = !["lake", "river", "sea"].includes(course.outlet);
    let along = 0;
    let previousCovered = false;
    for (let i = 0; i < points.length; i++) {
      const previous = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
      const tx = next.x - previous.x, tz = next.z - previous.z, length = Math.max(1e-6, Math.hypot(tx, tz));
      const fx = tx / length, fz = tz / length;
      if (i > 0) along += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
      const run = Math.max(0.5, Math.hypot(next.x - previous.x, next.z - previous.z));
      const grade = Math.max(0, (previous.bed - next.bed) / run);
      const half = mainlandBrookHalfWidth(points[i].hectares) + config.edgeOverlapMeters;
      const fade = Math.min(smoothstep(0, config.sourceFadeMeters, along),
        smoothstep(0, joinsBrook ? config.confluenceFadeMeters : config.mouthFadeMeters, courseLength - along));
      for (const side of [-1, 1]) {
        const x = points[i].x - fz * half * side, z = points[i].z + fx * half * side;
        positions.push(x, WorldLayout.terrainBaseSurfaceHeight(x, z) + FLOOR_CLEARANCE_METERS, z);
        uvs.push(along, side);
        flows.push(fx, fz, grade, fade);
      }
      // A road deck carries its own surface over the culvert; the water
      // passes under it and must not be draped over the road.
      const covered = mainlandRoadDeckAt(points[i].x, points[i].z) > 0.02;
      if (i > 0 && !covered && !previousCovered) {
        const at = base + i * 2;
        // Counter-clockwise seen from above, so the water faces the sky.
        indices.push(at - 2, at - 1, at, at - 1, at + 1, at);
      }
      previousCovered = covered;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("brookFlow", new THREE.Float32BufferAttribute(flows, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const VERTEX_DECLARATIONS = /* glsl */ `
attribute vec4 brookFlow;
varying vec2 vBrookUv;
varying vec4 vBrookFlow;
`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
uniform float uTime;
uniform float uBrookFlowSpeed;
uniform float uBrookGradeFlowGain;
uniform float uBrookRippleScale;
uniform float uBrookRippleStrength;
uniform float uBrookRapidsStart;
uniform float uBrookRapidsFull;
uniform float uBrookRapidsFoam;
uniform float uBrookEdgeFoam;
uniform vec3 uBrookShallow;
uniform vec3 uBrookBody;
uniform vec3 uBrookFoam;
varying vec2 vBrookUv;
varying vec4 vBrookFlow;
float brookHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float brookNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(brookHash(i), brookHash(i + vec2(1.0, 0.0)), u.x),
    mix(brookHash(i + vec2(0.0, 1.0)), brookHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float brookRipple(vec2 p, float shift) {
  return brookNoise(vec2(p.x - shift, p.y)) * 0.62 + brookNoise(vec2(p.x * 2.1 - shift * 1.7, p.y * 2.3 + 7.1)) * 0.38;
}
`;

function createBrookMaterial(time: THREE.IUniform<number>): THREE.MeshStandardMaterial {
  const config = CANONICAL_RENDER_CONFIG.waterSurface.brooks;
  const material = new THREE.MeshStandardMaterial({
    name: "neva_brook_water",
    color: new THREE.Color(PALETTE_HEX.water_mid_01),
    roughness: config.roughness,
    metalness: 0,
    transparent: true,
    opacity: config.opacity,
    depthWrite: false
  });
  const uniforms: Record<string, THREE.IUniform> = {
    uTime: time,
    uBrookFlowSpeed: { value: config.flowMetersPerSecond },
    uBrookGradeFlowGain: { value: config.gradeFlowGain },
    uBrookRippleScale: { value: config.rippleScaleMeters },
    uBrookRippleStrength: { value: config.rippleStrength },
    uBrookRapidsStart: { value: config.rapidsGradeStart },
    uBrookRapidsFull: { value: config.rapidsGradeFull },
    uBrookRapidsFoam: { value: config.rapidsFoamStrength },
    uBrookEdgeFoam: { value: config.edgeFoamStrength },
    uBrookShallow: { value: new THREE.Color(PALETTE_HEX.water_shallow_01) },
    uBrookBody: { value: new THREE.Color(PALETTE_HEX.water_mid_01) },
    uBrookFoam: { value: new THREE.Color(PALETTE_HEX.foam_warm_01) }
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_DECLARATIONS}`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBrookUv = uv;\nvBrookFlow = brookFlow;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_DECLARATIONS}`)
      .replace("#include <color_fragment>", /* glsl */ `#include <color_fragment>
float brookAcross = abs(vBrookUv.y);
float brookGrade = vBrookFlow.z;
float brookShift = uTime * uBrookFlowSpeed * (1.0 + brookGrade * uBrookGradeFlowGain) / uBrookRippleScale;
vec2 brookCoord = vec2(vBrookUv.x, vBrookUv.y * 1.4) / uBrookRippleScale;
float brookRapids = smoothstep(uBrookRapidsStart, uBrookRapidsFull, brookGrade);
float brookFoamNoise = brookRipple(brookCoord * 1.7, brookShift * 1.7);
float brookFoam = brookRapids * uBrookRapidsFoam * smoothstep(0.42, 0.78, brookFoamNoise)
  + uBrookEdgeFoam * smoothstep(0.55, 0.9, brookAcross) * smoothstep(0.5, 0.8, brookFoamNoise);
vec3 brookColor = mix(uBrookShallow, uBrookBody, (1.0 - brookAcross * brookAcross) * 0.75);
diffuseColor.rgb = mix(brookColor, uBrookFoam, clamp(brookFoam, 0.0, 1.0));
diffuseColor.a *= (1.0 - smoothstep(0.72, 1.0, brookAcross)) * (1.0 + brookFoam * 0.35) * vBrookFlow.w;`)
      .replace("#include <normal_fragment_maps>", /* glsl */ `#include <normal_fragment_maps>
{
  float brookHere = brookRipple(brookCoord, brookShift);
  float brookAlong = brookRipple(brookCoord + vec2(0.35, 0.0), brookShift) - brookHere;
  float brookSide = brookRipple(brookCoord + vec2(0.0, 0.35), brookShift) - brookHere;
  vec3 brookTangent = normalize((viewMatrix * vec4(vBrookFlow.x, 0.0, vBrookFlow.y, 0.0)).xyz);
  vec3 brookBitangent = normalize((viewMatrix * vec4(-vBrookFlow.y, 0.0, vBrookFlow.x, 0.0)).xyz);
  float brookStrength = uBrookRippleStrength * (1.0 + brookRapids);
  normal = normalize(normal - (brookTangent * brookAlong + brookBitangent * brookSide) * brookStrength);
}`);
  };
  material.customProgramCacheKey = () => BROOK_PROGRAM_CACHE_KEY;
  applyWorldAtmosphere(material, { rainSurface: false });
  return material;
}

/**
 * One mesh for every brook. `time` is the water's shared time uniform, so the
 * brooks run with the rest of the water and need no update of their own.
 */
export function createBrookSurface(time: THREE.IUniform<number>): THREE.Mesh {
  const mesh = new THREE.Mesh(brookGeometry(), createBrookMaterial(time));
  mesh.name = "mainland_brooks";
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  // Drawn after the terrain and before the sea's transparent layers.
  mesh.renderOrder = -50;
  return mesh;
}
