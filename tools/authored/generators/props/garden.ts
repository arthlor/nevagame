import * as THREE from "three";

import { SurfaceBuilder, mulberry32, type AuthoredModel, type GeneratorContext, type Station } from "../../kit";
import { lumps, rope, timber, v3 } from "./parts";

/**
 * Garden props: potting bench, rustic watering can, garden hoe, beehive. glTF space: +Y up,
 * ground-centred, the working face toward +Z, metres.
 */

/** A tapered clay pot on `base`, optionally holding a seedling. */
function pot(surface: SurfaceBuilder, base: THREE.Vector3, r: number, clay: number, soil: number, leaf: number, random: () => number): void {
  surface.addLoft([
    { p: v3(base), w: r * 0.72, h: r * 0.72 },
    { p: v3(base.clone().add(new THREE.Vector3(0, r * 1.1, 0))), w: r * 0.95, h: r * 0.95 },
    { p: v3(base.clone().add(new THREE.Vector3(0, r * 1.12, 0))), w: r * 1.1, h: r * 1.1 },
    { p: v3(base.clone().add(new THREE.Vector3(0, r * 1.32, 0))), w: r * 1.1, h: r * 1.1 }
  ], { sides: 10, ref: [0, 0, 1], capStart: 0, token: clay, tone: (q) => 0.86 + 0.14 * THREE.MathUtils.clamp((q.y - base.y) / (r * 1.3), 0, 1) });
  surface.addDisc(v3(base.clone().add(new THREE.Vector3(0, r * 1.22, 0))), [0, 1, 0], r * 0.98, { token: soil, sides: 10 });
  for (let k = 0; k < 4; k += 1) {
    const a = k * 1.7 + random();
    const stem = base.clone().add(new THREE.Vector3(0, r * 1.22, 0));
    const tip = stem.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.9, r * (1 + random() * 0.8), Math.sin(a) * r * 0.9));
    surface.addPanel({
      cols: 3, rows: 1, thickness: 0.004,
      point: (u, v) => stem.clone().lerp(tip, u).add(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar((v - 0.5) * r * 0.6 * Math.sin(Math.PI * u))),
      token: () => leaf, shade: (u) => 0.9 + 0.12 * u
    });
  }
}

/**
 * Potting bench. Redesigned from the Blender bench: a slatted top on splayed legs with a lower shelf,
 * a back rail carrying a shelf of seedlings in clay pots, a heap of damp potting soil with a trowel
 * in it, and stacked empty pots on the shelf below.
 */
export function createPottingBenchModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: warm boards, dark frame, damp soil, sage leaves, terracotta pots.
  const surface = new SurfaceBuilder(context.spec.palette);
  const WOOD = 0;
  const DARK = 1;
  const SOIL = 2;
  const LEAF = 3;
  const CLAY = 4;
  const w = 1.4;
  const d = 0.52;
  const top = 0.78;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    timber(surface, [x * (w / 2 - 0.05) * 1.02, 0, z * (d / 2 - 0.04) * 1.04], [x * (w / 2 - 0.05), z < 0 ? 1.18 : top - 0.03, z * (d / 2 - 0.04)], [0.035, 0.035], DARK, { ref: [0, 0, 1] });
  }
  for (let k = 0; k < 5; k += 1) {
    const z = -d / 2 + (d / 5) * (k + 0.5);
    timber(surface, [-w / 2, top, z], [w / 2, top, z], [d / 10 - 0.008, 0.018], WOOD, { ref: [0, 1, 0], shade: 0.86 + random() * 0.16, bevel: 0.006 });
  }
  for (let k = 0; k < 3; k += 1) {
    const z = -d / 2 + 0.06 + k * 0.18;
    timber(surface, [-w / 2 + 0.04, 0.2, z], [w / 2 - 0.04, 0.2, z], [0.07, 0.016], WOOD, { ref: [0, 1, 0], shade: 0.86 + random() * 0.16 });
  }
  // Back rail and seedling shelf.
  timber(surface, [-w / 2, 1.14, -d / 2 + 0.04], [w / 2, 1.14, -d / 2 + 0.04], [0.02, 0.05], DARK, { ref: [0, 1, 0] });
  timber(surface, [-w / 2 + 0.04, 1.02, -d / 2 + 0.1], [w / 2 - 0.04, 1.02, -d / 2 + 0.1], [0.08, 0.015], WOOD, { ref: [0, 1, 0] });
  for (let k = 0; k < 5; k += 1) {
    pot(surface, new THREE.Vector3(-w / 2 + 0.16 + k * 0.27, 1.035, -d / 2 + 0.1), 0.05 + random() * 0.01, CLAY, SOIL, LEAF, random);
  }
  // Soil heap with a trowel, and a pot being filled.
  surface.addEllipsoid([0.28, top + 0.03, 0.02], [0.22, 0.09, 0.16], { token: SOIL, sides: 8, shade: 0.9 });
  rope(surface, [[0.4, top + 0.06, 0.05], [0.52, top + 0.15, 0.1]], 0.014, WOOD, { sides: 5 });
  timber(surface, [0.38, top + 0.04, 0.04], [0.3, top + 0.02, 0.02], [0.03, 0.004], DARK, { ref: [0, 1, 0], halfEnd: [0.012, 0.003] });
  pot(surface, new THREE.Vector3(-0.3, top + 0.018, 0.05), 0.08, CLAY, SOIL, LEAF, random);
  // Stacked empty pots on the lower shelf.
  for (let k = 0; k < 3; k += 1) {
    surface.addLoft([
      { p: [-0.4, 0.22 + k * 0.035, 0], w: 0.07, h: 0.07 }, { p: [-0.4, 0.33 + k * 0.035, 0], w: 0.095, h: 0.095 }
    ], { sides: 10, ref: [0, 0, 1], capStart: 0, token: CLAY, shade: 0.94 - k * 0.04 });
  }
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/**
 * Rustic watering can. Redesigned from the Blender can: an oval iron drum on a rolled foot, brass
 * beads at the foot and shoulder, a wooden grip on an arched iron handle over the top, and a long
 * spout forward (+Z) ending in a brass rose.
 */
