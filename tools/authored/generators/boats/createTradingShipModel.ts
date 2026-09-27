import * as THREE from "three";
import { SurfaceBuilder, addCollisionMarkers, addGripMarker, addMarker, type AuthoredModel, type GeneratorContext, type V3 } from "../../kit";
import { catenary, rope, timber } from "../props/parts";

/**
 * Coastal cargo sloop, metres/Y-up/+Z bow. The deck, bulwarks and fittings share
 * one hull section table. The mast passes through partners to the keel; standing
 * rigging lands on chainplates, and every sail corner reaches a spar or sheet.
 * Ten freight sockets and the original helm/fishing contact frames are retained.
 */
export function createTradingShipModel({ spec }: GeneratorContext): AuthoredModel {
  const id = spec.id, root = new THREE.Group(); root.name = spec.rootNode;
  const hull = new SurfaceBuilder(spec.palette), deck = new SurfaceBuilder(spec.palette);
  const rails = new SurfaceBuilder(spec.palette), rig = new SurfaceBuilder(spec.palette), fittings = new SurfaceBuilder(spec.palette);
  const wood = 0, dark = 1, teal = 2, canvas = 3, iron = 4, brass = 5;
  const sections = [
    { z: -5.85, w: 1.48, top: 1.23, bottom: 0.52 },
    { z: -5.15, w: 1.85, top: 1.23, bottom: 0.82 },
    { z: -4.45, w: 2.13, top: 1.17, bottom: 1.08 },
    { z: -3.35, w: 2.30, top: 1.16, bottom: 1.20 },
    { z: -1.75, w: 2.36, top: 1.16, bottom: 1.24 },
    { z: 0.20, w: 2.35, top: 1.16, bottom: 1.24 },
    { z: 1.80, w: 2.20, top: 1.16, bottom: 1.16 },
    { z: 3.10, w: 1.94, top: 1.19, bottom: 0.98 },
    { z: 4.20, w: 1.40, top: 1.27, bottom: 0.76 },
    { z: 5.05, w: 0.76, top: 1.36, bottom: 0.52 },
    { z: 5.65, w: 0.055, top: 1.48, bottom: 0.25 }
  ];
  const sectionAt = (z: number) => {
    const end = sections.findIndex(section => section.z >= z);
    const i = end < 0 ? sections.length - 1 : Math.max(1, end);
    const a = sections[i - 1], b = sections[i];
    const t = THREE.MathUtils.clamp((z - a.z) / (b.z - a.z), 0, 1);
    return { width: THREE.MathUtils.lerp(a.w, b.w, t), top: THREE.MathUtils.lerp(a.top, b.top, t) };
  };
  const deckTop = (z: number) => 1.26 + (z < -4.65 ? THREE.MathUtils.clamp((-z - 4.65) / 0.5, 0, 1) * 0.09 : Math.max(0, z - 2.80) * 0.055);
  const beam = (s: SurfaceBuilder, a: V3, b: V3, half: [number, number], token = wood) => timber(s, a, b, half, token,
    { bevel: Math.min(...half) < 0.04 ? 0 : Math.min(...half) * 0.22 });
  const line = (s: SurfaceBuilder, points: ReadonlyArray<V3 | THREE.Vector3>, radius = 0.022, token = canvas) => rope(s, points, radius, token, { sides: 5 });
  const ring = (s: SurfaceBuilder, center: V3, radius: number, axis: "x" | "y" | "z", tube: number, token: number, segments = 12) => {
    const path = Array.from({ length: segments + 1 }, (_, i): V3 => {
      const a = i / segments * Math.PI * 2, c = Math.cos(a) * radius, n = Math.sin(a) * radius;
      return axis === "x" ? [center[0], center[1] + c, center[2] + n]
        : axis === "y" ? [center[0] + c, center[1], center[2] + n]
          : [center[0] + c, center[1] + n, center[2]];
    });
    s.addLoft(path.map(p => ({ p, w: tube, h: tube })), { sides: 4, ref: axis === "x" ? [1, 0, 0] : axis === "y" ? [0, 1, 0] : [0, 0, 1], token });
  };
  const spar = (a: V3, b: V3, radius: number, endRadius: number, token = wood) => {
    const direction = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
    rig.addLoft([{ p: a, w: radius, h: radius }, { p: b, w: endRadius, h: endRadius }], {
      sides: 10, ref: Math.abs(direction.y) > 0.8 ? [0, 0, 1] : [0, 1, 0], capStart: 0, capEnd: 0, flat: true, token
    });
  };

  // A closed displacement hull: full shoulders, rounded bilges, a narrow keel,
  // a raked stem and a broad transom. Longitudinal wales follow this same skin.
  hull.addLoft(sections.map(a => ({ p: [0, 0.12, a.z] as V3, w: a.w, h: a.top - 0.12, hb: a.bottom })), {
    sides: 14, ref: [0, 1, 0], capStart: 0, capEnd: 0, flat: true,
    profile: [[-1, 1], [-1.015, 0.56], [-1, 0.08], [-0.91, -0.43], [-0.64, -0.81], [-0.22, -0.98], [0, -1],
      [0.22, -0.98], [0.64, -0.81], [0.91, -0.43], [1, 0.08], [1.015, 0.56], [1, 1]],
    token: ({ centroid }) => centroid.y < -0.22 ? dark : centroid.y < 0.90 ? teal : wood,
    shade: ({ u, normal }) => 0.89 + (Math.floor(u) % 3) * 0.025 + Math.abs(normal.y) * 0.025
  });
  beam(hull, [0, -1.16, -3.9], [0, -1.16, 2.8], [0.11, 0.08], dark);
  line(hull, [[0, -0.15, 5.64], [0, 0.85, 5.69], [0, 1.56, 5.70]], 0.095, dark);
  for (const side of [-1, 1]) {
    for (const fraction of [0.32, 0.80]) line(hull, sections.map(a => [side * a.w * 1.005, 0.12 + (a.top - 0.12) * fraction, a.z] as V3), fraction === 0.8 ? 0.047 : 0.026, dark);
    line(hull, sections.map(a => [side * a.w, a.top + 0.015, a.z] as V3), 0.064, wood);
  }

  // Individually fitted fore-and-aft planks, with scarf/butt joints. Their ends
  // meet the curved hull instead of protruding beyond the bow or transom.
  const deckExtent = (x: number, fore: boolean) => {
    const required = Math.abs(x) / 0.965;
    const ordered = fore ? [...sections].reverse() : sections;
    const index = ordered.findIndex(a => a.w >= required);
    if (index <= 0) return fore ? 5.56 : -5.76;
    const a = ordered[index - 1], b = ordered[index];
    return THREE.MathUtils.lerp(a.z, b.z, (required - a.w) / (b.w - a.w));
  };
  for (let plank = -9; plank <= 9; plank++) {
    deck.addPanel({ cols: 1, rows: 14, thickness: 0.10,
      point: (u, v) => {
        const x = THREE.MathUtils.clamp(plank * 0.245 + (u - 0.5) * 0.238, -2.275, 2.275);
        const z = THREE.MathUtils.lerp(deckExtent(x, false), deckExtent(x, true), v);
        return new THREE.Vector3(x, deckTop(z) - 0.05, z);
      }, token: () => wood, shade: () => 0.87 + ((plank + 12) % 4) * 0.037 });
    const x = plank * 0.245;
    for (const z of [-2.8 + ((plank + 12) % 3) * 0.6, 1.0 + ((plank + 12) % 3) * 0.6]) {
      if (Math.abs(x) < sectionAt(z).width * 0.93) beam(deck, [x - 0.11, deckTop(z) + 0.001, z], [x + 0.11, deckTop(z) + 0.001, z], [0.006, 0.003], dark);
    }
  }

  // Solid protective bulwarks with inboard knees, capped posts and removable
  // waist rails at the two loading gates. Drain openings sit at deck level.
  const railZ = [-5.75, -4.7, -3.5, -2.3, -1.1, -0.55, 0.55, 1.5, 2.6, 3.6, 4.5, 5.25, 5.60];
  const railHeight = (z: number) => deckTop(z) + 0.65 + Math.max(0, z - 3.2) * 0.045;
  for (const side of [-1, 1]) {
    for (let k = 0; k < railZ.length - 1; k++) {
      const start = railZ[k], end = railZ[k + 1], gate = start === -0.55;
      if (!gate) rails.addPanel({ cols: 2, rows: 2, thickness: 0.075,
        point: (u, v) => {
          const z = THREE.MathUtils.lerp(start + 0.025, end - 0.025, u);
          return new THREE.Vector3(side * sectionAt(z).width * 0.985, THREE.MathUtils.lerp(deckTop(z) + 0.085, railHeight(z) - 0.05, v), z);
        }, token: (_, v) => v > 0.65 ? wood : teal, shade: () => side < 0 ? 0.93 : 0.97 });
      else for (const y of [0.31, 0.62]) line(rails, [[side * sectionAt(start).width * 0.98, deckTop(start) + y, start], [side * sectionAt(end).width * 0.98, deckTop(end) + y, end]], 0.035);
      const nodes = Array.from({ length: 3 }, (_, j) => {
        const z = THREE.MathUtils.lerp(start, end, j / 2);
        return { p: [side * sectionAt(z).width * 0.985, railHeight(z), z] as V3, w: 0.075, h: 0.055 };
      });
      if (!gate) rails.addLoft(nodes, { sides: 6, ref: [0, 1, 0], capStart: 0, capEnd: 0, token: dark });
    }
    for (const z of railZ) {
      const x = side * sectionAt(z).width * 0.965;
      beam(rails, [x, deckTop(z) - 0.07, z], [x, railHeight(z) + 0.03, z], [0.06, 0.065], wood);
      if (Math.abs(z) < 4.9) beam(rails, [x - side * 0.22, deckTop(z), z], [x, deckTop(z) + 0.32, z], [0.055, 0.055], wood);
    }
    for (const z of [-3.6, -1.55, 1.2]) {
      const x = side * (sectionAt(z).width + 0.13), y = deckTop(z);
      line(fittings, [[x - side * 0.13, railHeight(z), z], [x, y + 0.23, z]], 0.021);
      fittings.addLoft([{ p: [x, y - 0.40, z], w: 0.075, h: 0.075 }, { p: [x, y - 0.28, z], w: 0.115, h: 0.115 },
        { p: [x, y + 0.18, z], w: 0.115, h: 0.115 }, { p: [x, y + 0.25, z], w: 0.075, h: 0.075 }],
      { sides: 8, ref: [1, 0, 0], capStart: 0, capEnd: 0, token: canvas, shade: 0.9 });
      for (const dy of [-0.21, 0.11]) ring(fittings, [x, y + dy, z], 0.117, "y", 0.014, dark, 8);
    }
  }
  const aftWidth = sectionAt(-5.75).width * 0.985;
  beam(rails, [-aftWidth, 1.66, -5.79], [aftWidth, 1.66, -5.79], [0.045, 0.28], teal);
  beam(rails, [-aftWidth, 2.00, -5.79], [aftWidth, 2.00, -5.79], [0.075, 0.065], dark);

  // Gameplay freight sits directly on the flat deck. Discrete tiedown eyes
  // replace the old raised grid that obstructed walking and implied ten hatches.
  for (let i = 0; i < 10; i++) {
    const x = (i % 2 ? 1 : -1) * 0.92, z = -3.15 + Math.floor(i / 2) * 1.29;
    addMarker(`${id}_cargo_${String(i + 1).padStart(2, "0")}`, [x, 1.26, z], "socket", root);
    const eyeX = Math.sign(x) * 1.52;
    beam(fittings, [eyeX, 1.268, z - 0.075], [eyeX, 1.268, z + 0.075], [0.065, 0.008], iron);
    ring(fittings, [eyeX, 1.29, z], 0.055, "z", 0.012, brass, 8);
  }

  // A low companionway leads below deck between the freight and helm; its
  // starboard side leaves the existing fishing station and side passage open.
  for (const x of [-0.56, 0.56]) beam(fittings, [x, 1.67, -4.63], [x, 1.67, -4.08], [0.045, 0.37], wood);
  beam(fittings, [-0.56, 1.67, -4.08], [0.56, 1.67, -4.08], [0.045, 0.37], teal);
  for (const x of [-0.50, 0.50]) beam(fittings, [x, 1.31, -4.66], [x, 2.05, -4.66], [0.055, 0.045], dark);
  beam(fittings, [-0.50, 2.05, -4.66], [0.50, 2.05, -4.66], [0.055, 0.045], dark);
  beam(fittings, [-0.43, 1.56, -4.55], [0.43, 1.56, -4.55], [0.065, 0.24], dark);
  for (const y of [1.38, 1.56, 1.74]) beam(fittings, [-0.38, y, -4.60], [0.38, y, -4.60], [0.035, 0.022], wood);
  fittings.addPanel({ cols: 8, rows: 2, thickness: 0.08,
    point: (u, v) => new THREE.Vector3((u - 0.5) * 1.28, 2.06 + 0.13 * Math.sin(u * Math.PI), -4.72 + v * 0.73),
    token: () => teal, shade: () => 0.94 });
  for (const z of [-4.67, -4.03]) line(fittings, Array.from({ length: 9 }, (_, i): V3 => [(i / 8 - 0.5) * 1.28, 2.06 + 0.13 * Math.sin(i / 8 * Math.PI), z]), 0.045, dark);

  // Keel-stepped tapered mast and two attached spars. The boom is above a
  // standing sailor and both cargo columns, and is eased slightly to port.
  const mastZ = (y: number) => 2.90 - (y - 1.30) * 0.028;
  const mastTop: V3 = [0, 9.15, mastZ(9.15)];
  spar([0, -0.96, 2.96], mastTop, 0.18, 0.075);
  for (const y of [1.38, 1.64]) ring(rig, [0, y, mastZ(y)], 0.182, "y", 0.023, iron);
  beam(fittings, [-0.34, 1.41, 2.89], [0.34, 1.41, 2.89], [0.23, 0.08], dark);
  const tack = new THREE.Vector3(-0.07, 3.64, 2.72), clew = new THREE.Vector3(-1.26, 3.72, -3.90);
  const throat = new THREE.Vector3(-0.07, 7.16, 2.59), peak = new THREE.Vector3(-0.86, 8.62, -1.86);
  spar([0, 3.50, 2.84], [-1.33, 3.59, -4.10], 0.085, 0.055);
  spar([0, 7.28, 2.75], [-0.92, 8.76, -2.06], 0.072, 0.048);
  ring(rig, [0, 3.50, mastZ(3.50)], 0.16, "y", 0.022, iron);
  for (const side of [-1, 1]) beam(rig, [side * 0.17, 7.28, 2.90], [side * 0.17, 7.28, 2.53], [0.035, 0.035], wood);
  const sailPoint = (u: number, v: number) => tack.clone().lerp(clew, u).lerp(throat.clone().lerp(peak, u), v)
    .add(new THREE.Vector3(-0.40 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI), Math.sin(u * Math.PI) * (1 - v) * 0.075, 0));
  rig.addPanel({ cols: 18, rows: 12, thickness: 0.022, point: sailPoint,
    token: (u, v) => v < 0.07 || (u > 0.90 && v < 0.34) ? teal : canvas,
    shade: (u) => Math.floor(u * 9) % 2 ? 0.95 : 1 });
  for (const v of [0, 1]) line(rig, Array.from({ length: 19 }, (_, i) => sailPoint(i / 18, v)), 0.020);
  for (const u of [0, 1]) line(rig, Array.from({ length: 13 }, (_, i) => sailPoint(u, i / 12)), 0.020);
  for (let i = 0; i < 7; i++) {
    const y = 3.70 + i * 0.55;
    ring(rig, [0, y, mastZ(y)], 0.158, "y", 0.015, dark, 10);
    line(rig, [[-0.15, y, mastZ(y)], sailPoint(0, (y - 3.64) / (7.16 - 3.64))], 0.013);
  }
  for (const v of [0.28, 0.53]) for (const u of [0.17, 0.34, 0.51, 0.68, 0.85]) {
    const p = sailPoint(u, v);
    line(rig, [p.clone().add(new THREE.Vector3(-0.03, 0, 0)), p.clone().add(new THREE.Vector3(-0.07, -0.17, 0.02))], 0.012);
  }
  line(rig, [mastTop, peak.clone().add(new THREE.Vector3(0.05, 0.13, -0.12))], 0.028);
  line(rig, [[0.11, 8.65, mastZ(8.65)], [0.11, 7.30, 2.73], [0.24, 1.90, 2.79]], 0.023);
  line(rig, [mastTop, [-1.33, 3.59, -4.10]], 0.020);
  line(rig, catenary([-1.31, 3.61, -4.0], [-1.45, 1.71, -5.17], 0.055, 7), 0.025);

  // Forestay and a separate, filled staysail. Hanks, tack and sheets visibly
  // attach the cloth; neither sail floats from an unsupported corner.
  const stayFoot: V3 = [0, 1.86, 5.60], stayHead: V3 = [0, 8.91, mastZ(8.91)];
  line(rig, [stayFoot, stayHead], 0.029, dark);
  const jibTack = new THREE.Vector3(-0.025, 2.01, 5.48), jibClew = new THREE.Vector3(-0.44, 3.85, 2.59), jibHead = new THREE.Vector3(-0.025, 8.40, 2.86);
  const jibPoint = (u: number, v: number) => jibTack.clone().lerp(jibClew, u).lerp(jibHead.clone().add(new THREE.Vector3(0, 0, -u * 0.018)), v)
    .add(new THREE.Vector3(-0.22 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI), 0, 0));
  rig.addPanel({ cols: 10, rows: 12, thickness: 0.018, point: jibPoint, token: () => canvas,
    shade: u => Math.floor(u * 6) % 2 ? 0.94 : 0.99 });
  for (const u of [0, 1]) line(rig, Array.from({ length: 13 }, (_, i) => jibPoint(u, i / 12)), 0.018);
  line(rig, Array.from({ length: 11 }, (_, i) => jibPoint(i / 10, 0)), 0.019);
  line(rig, [jibTack, stayFoot], 0.021);
  line(rig, [jibHead, stayHead, [0.13, 1.86, 2.78]], 0.021);
  line(rig, catenary(jibClew, [-2.24, 1.91, 1.75], 0.04, 6), 0.022);
  for (const t of [0.14, 0.33, 0.52, 0.71, 0.90]) {
    const p = jibPoint(0, t), y = p.y;
    const z = THREE.MathUtils.lerp(stayFoot[2], stayHead[2], (y - stayFoot[1]) / (stayHead[1] - stayFoot[1]));
    line(rig, [p, [0, y, z]], 0.016, brass);
  }

  // Paired shrouds transmit mast loads to the hull, through metal chainplates
  // and deadeyes. Their lower ends remain outboard of the freight footprint.
  for (const side of [-1, 1]) for (const z of [0.15, 1.20, 2.24]) {
    const x = side * sectionAt(z).width * 1.015, top = deckTop(z);
    beam(fittings, [x, top - 0.36, z], [x, top + 0.37, z], [0.036, 0.022], iron);
    for (const y of [top + 0.39, top + 0.64]) {
      fittings.addLoft([{ p: [x - side * 0.037, y, z], w: 0.075, h: 0.075 }, { p: [x + side * 0.037, y, z], w: 0.075, h: 0.075 }],
        { sides: 8, ref: [0, 1, 0], capStart: 0, capEnd: 0, token: dark });
    }
    for (const dz of [-0.036, 0.036]) line(fittings, [[x, top + 0.40, z + dz], [x, top + 0.63, z + dz]], 0.012);
    line(rig, [[x, top + 0.72, z], [side * 0.07, 8.14, mastZ(8.14)]], 0.022, dark);
  }
  for (const x of [-0.43, 0.43]) beam(fittings, [x, deckTop(2.83), 2.83], [x, 1.99, 2.83], [0.05, 0.05], dark);
  beam(fittings, [-0.55, 1.97, 2.83], [0.55, 1.97, 2.83], [0.065, 0.04]);
  for (const x of [-0.35, -0.17, 0.17, 0.35]) beam(fittings, [x, 1.87, 2.79], [x, 2.10, 2.79], [0.018, 0.018], brass);

  // The anchor is stowed against the port bow and reaches an actual windlass.
  const windlassY = deckTop(4.12) + 0.33;
  for (const x of [-0.57, 0.57]) beam(fittings, [x, deckTop(4.12), 4.12], [x, windlassY + 0.05, 4.12], [0.08, 0.08], dark);
  fittings.addLoft([{ p: [-0.72, windlassY, 4.12], w: 0.14, h: 0.14 }, { p: [0.72, windlassY, 4.12], w: 0.14, h: 0.14 }],
    { sides: 10, ref: [0, 1, 0], capStart: 0, capEnd: 0, flat: true, token: wood });
  for (const x of [-0.44, 0, 0.44]) ring(fittings, [x, windlassY, 4.12], 0.145, "x", 0.025, iron);
  beam(fittings, [-0.78, windlassY, 4.12], [-0.78, windlassY + 0.26, 4.12], [0.027, 0.027], iron);
  beam(fittings, [-0.78, windlassY + 0.26, 4.12], [-1.00, windlassY + 0.26, 4.12], [0.035, 0.035], wood);
  line(fittings, [[-0.15, windlassY, 4.25], [-0.82, 1.48, 4.62], [-1.07, 1.50, 4.75], [-1.35, 0.80, 4.25]], 0.032, iron);
  beam(fittings, [-1.35, 0.62, 4.25], [-1.35, 1.30, 4.25], [0.042, 0.042], iron);
  beam(fittings, [-1.35, 1.17, 4.0], [-1.35, 1.17, 4.50], [0.035, 0.035], dark);
  for (const side of [-1, 1]) {
    beam(fittings, [-1.35, 0.62, 4.25], [-1.35, 0.73, 4.25 + side * 0.29], [0.032, 0.032], iron);
    beam(fittings, [-1.35, 0.73, 4.25 + side * 0.29], [-1.35, 0.89, 4.25 + side * 0.23], [0.065, 0.025], iron);
  }
  for (const z of [-5.20, 4.65]) for (const side of [-1, 1]) {
    const x = side * sectionAt(z).width * 0.70, y = deckTop(z);
    beam(fittings, [x, y, z], [x, y + 0.25, z], [0.065, 0.065], dark);
    beam(fittings, [x - 0.15, y + 0.23, z], [x + 0.15, y + 0.23, z], [0.035, 0.035], brass);
  }
  fittings.addLoft(Array.from({ length: 33 }, (_, i) => {
    const a = i / 12 * Math.PI * 2, r = 0.11 + i * 0.0038;
    return { p: [0.70 + Math.cos(a) * r, deckTop(3.73) + 0.025, 3.73 + Math.sin(a) * r] as V3, w: 0.019, h: 0.019 };
  }), { sides: 5, ref: [0, 1, 0], capStart: 0, capEnd: 0, token: canvas });

  // A transom-hung rudder has a continuous stock and pintles. The wheel drives
  // it below the stern deck; retained hand contacts lie on the wheel's rim.
  fittings.addHull([[-0.08, -1.16, -5.93], [0.08, -1.16, -5.93], [-0.08, -1.13, -6.48], [0.08, -1.13, -6.48],
    [-0.08, 0.48, -5.90], [0.08, 0.48, -5.90], [-0.08, 0.38, -6.35], [0.08, 0.38, -6.35]], { token: dark });
  beam(fittings, [0, -1.08, -5.92], [0, 1.40, -5.92], [0.075, 0.055], dark);
  for (const y of [-0.08, 0.48, 1.07]) {
    beam(fittings, [0, y, -5.73], [0, y, -5.96], [0.09, 0.035], iron);
    ring(fittings, [0, y, -5.93], 0.083, "y", 0.022, iron, 8);
  }
  beam(fittings, [-0.21, 1.40, -5.02], [0.21, 1.40, -5.02], [0.16, 0.045], dark);
  beam(fittings, [0, 1.37, -5.02], [0, 1.90, -5.02], [0.08, 0.075], wood);
  ring(fittings, [0, 1.90, -5.0], 0.30, "z", 0.032, wood, 20);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    beam(fittings, [0, 1.90, -5.0], [Math.cos(a) * 0.365, 1.90 + Math.sin(a) * 0.365, -5.0], [0.018, 0.022], brass);
  }
  ring(fittings, [0, 1.90, -5.0], 0.067, "z", 0.025, brass, 10);

  addMarker(`${id}_driver_station`, [0, 1.35, -5.48], "socket", root);
  addMarker(`${id}_fishing_station`, [1.3, 1.25, -4.28], "socket", root);
  for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
    addGripMarker(`${id}_helm_grip_${side}`, [sign * 0.24, 2.08, -5.0], [0, -1, 0], [0, 0, 1], root);
    addMarker(`${id}_foot_${side}_socket`, [sign * 0.22, 1.35, -5.48], "socket", root);
  }
  for (const [suffix, builder] of [["hull", hull], ["deck", deck], ["bulwarks", rails], ["rig", rig], ["fittings", fittings]] as const)
    root.add(builder.buildMesh(`${id}_${suffix}`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}
