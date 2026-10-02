import * as THREE from "three";
import {
  MAINLAND_BROOK_CULVERT_FACE_METERS,
  mainlandBrookCourses,
  mainlandBrookFloorHalfWidth,
  mainlandBrookHalfWidth
} from "../../world/MainlandBrooks";
import { mainlandBrookRoadCrossings } from "../../world/NevaMainland";
import { WorldLayout } from "../../world/WorldLayout";
import { applyWorldAtmosphere } from "../atmosphere/AtmosphereMaterial";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import { GROUND_STONES_GLSL } from "../materials/GroundStoneShader";

/**
 * Running water of the mainland brooks (`MainlandBrooks`): one ribbon per
 * traced course, laid on the channel floor the terrain grid actually renders
 * rather than on the analytic bed, which the 3.125 m grid cannot resolve.
 * The water is narrower than its floor and wanders across it, swells into a
 * pool below a steep reach and breaks white where the bed starts to fall. A
 * band of washed gravel edges it, wet and close-set at the water and thinning
 * to a few stones up the bank. Clear shallows show the stones, the deeper
 * middle holds the colour, and current streaks and glints travel downstream,
 * faster on steep reaches. At a culvert the water runs straight into the pipe
 * and stops inside the headwall; at a lake or river it fades over a short
 * join. A sea mouth sheets wider, turns toward the sea colour, and fades
 * across the beach into the water instead of ending on the waterline.
 * Presentation only; the brooks own no water
 * state. Numbers live in `VisualRenderConfig.waterSurface.brooks`.
 */
const BROOK_PROGRAM_CACHE_KEY = "neva-brook-surface-v11-shared-stones";
/** Lift above the rendered floor, so the water never flickers into it. */
const FLOOR_CLEARANCE_METERS = 0.07;
/**
 * The water datum the lake, the river and the sea stand at on the mainland.
 * A brook's water and gravel fade out as the ground they lie on reaches it,
 * so a brook ends at the waterline rather than running on under the water.
 */
const WATERLINE_FADE_METERS = [-0.02, 0.06] as const;
/**
 * Across-course stations of the ribbon: |station| <= 1 is water, 1 to 2 the
 * gravel bank. The bank is draped at half-metre stations so it follows the
 * cut bank's curve.
 */
const ACROSS = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2] as const;

interface RibbonPoint { x: number; z: number; bed: number; hectares: number }

/** Everything a ribbon row carries, interpolated where a row is cut at a culvert's face. */
interface RibbonRow {
  cx: number; cz: number; fx: number; fz: number;
  water: number; along: number; grade: number;
  waterFade: number; bankFade: number; pool: number; drop: number;
  seaMouth: number; seaCourse: number;
}