export function createRusticWateringCanModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: iron, brass, warm wood.
  const surface = new SurfaceBuilder(context.spec.palette);
  const IRON = 0;
  const BRASS = 1;
  const WOOD = 2;
  const body: ReadonlyArray<readonly [number, number]> = [[0, 0.07], [0.012, 0.078], [0.2, 0.082], [0.232, 0.07], [0.25, 0.045]];
  surface.addLoft(body.map(([y, r]): Station => ({ p: [0, y, -0.05], w: r * 0.85, h: r * 1.25, n: 2.4 })), {
    sides: 14, ref: [0, 0, 1], capStart: 0, capEnd: 0, token: IRON, tone: (q) => 0.86 + 0.16 * THREE.MathUtils.clamp(q.y / 0.22, 0, 1)
  });
  for (const [y, r] of [[0.012, 0.08], [0.22, 0.078]] as const) {
    surface.addLoft([{ p: [0, y - 0.006, -0.05], w: r * 0.84, h: r * 1.24 }, { p: [0, y, -0.05], w: r * 0.9, h: r * 1.3 }, { p: [0, y + 0.006, -0.05], w: r * 0.84, h: r * 1.24 }],
      { sides: 14, ref: [0, 0, 1], capStart: 0, capEnd: 0, token: BRASS });
  }
  surface.addDisc([0, 0.25, -0.05], [0, 1, 0], [0.056, 0.038], { token: IRON, sides: 10, shade: 0.72, up: [0, 0, 1] });
  const arch = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * Math.PI;
    return new THREE.Vector3(0, 0.24 + Math.sin(a) * 0.09, -0.05 - Math.cos(a) * 0.09);
  });
  rope(surface, arch, 0.008, IRON, { sides: 5 });
  rope(surface, [arch[3], arch[5]], 0.015, WOOD, { sides: 6 });
  const spout = [new THREE.Vector3(0, 0.04, 0.03), new THREE.Vector3(0, 0.16, 0.15), new THREE.Vector3(0, 0.25, 0.25)];
  rope(surface, spout, 0.018, IRON, { sides: 7, taper: [1, 0.6], caps: false });
  const dir = spout[2].clone().sub(spout[1]).normalize();
  surface.addLoft([
    { p: v3(spout[2]), w: 0.012, h: 0.012 }, { p: v3(spout[2].clone().addScaledVector(dir, 0.03)), w: 0.024, h: 0.024 },
    { p: v3(spout[2].clone().addScaledVector(dir, 0.05)), w: 0.038, h: 0.038 }
  ], { sides: 10, ref: [1, 0, 0], capEnd: 0.1, token: BRASS });
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/**
 * Garden hoe. Redesigned from the Blender hoe: a long ash handle stands upright on the ground on its
 * forged blade (a broad, thin-edged plate on a swan neck and socket), with a leather grip wrap and a
 * hanging loop near the top.
 */
