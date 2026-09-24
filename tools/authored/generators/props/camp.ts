import * as THREE from "three";

import { SurfaceBuilder, addCollisionMarkers, mulberry32, type AuthoredModel, type GeneratorContext, type Station } from "../../kit";
import { lumps, rope, timber, v3 } from "./parts";

/**
 * Camp and trail props: smoke plume, clay oven, fire pit, trail kiosk, trail signpost. glTF space:
 * +Y up, ground-centred, the front toward +Z, metres.
 */

/** A lumpy puff: a short loft of `radius` with seeded lumps and domed ends. */
function puff(surface: SurfaceBuilder, centre: THREE.Vector3, radius: number, token: number, seed: number, shade: number): void {
  surface.addLoft([
    { p: v3(centre.clone().add(new THREE.Vector3(0, -radius * 0.7, 0))), w: radius * 0.62, h: radius * 0.62 },
    { p: v3(centre.clone().add(new THREE.Vector3(0, -radius * 0.25, 0))), w: radius * 0.97, h: radius * 0.97 },
    { p: v3(centre.clone().add(new THREE.Vector3(0, radius * 0.25, 0))), w: radius * 0.97, h: radius * 0.97 },
    { p: v3(centre.clone().add(new THREE.Vector3(0, radius * 0.7, 0))), w: radius * 0.62, h: radius * 0.62 }
  ], { sides: 10, ref: [0, 0, 1], capStart: 0.5, capEnd: 0.5, radial: lumps(seed, 0.06), token, shade });
}

/**
 * Smoke plume. Redesigned from the Blender stack of rocks: a column of soft puffs rises from a warm,
 * dense base, drifting downwind as it climbs, the puffs growing, thinning apart and paling toward the
 * top: smoke, not a pillar.
 */
export function createSmokePlumeModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: pale sky, cream, warm horizon.
  const surface = new SurfaceBuilder(context.spec.palette);
  const PALE = 0;
  const CREAM = 1;
  const WARM = 2;
  // Billows: clusters of round puffs, a tight warm core low down opening into broad pale clouds.
  const layers = 8;
  for (let i = 0; i < layers; i += 1) {
    const t = i / (layers - 1);
    const y = 0.14 + t * 2.3 + t * t * 0.1;
    const drift = t * t * 0.6;
    const radius = 0.13 + t * 0.3;
    const token = t < 0.2 ? WARM : t < 0.5 ? CREAM : PALE;
    const count = t < 0.15 ? 1 : 3;
    const spin = random() * Math.PI * 2;
    for (let k = 0; k < count; k += 1) {
      const a = spin + (k / count) * Math.PI * 2;
      const off = count === 1 ? 0 : radius * 0.62;
      puff(surface, new THREE.Vector3(drift + Math.cos(a) * off, y + (k % 2) * radius * 0.25, Math.sin(a) * off * 0.85),
        radius * (0.78 + random() * 0.2), token, i * 3 + k, (k % 2 ? 0.9 : 1) + random() * 0.06);
    }
  }
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/**
 * Clay bake oven. Redesigned from the Blender oven: a squat faceted clay dome on a coursed stone
 * plinth, its arched mouth framed in dark timber with a stone sill and a leaning wooden door, a
 * clay flue with a lip at the back of the dome, and split firewood stacked in the plinth's niche.
 */
