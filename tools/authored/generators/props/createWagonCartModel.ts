import * as THREE from "three";

import { SurfaceBuilder, addCollisionMarkers, mulberry32, type AuthoredModel, type GeneratorContext } from "../../kit";
import { catenary, rope, sack, timber, wheel } from "./parts";

// Catalog palette order: honey planks and spokes, dark frame and iron, burlap sacks, cream rope.
const TOKENS = ["wood_honey_01", "wood_dark_01", "burlap_grain_01", "canvas_cream_01"] as const;
const HONEY = 0;
const DARK = 1;
const BURLAP = 2;
const ROPE = 3;

/**
 * Two-wheel farm cart, glTF space: +Y up, ground-centred, the shafts forward along +Z, metres.
 *
 * Redesigned from the Blender cart: two tall wheels with felloes, iron tyres, turned hubs and twelve
 * tapered spokes sit on a real axle under a planked bed; the sides are stake-and-rail with daylight
 * between the rails and a drop tailboard; the shafts run forward to a crossbar and rest on a prop
 * stick, as a parked cart does; seven sacks are heaped in the bed under two crossed ropes.
 */
export function createWagonCartModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const p = context.parameters;
  const random = mulberry32(context.seed);
  const length = Number(p.length ?? 2.6);
  const width = Number(p.width ?? 1.4);
  const height = Number(p.height ?? 1.2);

  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);

  const wheelR = Math.min(0.62, height * 0.52);
  const axleZ = -length * 0.08;
  const bedY = wheelR + 0.1;
  const bedHalf = [width / 2, length * 0.42] as const;
  const bedZ = -length * 0.05;

  // Wheels and axle.
  for (const side of [-1, 1]) {
    wheel(surface, [side * (width / 2 + 0.12), wheelR, axleZ], wheelR, 0.075, 12, { rim: DARK, spoke: HONEY, hub: HONEY, tyre: DARK });
  }
  timber(surface, [-(width / 2 + 0.2), wheelR, axleZ], [width / 2 + 0.2, wheelR, axleZ], [0.05, 0.05], DARK, { ref: [0, 1, 0] });

  // Bed frame: two sills, a floor of planks across them, a front board.
  for (const side of [-1, 1]) {
    timber(surface, [side * bedHalf[0] * 0.62, bedY - 0.08, bedZ - bedHalf[1]], [side * bedHalf[0] * 0.62, bedY - 0.08, bedZ + bedHalf[1]], [0.06, 0.06], DARK, { ref: [0, 1, 0] });
  }
  const boards = 9;
  for (let b = 0; b < boards; b += 1) {
    const z = bedZ - bedHalf[1] + ((bedHalf[1] * 2) / boards) * (b + 0.5);
    timber(surface, [-bedHalf[0], bedY, z], [bedHalf[0], bedY, z], [bedHalf[1] / boards - 0.006, 0.025], HONEY,
      { ref: [0, 1, 0], shade: 0.86 + random() * 0.16, bevel: 0.008 });
  }
  // Stake-and-rail sides.
  const stakes = 5;
  for (const side of [-1, 1]) {
    const x = side * (bedHalf[0] - 0.03);
    for (let s = 0; s < stakes; s += 1) {
      const z = bedZ - bedHalf[1] + 0.06 + ((bedHalf[1] * 2 - 0.12) / (stakes - 1)) * s;
      timber(surface, [x * 1.02, bedY - 0.1, z], [x * 1.06, bedY + 0.5, z], [0.032, 0.032], DARK, { ref: [0, 0, 1], bevel: 0.008 });
    }
    for (const y of [0.2, 0.44]) {
      timber(surface, [x * (1 + y * 0.1) + side * 0.03, bedY + y, bedZ - bedHalf[1] - 0.02], [x * (1 + y * 0.1) + side * 0.03, bedY + y, bedZ + bedHalf[1] + 0.02],
        [0.022, 0.05], HONEY, { ref: [0, 1, 0], shade: 0.9 + random() * 0.1 });
    }
  }
  timber(surface, [-bedHalf[0], bedY + 0.24, bedZ + bedHalf[1] + 0.02], [bedHalf[0], bedY + 0.24, bedZ + bedHalf[1] + 0.02], [0.03, 0.22], HONEY, { ref: [0, 1, 0], shade: 0.95 });
  timber(surface, [-bedHalf[0], bedY + 0.16, bedZ - bedHalf[1] - 0.02], [bedHalf[0], bedY + 0.16, bedZ - bedHalf[1] - 0.02], [0.03, 0.14], DARK, { ref: [0, 1, 0] });

  // Shafts forward to a crossbar, resting on a prop stick.
  const tipZ = bedZ + bedHalf[1] + length * 0.55;
  const tipY = 0.55;
  for (const side of [-1, 1]) {
    timber(surface, [side * bedHalf[0] * 0.62, bedY - 0.06, bedZ - bedHalf[1] * 0.4], [side * width * 0.24, tipY, tipZ], [0.04, 0.045], HONEY,
      { halfEnd: [0.03, 0.034], bevel: 0.01 });
  }
  timber(surface, [-width * 0.26, tipY - 0.04, tipZ - 0.25], [width * 0.26, tipY - 0.03, tipZ - 0.25], [0.035, 0.035], DARK, { ref: [0, 1, 0] });
  rope(surface, [[0, 0, tipZ - 0.3], [0, tipY - 0.07, tipZ - 0.25]], 0.028, DARK, { sides: 6 });

  // Sacks heaped in the bed.
  const load: Array<readonly [number, number, number, number]> = [
    [-0.28, 0, -0.35, 0.2], [0.28, 0, -0.3, -0.3], [-0.26, 0, 0.3, 0.5], [0.27, 0, 0.35, -0.2],
    [0, 0.26, -0.05, 0.9], [-0.15, 0.24, 0.45, 0.1], [0.14, 0.24, -0.5, -0.6]
  ];
  for (const [x, lift, z, yaw] of load) {
    sack(surface, [x * width * 1.1, bedY + 0.025 + lift, bedZ + z * length * 0.5], [0.44, 0.34, 0.42 - lift * 0.3], BURLAP, ROPE,
      { seed: Math.floor(random() * 100), yaw, lean: (random() - 0.5) * 0.3 });
  }
  // Two tie-down ropes crossing the load.
  const ropeY = bedY + 0.62;
  rope(surface, catenary([-bedHalf[0] - 0.05, bedY + 0.44, bedZ - 0.4], [bedHalf[0] + 0.05, bedY + 0.44, bedZ + 0.5], -0.22, 10), 0.016, ROPE, { sides: 5 });
  rope(surface, catenary([bedHalf[0] + 0.05, bedY + 0.44, bedZ - 0.45], [-bedHalf[0] - 0.05, bedY + 0.44, bedZ + 0.45], -(ropeY - bedY - 0.44 + 0.02), 10), 0.016, ROPE, { sides: 5 });

  root.add(surface.buildMesh(`${ID}_mesh`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}