export function createGardenHoeModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: warm wood, iron, leather.
  const surface = new SurfaceBuilder(context.spec.palette);
  const WOOD = 0;
  const IRON = 1;
  const LEATHER = 2;
  const foot = new THREE.Vector3(0, 0.14, 0);
  const head = new THREE.Vector3(0.04, 1.46, -0.02);
  rope(surface, [foot, head], 0.02, WOOD, { sides: 7, taper: [1, 0.85], tone: (q) => 0.9 + 0.1 * Math.sin(q.y * 9) ** 2 });
  const along = head.clone().sub(foot).normalize();
  rope(surface, [foot.clone().addScaledVector(along, 1.02), foot.clone().addScaledVector(along, 1.2)], 0.024, LEATHER, { sides: 7 });
  rope(surface, Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return head.clone().add(new THREE.Vector3(Math.sin(a) * 0.03, Math.cos(a) * 0.05 - 0.02, 0));
  }), 0.006, LEATHER, { sides: 4, caps: false });
  // Socket, swan neck, blade resting on the ground.
  surface.addLoft([{ p: v3(foot.clone().addScaledVector(along, 0.1)), w: 0.022, h: 0.022 }, { p: v3(foot), w: 0.026, h: 0.026 }],
    { sides: 7, ref: [1, 0, 0], capEnd: 0.3, token: IRON });
  rope(surface, [foot, new THREE.Vector3(0, 0.06, 0.05), new THREE.Vector3(0, 0.03, 0.12)], 0.01, IRON, { sides: 5 });
  surface.addPanel({
    cols: 4, rows: 2, thickness: 0.006,
    point: (u, v) => new THREE.Vector3((u - 0.5) * 0.16, 0.005 + 0.13 * (1 - v) * 0.3, 0.12 + v * 0.1),
    token: () => IRON, shade: (_, v) => (v > 0.5 ? 1.04 : 0.9)
  });
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/**
 * Beehive. Redesigned from the Blender hive: a stand on four legs carries a floor with a landing
 * board, two brood boxes and a shallow super, each its own tone with carved handholds, under a
 * telescoping lid roofed with turf; the entrance slot faces +Z and a stone weights the lid.
 */
export function createApiaryHiveModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: honey boxes, warm boxes and stand, turf, dark iron and slot.
  const surface = new SurfaceBuilder(context.spec.palette);
  const HONEY = 0;
  const WARM = 1;
  const TURF = 2;
  const DARK = 3;
  const hw = 0.2;
  const hd = 0.24;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    timber(surface, [x * (hw - 0.02) * 1.1, 0, z * (hd - 0.02) * 1.1], [x * (hw - 0.02), 0.2, z * (hd - 0.02)], [0.025, 0.025], WARM, { ref: [0, 0, 1] });
  }
  timber(surface, [0, 0.21, -hd], [0, 0.21, hd + 0.05], [hw + 0.01, 0.018], WARM, { ref: [0, 1, 0] });
  const landing = new THREE.Vector3(0, 0.2, hd + 0.09);
  timber(surface, landing.clone().add(new THREE.Vector3(-hw + 0.02, 0, 0)), landing.clone().add(new THREE.Vector3(hw - 0.02, 0, 0)), [0.06, 0.012], HONEY,
    { ref: [0, 1, 0.3], shade: 1.02 });
  let y = 0.23;
  for (const [h, token] of [[0.2, HONEY], [0.2, WARM], [0.12, HONEY]] as const) {
    timber(surface, [0, y + h / 2, -hd], [0, y + h / 2, hd], [hw, h / 2 - 0.004], token, { ref: [0, 1, 0], bevel: 0.008, shade: 0.9 + random() * 0.1 });
    for (const side of [-1, 1]) {
      surface.addDisc([side * (hw + 0.001), y + h * 0.62, 0], [side, 0, 0], [0.018, 0.05], { token: DARK, sides: 6, shade: 0.8, up: [0, 1, 0] });
    }
    y += h;
  }
  timber(surface, [-hw * 0.6, 0.245, hd + 0.001], [hw * 0.6, 0.245, hd + 0.001], [0.006, 0.012], DARK, { ref: [0, 1, 0], shade: 0.72 });
  // Telescoping lid, turf roof and a stone weight.
  timber(surface, [0, y + 0.04, -hd - 0.03], [0, y + 0.04, hd + 0.03], [hw + 0.03, 0.04], WARM, { ref: [0, 1, 0], bevel: 0.01 });
  surface.addPanel({
    cols: 6, rows: 6, thickness: 0.035,
    point: (u, v) => new THREE.Vector3((u - 0.5) * (hw + 0.04) * 2, y + 0.1 + 0.012 * Math.sin(u * 11 + v * 7), (v - 0.5) * (hd + 0.05) * 2),
    token: () => TURF, shade: () => 0.88 + random() * 0.16
  });
  const stone: Station[] = [0, 0.5, 1].map((t) => ({ p: [0.04, y + 0.13 + t * 0.07, 0.02], w: [0.07, 0.08, 0.05][t * 2], h: [0.06, 0.07, 0.04][t * 2] }));
  surface.addLoft(stone, { sides: 6, ref: [0, 0, 1], capStart: 0.3, capEnd: 0.5, radial: lumps(5, 0.12), token: DARK, shade: 1.02 });
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