export function createClayOvenModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const p = context.parameters;
  const random = mulberry32(context.seed);
  const width = Number(p.width ?? 1.35);
  const depth = Number(p.depth ?? 1.28);
  const height = Number(p.height ?? 1.35);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: stone, ochre clay, dark timber.
  const surface = new SurfaceBuilder(spec.palette);
  const STONE = 0;
  const CLAY = 1;
  const DARK = 2;
  const plinth = height * 0.36;
  const courses = 3;
  for (let c = 0; c < courses; c += 1) {
    const y = (plinth / courses) * (c + 0.5);
    const edges = [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const;
    for (const [x0, z0, x1, z1] of edges) {
      const a = new THREE.Vector3((x0 * width) / 2, y, (z0 * depth) / 2);
      const b = new THREE.Vector3((x1 * width) / 2, y, (z1 * depth) / 2);
      const run = a.distanceTo(b);
      let t = c % 2 ? 0.1 : 0;
      while (t < run - 0.04) {
        const piece = Math.min(run - t, 0.26 + random() * 0.18);
        // The front face leaves a niche for firewood in the lower two courses.
        const mid = a.clone().lerp(b, (t + piece / 2) / run);
        if (!(z0 === 1 && z1 === 1 && c < 2 && Math.abs(mid.x) < width * 0.22)) {
          timber(surface, a.clone().lerp(b, t / run), a.clone().lerp(b, (t + piece - 0.015) / run), [0.1, plinth / courses / 2 - 0.008], STONE,
            { ref: [0, 1, 0], bevel: 0.025, shade: 0.82 + random() * 0.2 });
        }
        t += piece;
      }
    }
  }
  timber(surface, [0, plinth / 2, -depth / 2 + 0.1], [0, plinth / 2, depth / 2 - 0.2], [width / 2 - 0.1, plinth / 2 - 0.01], STONE, { ref: [0, 1, 0], shade: 0.75 });
  timber(surface, [0, plinth + 0.03, -depth / 2 - 0.02], [0, plinth + 0.03, depth / 2 + 0.03], [width / 2 + 0.03, 0.035], STONE, { ref: [0, 1, 0], bevel: 0.02, shade: 1.02 });
  // Firewood in the niche.
  for (let k = 0; k < 7; k += 1) {
    const row = Math.floor(k / 4);
    const x = -width * 0.15 + (k % 4) * width * 0.1 + row * width * 0.05;
    const y = 0.07 + row * 0.12;
    surface.addLoft([{ p: [x, y, depth / 2 - 0.3], w: 0.055, h: 0.055 }, { p: [x, y, depth / 2 + 0.02], w: 0.055, h: 0.055 }],
      { sides: 6, ref: [0, 1, 0], capStart: 0, capEnd: 0, token: DARK, shade: ({ u }) => (u > 1 ? 1.04 : 0.82) });
  }
  // Faceted clay dome.
  const domeBase = plinth + 0.06;
  const domeH = height - domeBase - 0.08;
  const rings = [[0, 1], [0.35, 0.97], [0.62, 0.84], [0.84, 0.6], [0.97, 0.3], [1, 0.05]];
  surface.addLoft(rings.map(([t, k]): Station => ({ p: [0, domeBase + t * domeH, -0.04], w: (width / 2 - 0.08) * k, h: (depth / 2 - 0.1) * k })), {
    sides: 12, ref: [0, 0, 1], capStart: 0, capEnd: 0.2, flat: true, token: CLAY,
    shade: () => 0.88 + random() * 0.14, tone: (q) => 0.9 + 0.1 * THREE.MathUtils.clamp((q.y - domeBase) / domeH, 0, 1)
  });
  // Arched mouth: a dark opening framed in timber with a stone sill.
  const mouthZ = depth / 2 - 0.16;
  const mouth = (a: number, r: number): THREE.Vector3 => new THREE.Vector3(Math.cos(a) * r, domeBase + Math.sin(a) * r * 1.1, mouthZ);
  surface.addPatch([0, domeBase + 0.1, mouthZ + 0.012], Array.from({ length: 9 }, (_, i) => v3(mouth((i / 8) * Math.PI, 0.2).add(new THREE.Vector3(0, 0, 0.012)))), [0, 0, 1],
    { token: DARK, shade: 0.72 });
  rope(surface, Array.from({ length: 9 }, (_, i) => mouth((i / 8) * Math.PI, 0.23).add(new THREE.Vector3(0, 0, 0.02))), 0.035, DARK, { sides: 5 });
  timber(surface, [-0.28, domeBase - 0.01, mouthZ + 0.04], [0.28, domeBase - 0.01, mouthZ + 0.04], [0.09, 0.025], STONE, { ref: [0, 1, 0], bevel: 0.015, shade: 1.02 });
  // Door leaning beside the mouth.
  timber(surface, [width * 0.33, plinth + 0.05, depth / 2 + 0.02], [width * 0.36, plinth + 0.46, depth / 2 - 0.06], [0.16, 0.022], DARK, { ref: [0, 0, 1], bevel: 0.01 });
  rope(surface, [[width * 0.345, plinth + 0.3, depth / 2 + 0.01], [width * 0.345, plinth + 0.3, depth / 2 + 0.06]], 0.012, DARK, { sides: 5 });
  // Flue at the back of the dome.
  surface.addLoft([[0.62, 0.1], [1.05, 0.085], [1.12, 0.1], [1.16, 0.1]].map(([t, r]): Station => ({ p: [0, domeBase + t * domeH, -depth * 0.22], w: r, h: r })),
    { sides: 8, ref: [0, 0, 1], capStart: 0, token: CLAY, shade: 0.94 });
  surface.addDisc([0, domeBase + 1.162 * domeH, -depth * 0.22], [0, 1, 0], 0.075, { token: DARK, sides: 8, shade: 0.72 });
  root.add(surface.buildMesh(`${ID}_mesh`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}

/**
 * Fire pit. Redesigned from the Blender pit: a ring of rounded stones in two tones round an ash bed,
 * split logs leaning in a teepee over glowing embers, and tongues of flame rising from the heart.
 */
export function createFirePitModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: cool stone, warm stone, dark wood, flame.
  const surface = new SurfaceBuilder(context.spec.palette);
  const COOL = 0;
  const WARM = 1;
  const WOOD = 2;
  const FLAME = 3;
  const ring = 0.46;
  const stones = 12;
  for (let k = 0; k < stones; k += 1) {
    const a = (k / stones) * Math.PI * 2 + random() * 0.1;
    const r = 0.1 + random() * 0.03;
    const c = new THREE.Vector3(Math.cos(a) * ring, r * 0.55, Math.sin(a) * ring);
    surface.addLoft([
      { p: v3(c.clone().add(new THREE.Vector3(0, -r * 0.55, 0))), w: r * 1.05, h: r * 0.9 },
      { p: v3(c), w: r * 1.1, h: r },
      { p: v3(c.clone().add(new THREE.Vector3(0, r * 0.45, 0))), w: r * 0.7, h: r * 0.6 }
    ], { sides: 7, ref: [Math.cos(a), 0, Math.sin(a)], capStart: 0, capEnd: 0.5, radial: lumps(k, 0.15), token: k % 3 ? COOL : WARM, shade: 0.86 + random() * 0.16 });
  }
  surface.addDisc([0, 0.012, 0], [0, 1, 0], ring - 0.06, { token: COOL, sides: 12, shade: 0.74 });
  // Teepee of split logs.
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const foot = new THREE.Vector3(Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3);
    const tip = new THREE.Vector3(Math.cos(a) * 0.04, 0.46, Math.sin(a) * 0.04);
    rope(surface, [foot, tip], 0.04, WOOD, { sides: 5, taper: [1, 0.7], shade: 0.9 });
  }
  // Embers and flames.
  for (let k = 0; k < 7; k += 1) {
    const a = random() * Math.PI * 2;
    const r = random() * 0.14;
    surface.addEllipsoid([Math.cos(a) * r, 0.04, Math.sin(a) * r], [0.05, 0.03, 0.05], { token: FLAME, sides: 5, shade: 0.85 + random() * 0.15 });
  }
  for (let k = 0; k < 5; k += 1) {
    const a = (k / 5) * Math.PI * 2 + random();
    const base = new THREE.Vector3(Math.cos(a) * 0.07, 0.05, Math.sin(a) * 0.07);
    const h = 0.28 + random() * 0.22;
    const lean = new THREE.Vector3(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05);
    surface.addLoft([
      { p: v3(base), w: 0.06, h: 0.05 },
      { p: v3(base.clone().add(new THREE.Vector3(0, h * 0.35, 0)).add(lean)), w: 0.065, h: 0.055 },
      { p: v3(base.clone().add(new THREE.Vector3(0, h * 0.7, 0)).addScaledVector(lean, -0.5)), w: 0.035, h: 0.03 },
      { p: v3(base.clone().add(new THREE.Vector3(0, h, 0)).add(lean)), w: 0.004, h: 0.004 }
    ], { sides: 6, ref: [0, 0, 1], capStart: 0.2, token: FLAME, shade: 1.04 });
  }
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/**
 * Trail kiosk. Redesigned from the Blender kiosk: two squared posts carry a framed noticeboard under a
 * little gabled roof thatched with turf; the board holds a trail map with a dashed route and pinned
 * notices; a shelf below holds a stack of leaflets.
 */
export function createTrailKioskModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: warm wood, dark wood, turf, cream paper.
  const surface = new SurfaceBuilder(context.spec.palette);
  const WOOD = 0;
  const DARK = 1;
  const TURF = 2;
  const PAPER = 3;
  const hw = 0.62;
  const boardBottom = 0.7;
  const boardTop = 1.55;
  for (const x of [-hw, hw]) {
    timber(surface, [x, 0, 0], [x, 1.72, 0], [0.05, 0.05], DARK, { ref: [0, 0, 1], bevel: 0.012 });
    timber(surface, [x, 0.02, -0.14], [x, 0.02, 0.14], [0.04, 0.03], DARK, { ref: [0, 1, 0] });
  }
  // Board: planks in a frame.
  for (let k = 0; k < 5; k += 1) {
    const y = boardBottom + ((boardTop - boardBottom) / 5) * (k + 0.5);
    timber(surface, [-hw + 0.05, y, 0], [hw - 0.05, y, 0], [0.018, (boardTop - boardBottom) / 10 - 0.004], WOOD, { ref: [0, 1, 0], shade: 0.86 + random() * 0.16 });
  }
  for (const [x0, y0, x1, y1] of [[-hw, boardBottom, hw, boardBottom], [-hw, boardTop, hw, boardTop]] as const) {
    timber(surface, [x0, y0, 0.02], [x1, y1, 0.02], [0.02, 0.035], DARK, { ref: [0, 0, 1] });
  }
  // Map with a dashed route, and pinned notices.
  const face = 0.022;
  surface.addDisc([-0.2, 1.12, face], [0, 0, 1], [0.3, 0.34], { token: PAPER, rect: true, up: [0, 1, 0] });
  const route = [[-0.44, 0.9], [-0.34, 1.02], [-0.28, 0.96], [-0.16, 1.14], [-0.04, 1.2], [0.06, 1.32]];
  for (let k = 0; k < route.length - 1; k += 1) {
    const [x0, y0] = route[k];
    const [x1, y1] = route[k + 1];
    timber(surface, [x0 + (x1 - x0) * 0.2, y0 + (y1 - y0) * 0.2, face + 0.004], [x0 + (x1 - x0) * 0.8, y0 + (y1 - y0) * 0.8, face + 0.004], [0.008, 0.002], DARK, { ref: [0, 0, 1] });
  }
  surface.addDisc([0.06, 1.32, face + 0.005], [0, 0, 1], 0.018, { token: DARK, sides: 6 });
  for (const [x, y, w, h] of [[0.3, 1.32, 0.11, 0.08], [0.33, 1.02, 0.1, 0.12]] as const) {
    surface.addDisc([x, y, face + 0.002], [0, 0, 1], [h, w], { token: PAPER, rect: true, up: [0, 1, 0], shade: 0.96 });
    surface.addDisc([x, y + h - 0.015, face + 0.006], [0, 0, 1], 0.009, { token: DARK, sides: 5 });
    for (let l = 0; l < 3; l += 1) {
      timber(surface, [x - w * 0.7, y + h * 0.4 - l * h * 0.4, face + 0.005], [x + w * 0.6, y + h * 0.4 - l * h * 0.4, face + 0.005], [0.002, 0.004], DARK, { ref: [0, 0, 1] });
    }
  }
  // Leaflet shelf.
  timber(surface, [-hw + 0.05, boardBottom - 0.06, 0.08], [hw - 0.05, boardBottom - 0.06, 0.08], [0.08, 0.015], WOOD, { ref: [0, 1, 0] });
  timber(surface, [0.2, boardBottom - 0.035, 0.08], [0.36, boardBottom - 0.035, 0.08], [0.05, 0.012], PAPER, { ref: [0, 1, 0], bevel: 0.003 });
  // Gabled turf roof.
  const ridge = 2.0;
  const eave = 1.66;
  for (const side of [-1, 1]) {
    surface.addPanel({
      cols: 6, rows: 3, thickness: 0.05,
      point: (u, v) => new THREE.Vector3((u - 0.5) * (hw * 2 + 0.3), THREE.MathUtils.lerp(ridge, eave, v) + 0.012 * Math.sin(u * 13 + v * 7), side * v * 0.42),
      token: () => TURF, shade: () => 0.86 + random() * 0.18
    });
    timber(surface, [-hw - 0.15, THREE.MathUtils.lerp(ridge, eave, 1) - 0.04, side * 0.42], [hw + 0.15, THREE.MathUtils.lerp(ridge, eave, 1) - 0.04, side * 0.42], [0.02, 0.03], DARK, { ref: [0, 1, 0] });
  }
  for (const x of [-hw, hw]) {
    for (const side of [-1, 1]) timber(surface, [x, 1.72, 0], [x, eave - 0.03, side * 0.38], [0.025, 0.025], DARK, { bevel: 0.006 });
  }
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/**
 * Trail signpost. Redesigned from the Blender post: a squared post with a small pitched cap on a
 * stone-banked foot carries three arrow boards at different heights and bearings, each a plank with a
 * pointed end, a cream painted inlay and dark lettering strokes.
 */
export function createTrailSignpostModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: warm wood, dark wood, cream paint, iron.
  const surface = new SurfaceBuilder(context.spec.palette);
  const WOOD = 0;
  const DARK = 1;
  const PAINT = 2;
  const IRON = 3;
  timber(surface, [0, 0, 0], [0, 1.9, 0], [0.055, 0.055], DARK, { ref: [0, 0, 1], bevel: 0.012 });
  surface.addLoft([{ p: [0, 1.9, 0], w: 0.1, h: 0.1 }, { p: [0, 1.93, 0], w: 0.1, h: 0.1 }],
    { sides: 4, phase: Math.PI / 4, ref: [0, 0, 1], capStart: 0, capEnd: 0.7, flat: true, token: WOOD });
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2;
    surface.addEllipsoid([Math.cos(a) * 0.16, 0.04, Math.sin(a) * 0.16], [0.08, 0.05, 0.07], { token: DARK, sides: 6, shade: 0.7 + random() * 0.2 });
  }
  const arrows = [[1.72, 0.5, 0.55], [1.5, -0.6, 0.5], [1.28, 1.9, 0.45]] as const;
  for (const [y, bearing, length] of arrows) {
    const dir = new THREE.Vector3(Math.cos(bearing), 0, Math.sin(bearing));
    const back = dir.clone().multiplyScalar(-0.12);
    const tip = dir.clone().multiplyScalar(length);
    // The board: a plank whose far end narrows to the arrow's point.
    surface.addLoft([
      { p: v3(back.clone().setY(y)), w: 0.022, h: 0.1 },
      { p: v3(tip.clone().addScaledVector(dir, -0.12).setY(y)), w: 0.022, h: 0.1 },
      { p: v3(tip.clone().setY(y)), w: 0.022, h: 0.012 }
    ], { sides: 4, phase: Math.PI / 4, ref: [0, 1, 0], capStart: 0, capEnd: 0, flat: true, token: WOOD, shade: 0.9 + random() * 0.1 });
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    for (const face of [-1, 1]) {
      const n = side.clone().multiplyScalar(face);
      const c = dir.clone().multiplyScalar(length * 0.42).setY(y).addScaledVector(n, 0.024);
      surface.addDisc(v3(c), v3(n), [0.045, length * 0.36], { token: PAINT, rect: true, up: [0, 1, 0] });
      for (let l = 0; l < 4; l += 1) {
        const at = dir.clone().multiplyScalar(length * (0.16 + l * 0.12)).setY(y).addScaledVector(n, 0.027);
        timber(surface, at.clone().add(new THREE.Vector3(0, -0.02, 0)), at.clone().add(new THREE.Vector3(0, 0.02, 0)), [0.006, 0.003], DARK, { ref: v3(n) });
      }
    }
    surface.addDisc(v3(dir.clone().multiplyScalar(0.06).setY(y).addScaledVector(side, 0.026)), v3(side), 0.012, { token: IRON, sides: 6, dome: 0.004 });
  }
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}