function smoothstep(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Smooth deterministic wander in [-1, 1] along a course, different for every brook. */
function wander(along: number, seed: number, wavelength: number): number {
  const a = Math.sin(along * (Math.PI * 2) / wavelength + seed * 1.7);
  const b = Math.sin(along * (Math.PI * 2) / (wavelength * 2.6) + seed * 4.1);
  return a * 0.62 + b * 0.38;
}

/** Catmull-Rom through the knots, spaced along the course. */
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

/** Bed grade at each point, measured over a few metres either side. */
function grades(points: readonly RibbonPoint[], reach: number): number[] {
  return points.map((_, i) => {
    let up = i, down = i, run = 0;
    while (up > 0 && run < reach) { run += Math.hypot(points[up].x - points[up - 1].x, points[up].z - points[up - 1].z); up--; }
    run = 0;
    while (down < points.length - 1 && run < reach) { run += Math.hypot(points[down + 1].x - points[down].x, points[down + 1].z - points[down].z); down++; }
    let length = 0;
    for (let k = up + 1; k <= down; k++) length += Math.hypot(points[k].x - points[k - 1].x, points[k].z - points[k - 1].z);
    return length > 0.5 ? Math.max(0, (points[up].bed - points[down].bed) / length) : 0;
  });
}

/** Trunks before the tributaries that join them, so a joining brook's water lies over its trunk's gravel. */
function coursesTrunkFirst(): ReturnType<typeof mainlandBrookCourses>[number][] {
  const courses = mainlandBrookCourses();
  const byId = new Map(courses.map(course => [course.id, course]));
  const depth = (id: string): number => {
    const outlet = byId.get(id)?.outlet;
    return outlet && byId.has(outlet) ? 1 + depth(outlet) : 0;
  };
  return courses.map((course, index) => ({ course, index, depth: depth(course.id) }))
    .sort((a, b) => a.depth - b.depth || a.index - b.index).map(entry => entry.course);
}

/** True where a road deck, up to just inside its culvert headwalls, covers the water. */
function underRoad(x: number, z: number, tuck: number): boolean {
  const road = WorldLayout.nearestRouteDistance(x, z);
  return road.distance - road.halfWidth < MAINLAND_BROOK_CULVERT_FACE_METERS - tuck;
}

function lerpRow(a: RibbonRow, b: RibbonRow, t: number): RibbonRow {
  const mix = (key: keyof RibbonRow) => a[key] + (b[key] - a[key]) * t;
  return { cx: mix("cx"), cz: mix("cz"), fx: mix("fx"), fz: mix("fz"), water: mix("water"), along: mix("along"),
    grade: mix("grade"), waterFade: mix("waterFade"), bankFade: mix("bankFade"), pool: mix("pool"), drop: mix("drop"),
    seaMouth: mix("seaMouth"), seaCourse: mix("seaCourse") };
}

function brookGeometry(): THREE.BufferGeometry {
  const config = CANONICAL_RENDER_CONFIG.waterSurface.brooks;
  const positions: number[] = [];
  const uvs: number[] = [];
  const flows: number[] = [];
  const features: number[] = [];
  const indices: number[] = [];
  const stride = ACROSS.length;
  const courses = mainlandBrookCourses();
  const crossings = mainlandBrookRoadCrossings();
  const emit = (row: RibbonRow): number => {
    const first = positions.length / 3;
    for (const station of ACROSS) {
      const bank = Math.max(0, Math.abs(station) - 1);
      const reach = Math.sign(station) * (Math.min(1, Math.abs(station)) * row.water + bank * config.bankMeters);
      const x = row.cx - row.fz * reach, z = row.cz + row.fx * reach;
      const ground = WorldLayout.terrainBaseSurfaceHeight(x, z);
      // Sea mouths ease out over the beach. The tight band is what made a
      // sea outlet pop off between two terrain samples.
      const waterline = row.seaCourse > 0.5
        ? smoothstep(-1.2, 0.85, ground)
        : smoothstep(WATERLINE_FADE_METERS[0], WATERLINE_FADE_METERS[1], ground);
      positions.push(x, ground + FLOOR_CLEARANCE_METERS, z);
      uvs.push(row.along, station);
      flows.push(row.fx, row.fz, row.grade, row.waterFade * waterline);
      features.push(row.pool, row.drop, row.bankFade * waterline, row.seaMouth);
    }
    return first;
  };
  // Counter-clockwise seen from above, so the water faces the sky.
  const connect = (before: number, at: number): void => {
    for (let k = 0; k < stride - 1; k++) indices.push(before + k, before + k + 1, at + k, before + k + 1, at + k + 1, at + k);
  };
  for (const course of coursesTrunkFirst()) {
    const courseIndex = courses.indexOf(course);
    const points = densify(course.knots, config.spacingMeters);
    const sea = course.outlet === "sea";
    if (sea && points.length >= 2) {
      const prev = points[points.length - 2];
      const last = points[points.length - 1];
      const dx = last.x - prev.x;
      const dz = last.z - prev.z;
      const length = Math.max(1e-6, Math.hypot(dx, dz));
      const steps = Math.max(1, Math.ceil(config.seaMouthReachMeters / config.spacingMeters));
      for (let step = 1; step <= steps; step++) {
        const distance = config.seaMouthReachMeters * step / steps;
        points.push({
          x: last.x + (dx / length) * distance,
          z: last.z + (dz / length) * distance,
          bed: last.bed,
          hectares: last.hectares
        });
      }
    }
    const slope = grades(points, config.gradeReachMeters);
    let courseLength = 0;
    for (let i = 1; i < points.length; i++) courseLength += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    // A brook seeps out of the ground at its source and spreads into the water
    // it joins at its mouth. A joining brook's water gives way to its trunk's
    // as it reaches it, and its gravel stops at the trunk's water.
    const trunk = courses.find(candidate => candidate.id === course.outlet);
    const mouth = course.knots[course.knots.length - 1];
    const junction = trunk?.knots.reduce((best, knot) =>
      Math.hypot(knot[0] - mouth[0], knot[1] - mouth[1]) < Math.hypot(best[0] - mouth[0], best[1] - mouth[1]) ? knot : best);
    const trunkWater = junction ? mainlandBrookHalfWidth(junction[3]) : 0;
    // The water runs straight into a culvert's pipe, and a trunk runs straight
    // past the mouth of a brook that joins it.
    const culverts = crossings.filter(crossing => crossing.brookId === course.id).map(crossing => crossing.point);
    const joins = courses.filter(candidate => candidate.outlet === course.id)
      .map(candidate => candidate.knots[candidate.knots.length - 1]).map(knot => ({ x: knot[0], z: knot[1] }));
    const seed = courseIndex * 1.618 + 0.37;
    const rows: RibbonRow[] = [];
    let along = 0;
    for (let i = 0; i < points.length; i++) {
      const previous = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
      const tx = next.x - previous.x, tz = next.z - previous.z, length = Math.max(1e-6, Math.hypot(tx, tz));
      const fx = tx / length, fz = tz / length;
      if (i > 0) along += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
      const toMouth = courseLength - along;
      const upstream = slope[Math.max(0, i - Math.round(config.gradeReachMeters / config.spacingMeters))];
      const downstream = slope[Math.min(points.length - 1, i + Math.round(config.gradeReachMeters / config.spacingMeters))];
      // A pool below a steep reach, white water where the bed starts to fall.
      const pool = smoothstep(0.1, 0.3, upstream - slope[i]);
      const drop = smoothstep(0.08, 0.28, downstream - slope[i]);
      const source = smoothstep(0, config.sourceFadeMeters, along);
      // A sea mouth is half gone at the shoreline and gone a reach further
      // out, so the join is a sheet rather than a cut at the waterline.
      const openFade = sea
        ? smoothstep(-config.seaMouthReachMeters, config.seaMouthFadeMeters, toMouth - config.seaMouthReachMeters)
        : smoothstep(0, config.mouthFadeMeters, toMouth);
      const waterFade = Math.min(source, trunk
        ? smoothstep(trunkWater * 0.3, trunkWater + 1, toMouth) : openFade);
      const bankFade = Math.min(source, trunk
        ? smoothstep(trunkWater + 0.3, trunkWater + config.bankMeters + 0.6, toMouth) : openFade);
      // The water is narrower than its floor and wanders across it, but runs
      // straight at its ends, into a culvert's pipe and past a joining brook.
      const nearest = (list: readonly { x: number; z: number }[]): number =>
        list.reduce((best, point) => Math.min(best, Math.hypot(points[i].x - point.x, points[i].z - point.z)), Infinity);
      const calm = Math.min(smoothstep(config.culvertCalmMeters[0], config.culvertCalmMeters[1], nearest(culverts)),
        smoothstep(2, 8, nearest(joins)));
      // Where it runs out across a shore into open water, it spreads thin.
      const spreadReach = sea ? config.seaMouthFadeMeters + config.seaMouthReachMeters : config.mouthFadeMeters + 3;
      const spread = trunk ? 0 : (sea ? config.seaMouthSpread : config.mouthSpread) * (1 - smoothstep(0, spreadReach, toMouth));
      const water = mainlandBrookHalfWidth(points[i].hectares)
        * (1 + config.widthVariation * calm * wander(along, seed + 11, config.meanderWavelengthMeters * 0.7))
        * (1 + config.poolWidening * pool * calm) * (1 + spread);
      const room = Math.max(0, mainlandBrookFloorHalfWidth(points[i].hectares) - water - 0.3);
      const shift = room * config.meanderShare * wander(along, seed, config.meanderWavelengthMeters)
        * smoothstep(0, 6, along) * smoothstep(0, 6, toMouth) * calm;
      rows.push({ cx: points[i].x - fz * shift, cz: points[i].z + fx * shift, fx, fz, water, along, grade: slope[i],
        waterFade, bankFade, pool, drop, seaMouth: sea ? 1 - openFade : 0, seaCourse: sea ? 1 : 0 });
    }
    // A road deck carries its own surface over the culvert; the water runs
    // into the pipe and stops just inside the headwall, never over the road.
    let previousRow: number | null = null;
    let previousCovered = false;
    rows.forEach((row, i) => {
      const covered = underRoad(row.cx, row.cz, config.culvertTuckMeters);
      if (i > 0 && covered !== previousCovered) {
        let low = 0, high = 1;
        for (let k = 0; k < 12; k++) {
          const t = (low + high) / 2, probe = lerpRow(rows[i - 1], row, t);
          if (underRoad(probe.cx, probe.cz, config.culvertTuckMeters) === previousCovered) low = t; else high = t;
        }
        const boundary = emit(lerpRow(rows[i - 1], row, (low + high) / 2));
        if (previousRow !== null) connect(previousRow, boundary);
        previousRow = previousCovered ? boundary : null;
      }
      if (!covered) {
        const at = emit(row);
        if (previousRow !== null) connect(previousRow, at);
        previousRow = at;
      }
      previousCovered = covered;
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("brookFlow", new THREE.Float32BufferAttribute(flows, 4));
  geometry.setAttribute("brookFeature", new THREE.Float32BufferAttribute(features, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const VERTEX_DECLARATIONS = /* glsl */ `
attribute vec4 brookFlow;
attribute vec4 brookFeature;
varying vec2 vBrookUv;
varying vec4 vBrookFlow;
varying vec4 vBrookFeature;
varying vec2 vBrookWorld;
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
uniform float uBrookDropFoam;
uniform float uBrookEdgeFoam;
uniform float uBrookShallowOpacity;
uniform float uBrookDeepOpacity;
uniform float uBrookStreakStrength;
uniform float uBrookGlintStrength;
uniform float uBrookPebbleSize;
uniform float uBrookGritOpacity;
uniform float uBrookBedTint;
uniform vec3 uBrookShallow;
uniform vec3 uBrookBody;
uniform vec3 uBrookDeep;
uniform vec3 uBrookFoam;
uniform vec3 uBrookWetBank;
uniform vec3 uBrookGrit;
uniform vec3 uBrookStoneCool;
uniform vec3 uBrookStoneLight;
uniform vec3 uBrookStoneWarm;
varying vec2 vBrookUv;
varying vec4 vBrookFlow;
varying vec4 vBrookFeature;
varying vec2 vBrookWorld;
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
${GROUND_STONES_GLSL}
`;

function createBrookMaterial(time: THREE.IUniform<number>): THREE.MeshStandardMaterial {
  const config = CANONICAL_RENDER_CONFIG.waterSurface.brooks;
  const material = new THREE.MeshStandardMaterial({
    name: "neva_brook_water",
    color: new THREE.Color(PALETTE_HEX.water_mid_01),
    roughness: config.roughness,
    metalness: 0,
    transparent: true,
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
    uBrookDropFoam: { value: config.dropFoamStrength },
    uBrookEdgeFoam: { value: config.edgeFoamStrength },
    uBrookShallowOpacity: { value: config.shallowOpacity },
    uBrookDeepOpacity: { value: config.deepOpacity },
    uBrookStreakStrength: { value: config.streakStrength },
    uBrookGlintStrength: { value: config.glintStrength },
    uBrookPebbleSize: { value: config.pebbleMeters },
    uBrookGritOpacity: { value: config.gritOpacity },
    uBrookBedTint: { value: config.bedTint },
    uBrookShallow: { value: new THREE.Color(PALETTE_HEX.water_shallow_01) },
    uBrookBody: { value: new THREE.Color(PALETTE_HEX.water_mid_01) },
    uBrookDeep: { value: new THREE.Color(PALETTE_HEX.water_deep_01) },
    uBrookFoam: { value: new THREE.Color(PALETTE_HEX.foam_warm_01) },
    uBrookWetBank: { value: new THREE.Color(PALETTE_HEX.soil_damp_01) },
    uBrookGrit: { value: new THREE.Color(PALETTE_HEX.sand_coastal_wet_01) },
    uBrookStoneCool: { value: new THREE.Color(PALETTE_HEX.stone_cool_01) },
    uBrookStoneLight: { value: new THREE.Color(PALETTE_HEX.stone_coastal_light_01) },
    uBrookStoneWarm: { value: new THREE.Color(PALETTE_HEX.stone_coastal_warm_01) }
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_DECLARATIONS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vBrookUv = uv;
vBrookFlow = brookFlow;
vBrookFeature = brookFeature;
vBrookWorld = (modelMatrix * vec4(transformed, 1.0)).xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_DECLARATIONS}`)
      .replace("#include <color_fragment>", /* glsl */ `#include <color_fragment>
// The water's edge frays a little, so it never runs as a ruled line.
float brookAcross = abs(vBrookUv.y) + (brookNoise(vBrookWorld * 1.6) - 0.5) * 0.14;
float brookWater = 1.0 - smoothstep(0.9, 1.04, brookAcross);
float brookGrade = vBrookFlow.z;
float brookSpeed = uBrookFlowSpeed * (1.0 + brookGrade * uBrookGradeFlowGain);
float brookShift = uTime * brookSpeed / uBrookRippleScale;
vec2 brookCoord = vec2(vBrookUv.x, vBrookUv.y * 1.4) / uBrookRippleScale;
float brookRapids = smoothstep(uBrookRapidsStart, uBrookRapidsFull, brookGrade);
float brookFoamNoise = brookRipple(brookCoord * 1.7, brookShift * 1.7);
// Current streaks: long thin lanes that travel with the flow.
float brookStreak = brookNoise(vec2(vBrookUv.x / (uBrookRippleScale * 3.2) - brookShift * 0.32, vBrookUv.y * 2.6 + 3.1));
float brookFoam = brookRapids * uBrookRapidsFoam * smoothstep(0.42, 0.78, brookFoamNoise)
  + vBrookFeature.y * uBrookDropFoam * smoothstep(0.3, 0.7, brookFoamNoise)
  + uBrookEdgeFoam * smoothstep(0.7, 0.98, brookAcross) * smoothstep(0.45, 0.75, brookFoamNoise);
brookFoam = clamp(brookFoam, 0.0, 1.0) * brookWater;
// Washed gravel: close-set wet stones at the water, thinning up the bank,
// with grit between them; the same stones lie under the clear shallows.
vec2 brookStoneSlope;
float brookStoneNearest;
float brookBank = clamp(brookAcross - 1.0, 0.0, 1.0);
vec4 brookStone = nevaGroundStones(vBrookWorld / uBrookPebbleSize, mix(0.95, 0.0, pow(brookBank, 0.8)),
  brookStoneSlope, brookStoneNearest);
float brookStoneMask = brookStone.x;
// Mostly cool grey stones, a few pale ones and the odd warm one.
vec3 brookStoneColor = mix(mix(uBrookStoneCool, uBrookStoneLight, smoothstep(0.55, 0.95, brookStone.w) * 0.7),
  uBrookStoneWarm, step(0.9, brookStone.w));
brookStoneColor *= (0.8 + 0.24 * clamp(brookStone.y, 0.0, 1.0)) * mix(0.72, 0.94, smoothstep(0.0, 0.5, brookBank));
// Grit settles dark in each stone's lee.
vec3 brookGrit = mix(uBrookWetBank, uBrookGrit * 0.82, smoothstep(0.1, 0.8, brookBank))
  * mix(0.72, 1.0, smoothstep(1.0, 1.35, brookStoneNearest));
vec3 brookGravel = mix(brookGrit, brookStoneColor, brookStoneMask);
float brookGravelAlpha = max(brookStoneMask, uBrookGritOpacity * (1.0 - smoothstep(0.05, 0.85, brookBank)));
// Clear shallows over the gravel, colour held in the deeper middle and pools.
float brookDepth = clamp((1.0 - brookAcross * brookAcross) * (0.7 + vBrookFeature.x * 0.5), 0.0, 1.0);
vec3 brookBed = mix(uBrookGrit * 0.7, brookStoneColor * 0.82, brookStoneMask * (1.0 - brookDepth) * 0.7);
vec3 brookShallows = mix(uBrookShallow, brookBed, uBrookBedTint);
vec3 brookColor = mix(brookShallows, mix(uBrookBody, uBrookDeep, 0.25 + vBrookFeature.x * 0.45), brookDepth * brookDepth);
brookColor *= 1.0 + (smoothstep(0.55, 0.85, brookStreak) - 0.3) * uBrookStreakStrength;
float brookGlint = pow(brookNoise(brookCoord * 2.8 + vec2(-brookShift * 2.2, uTime * 0.7)), 22.0) * uBrookGlintStrength;
vec3 brookSurface = mix(brookColor + brookGlint, uBrookFoam, brookFoam);
float brookAlpha = mix(uBrookShallowOpacity, uBrookDeepOpacity, brookDepth) + brookFoam * 0.3;
diffuseColor.rgb = mix(brookGravel, brookSurface, brookWater);
// A sea mouth takes the sea's colour as it thins, so the sheet joins the water.
diffuseColor.rgb = mix(diffuseColor.rgb, uBrookDeep, vBrookFeature.w * brookWater);
diffuseColor.a = clamp(mix(brookGravelAlpha * vBrookFeature.z, brookAlpha * vBrookFlow.w, brookWater), 0.0, 1.0);`)
      .replace("#include <roughnessmap_fragment>", /* glsl */ `#include <roughnessmap_fragment>
// Stones at the water shine wet; grit and the dry stones up the bank are matte.
roughnessFactor = mix(mix(0.62, 0.92, smoothstep(0.1, 0.6, brookBank)), roughnessFactor, brookWater);`)
      .replace("#include <normal_fragment_maps>", /* glsl */ `#include <normal_fragment_maps>
{
  float brookHere = brookRipple(brookCoord, brookShift);
  float brookAlong = brookRipple(brookCoord + vec2(0.35, 0.0), brookShift) - brookHere;
  float brookSide = brookRipple(brookCoord + vec2(0.0, 0.35), brookShift) - brookHere;
  vec3 brookTangent = normalize((viewMatrix * vec4(vBrookFlow.x, 0.0, vBrookFlow.y, 0.0)).xyz);
  vec3 brookBitangent = normalize((viewMatrix * vec4(-vBrookFlow.y, 0.0, vBrookFlow.x, 0.0)).xyz);
  float brookStrength = uBrookRippleStrength * (1.0 + brookRapids + vBrookFeature.y) * brookWater;
  normal = normalize(normal - (brookTangent * brookAlong + brookBitangent * brookSide) * brookStrength);
  // Each bank stone's rounded top takes the light.
  vec3 brookStoneTilt = (viewMatrix * vec4(brookStoneSlope.x, 0.0, brookStoneSlope.y, 0.0)).xyz;
  normal = normalize(normal + brookStoneTilt * 0.85 * brookStoneMask * (1.0 - brookWater));
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
