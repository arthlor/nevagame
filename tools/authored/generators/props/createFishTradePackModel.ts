import * as THREE from "three";

import {
  SurfaceBuilder, assembleLodLevels, mulberry32,
  type AuthoredModel, type CatalogAssetSpec, type GeneratorContext, type V3
} from "../../kit";
import { buildFishSurface } from "../fish/createFishModel";
import { catenary, net, rope, timber } from "./parts";

/**
 * Fish trade pack, glTF space: +Y up, ground-centred, the harness side toward -Z (against the
 * wearer's back: the runtime's back socket turns the pack to face away) and the painted cloth toward
 * +Z, metres.
 *
 * Redesigned from the Blender pack: a timber carrier on two runners, tall rear posts braced to a
 * harness of padded canvas and leather straps with brass buckles, a planked basket lined with canvas
 * rolled over its rim, a painted front cloth with a pointed hem, stripes and a shipping seal, rope
 * lashings at the joints and a net pocket with cork floats; the catch is the authored fish itself
 * (`buildFishSurface`, the same species table the swimming fish use), laid across a bed of ice. LOD1
 * builds the same carrier and catch with less detail.
 */
export function createFishTradePackModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const p = context.parameters;
  const tokens = spec.palette;
  const index = (name: string): number => {
    const i = tokens.indexOf(name);
    if (i < 0) throw new Error(`${ID}: palette lacks ${name}`);
    return i;
  };
  const HONEY = index("wood_honey_01");
  const DARK = index("wood_dark_01");
  const CANVAS = index("canvas_cream_01");
  const ROPE = index("burlap_grain_01");
  const LEATHER = index("leather_harness_01");
  const BRASS = index("metal_brass_01");
  const STRIPE = index(String(p.stripeToken));
  const ICE = index(String(p.bellyToken));
  const w = Number(p.width ?? 0.76);
  const d = Number(p.depth ?? 0.52);
  const h = Number(p.frameHeight ?? 0.96);
  const rim = Number(p.basketHeight ?? 0.58);

  const root = new THREE.Group();
  root.name = `${ID}_root`;
  assembleLodLevels(spec, root, (level) => {
    const detail = level === 0;
    const random = mulberry32(context.seed);
    const group = new THREE.Group();
    const surface = new SurfaceBuilder(tokens);
    const back = -d * 0.43;
    const front = d * 0.43;

    // Runners, posts, floor.
    for (const side of [-1, 1]) {
      const x = side * w * 0.46;
      timber(surface, [x, 0.045, -d / 2 - 0.06], [x, 0.045, d / 2 + 0.06], [0.045, 0.045], DARK, { ref: [0, 1, 0], bevel: 0.012 });
      timber(surface, [x, 0.02, back], [x, h, back], [0.038, 0.038], HONEY, { ref: [0, 0, 1], bevel: 0.01 });
      timber(surface, [x, 0.02, front], [x, rim + 0.045, front], [0.038, 0.038], HONEY, { ref: [0, 0, 1], bevel: 0.01 });
    }
    const boards = detail ? 6 : 3;
    for (let k = 0; k < boards; k += 1) {
      const z = -d / 2 + 0.04 + ((d - 0.08) / boards) * (k + 0.5);
      timber(surface, [-w / 2 + 0.05, 0.13, z], [w / 2 - 0.05, 0.13, z], [(d - 0.08) / boards / 2 - 0.004, 0.02], k % 2 ? DARK : HONEY, { ref: [0, 1, 0], bevel: detail ? 0.005 : 0 });
    }
    // Basket walls: rows of boards with daylight between.
    const rows = detail ? 3 : 2;
    for (let r = 0; r < rows; r += 1) {
      const y = 0.2 + ((rim - 0.22) / rows) * (r + 0.5);
      const half = (rim - 0.22) / rows / 2 - 0.012;
      for (const z of [back, front]) {
        timber(surface, [-w * 0.46, y, z + Math.sign(z) * 0.02], [w * 0.46, y, z + Math.sign(z) * 0.02], [0.016, half], HONEY, { ref: [0, 1, 0], shade: 0.88 + random() * 0.14, bevel: detail ? 0.005 : 0 });
      }
      for (const x of [-w * 0.46, w * 0.46]) {
        timber(surface, [x + Math.sign(x) * 0.02, y, back], [x + Math.sign(x) * 0.02, y, front], [0.016, half], HONEY, { ref: [0, 1, 0], shade: 0.88 + random() * 0.14, bevel: detail ? 0.005 : 0 });
      }
    }
    // Canvas liner rolled over the rim, lashed below it.
    const perimeter = (y: number, grow = 0): THREE.Vector3[] => [
      new THREE.Vector3(-w * 0.46 - grow, y, back - grow), new THREE.Vector3(w * 0.46 + grow, y, back - grow),
      new THREE.Vector3(w * 0.46 + grow, y, front + grow), new THREE.Vector3(-w * 0.46 - grow, y, front + grow),
      new THREE.Vector3(-w * 0.46 - grow, y, back - grow)
    ];
    rope(surface, perimeter(rim, 0.02), 0.034, CANVAS, { sides: detail ? 8 : 5, caps: false });
    rope(surface, perimeter(rim - 0.06, 0.03), 0.014, ROPE, { sides: 5, caps: false });
    surface.addDisc([0, rim - 0.04, (back + front) / 2], [0, 1, 0], [d * 0.4, w * 0.44], { token: CANVAS, rect: true, up: [0, 0, 1], shade: 0.9 });

    // Painted front cloth with a pointed hem, stripes and a seal.
    const clothTop = rim - 0.01;
    surface.addPanel({
      cols: detail ? 10 : 5, rows: 2, thickness: 0.012,
      point: (u, v) => {
        const hem = 0.3 + 0.06 * (1 - Math.abs(u - 0.5) * 2);
        return new THREE.Vector3((u - 0.5) * w * 0.9, clothTop - v * hem, front + 0.05 + 0.012 * Math.sin(u * Math.PI * 5) * v);
      },
      token: (u) => (Math.abs(u - 0.24) < 0.04 || Math.abs(u - 0.76) < 0.04 ? STRIPE : CANVAS),
      shade: (u) => 0.94 + 0.08 * Math.abs(Math.sin(u * Math.PI * 5))
    });
    surface.addDisc([0, clothTop - 0.17, front + 0.068], [0, 0, 1], 0.06, { token: STRIPE, sides: detail ? 12 : 6, dome: 0.006 });
    if (detail) {
      for (let k = 0; k < 3; k += 1) {
        rope(surface, [[-0.035, clothTop - 0.15 - k * 0.018, front + 0.076], [0, clothTop - 0.16 - k * 0.018, front + 0.076], [0.035, clothTop - 0.15 - k * 0.018, front + 0.076]], 0.004, CANVAS, { sides: 3 });
      }
    }

    // Harness: crossbars, braces, padded back, leather straps with brass buckles.
    for (const y of [h * 0.31, h * 0.86]) {
      timber(surface, [-w / 2, y, back - 0.03], [w / 2, y, back - 0.03], [0.03, 0.038], DARK, { ref: [0, 1, 0], bevel: 0.008 });
    }
    for (const side of [-1, 1]) {
      timber(surface, [side * w * 0.42, h * 0.84, back - 0.02], [0, h * 0.53, back - 0.02], [0.018, 0.025], HONEY, { bevel: 0.005 });
    }
    surface.addLoft([
      { p: [0, h * 0.35, back - 0.07], w: w * 0.3, h: 0.035, n: 3 },
      { p: [0, h * 0.57, back - 0.08], w: w * 0.33, h: 0.04, n: 3 },
      { p: [0, h * 0.8, back - 0.07], w: w * 0.3, h: 0.035, n: 3 }
    ], { sides: detail ? 12 : 6, ref: [0, 0, 1], capStart: 0.4, capEnd: 0.4, token: CANVAS, shade: 0.96 });
    for (const side of [-1, 1]) {
      const x = side * w * 0.3;
      // The straps loop no further out than the wearer's back allows (the back socket fits to them).
      const strap = [[h * 0.86, back - 0.04], [h * 0.9, back - 0.15], [h * 0.72, back - 0.21], [h * 0.45, back - 0.21], [h * 0.24, back - 0.15], [h * 0.3, back - 0.04]]
        .map(([y, z]) => new THREE.Vector3(x, y, z));
      surface.addLoft(strap.map((q) => ({ p: [q.x, q.y, q.z] as V3, w: 0.04, h: 0.012 })), { sides: 4, phase: Math.PI / 4, ref: [1, 0, 0], capStart: 0, capEnd: 0, token: LEATHER });
      rope(surface, [[x - 0.035, h * 0.3, back - 0.165], [x + 0.035, h * 0.3, back - 0.165], [x + 0.035, h * 0.37, back - 0.185], [x - 0.035, h * 0.37, back - 0.185], [x - 0.035, h * 0.3, back - 0.165]], 0.006, BRASS, { sides: 4, caps: false });
    }
    // Rope lashings at the post joints.
    if (detail) {
      for (const x of [-w * 0.46, w * 0.46]) {
        for (const [z, y] of [[back, 0.14], [back, h - 0.12], [front, 0.14], [front, rim - 0.06]] as const) {
          rope(surface, Array.from({ length: 21 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return new THREE.Vector3(x + Math.cos(a) * 0.052, y + i * 0.0028, z + Math.sin(a) * 0.052);
          }), 0.01, ROPE, { sides: 4, caps: false });
        }
      }
      // Net pocket with cork floats on the right side.
      net(surface, (u, v) => new THREE.Vector3(w * 0.5 + 0.05 + 0.05 * Math.sin(Math.PI * v), rim - 0.04 - v * 0.34, (u - 0.5) * d * 0.6), [3, 3], ROPE, 0.008);
      for (const z of [-d * 0.16, d * 0.16]) {
        rope(surface, catenary([w * 0.48, rim - 0.02, z], [w * 0.56, rim - 0.18, z], 0.01, 3), 0.007, ROPE, { sides: 3 });
        surface.addLoft([[rim - 0.28, 0.018], [rim - 0.26, 0.032], [rim - 0.19, 0.032], [rim - 0.17, 0.018]].map(([y, r]) => ({ p: [w * 0.57, y, z] as V3, w: r, h: r })),
          { sides: 7, ref: [0, 0, 1], capStart: 0.3, capEnd: 0.3, token: CANVAS, shade: 0.9 });
      }
    }
    // Ice bed.
    for (let k = 0; k < (detail ? 16 : 6); k += 1) {
      const x = (random() - 0.5) * w * 0.74;
      const z = (random() - 0.5) * d * 0.6;
      surface.addEllipsoid([x, rim - 0.01, z], [0.042, 0.03, 0.034], { token: ICE, sides: 5, shade: 1.02 });
    }
    group.add(surface.buildMesh(`${ID}_carrier_${level}`));

    // The catch: the authored fish, laid across the ice leaning back against the harness.
    const fishSpec = {
      ...spec, id: `${ID}_catch`, palette: [String(p.backToken), String(p.bellyToken), String(p.accentToken)], animationClips: []
    } as CatalogAssetSpec;
    const { surface: fishSurface } = buildFishSurface({
      spec: fishSpec, seed: context.seed,
      parameters: {
        species: p.species, length: p.length, girth: p.girth, finScale: p.finScale, bodyDepth: p.bodyDepth, tailPeduncle: p.tailPeduncle,
        bodySegments: detail ? p.bodySegments : 10, radialSegments: detail ? p.radialSegments : 10
      }
    });
    const fish = fishSurface.buildMesh(`${ID}_catch_${level}`);
    fish.geometry.rotateY(Math.PI / 2);
    fish.geometry.rotateX(-0.2);
    fish.geometry.computeBoundingBox();
    const box = fish.geometry.boundingBox!;
    // Resting on the ice, not sunk into the rolled rim.
    fish.geometry.translate(-(box.min.x + box.max.x) / 2, rim + 0.015 - box.min.y, -d * 0.05 - (box.min.z + box.max.z) / 2);
    group.add(fish);
    return group;
  });
  return { root, clips: [] };
}
