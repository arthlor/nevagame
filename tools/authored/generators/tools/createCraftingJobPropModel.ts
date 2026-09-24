import * as THREE from "three";

import { SurfaceBuilder, addGripMarker, mulberry32, type AuthoredModel, type GeneratorContext, type Station, type V3 } from "../../kit";
import { lumps, rope, v3 } from "../props/parts";

/**
 * Crafting job props, held in the right hand while a craft runs, glTF space, the grip at the origin
 * (the runtime docks `tool_primary_grip`, whose frame is unchanged from the Blender props: the palm
 * beside a handle that runs along +Y).
 *
 * Redesigned from the Blender props (a floating spool beside chained rings, a box with a hammer
 * head, a box crossed by planks):
 * - `tailor`: tailor's shears held by their bows, the blades open on a length of teal cloth caught
 *   mid-cut. Palette: teal cloth, honey wood scales, forged iron.
 * - `toolmaking`: a cross-peen smith's hammer, an oval honey handle swelling to the butt, a forged
 *   head with a chamfered face and a wedge peen, brass bands. Palette: honey wood, iron, brass.
 * - `ready`: the finished work, wrapped in canvas with folded ends, bound in crossed leather straps
 *   with keepers, sealed in red wax and tagged. Palette: canvas, leather, red wax.
 */
export function createCraftingJobPropModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const style = String(context.parameters.style);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  addGripMarker("tool_primary_grip", [0.04, 0, 0], [0, 0, -1], [-1, 0, 0], root);
  const surface = new SurfaceBuilder(context.spec.palette);
  if (style === "tailor") tailorShears(surface);
  else if (style === "toolmaking") smithHammer(surface);
  else if (style === "ready") wrappedParcel(surface, context.seed);
  else throw new Error(`${ID}: unknown crafting prop style ${style}`);
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

function tailorShears(surface: SurfaceBuilder): void {
  const TEAL = 0;
  const WOOD = 1;
  const IRON = 2;
  const pivot = new THREE.Vector3(0, 0.13, 0);
  // Two blades crossing at the pivot, each opened a few degrees, one either side of the pivot plane.
  for (const side of [-1, 1]) {
    const open = side * 0.16;
    const dir = new THREE.Vector3(Math.sin(open), Math.cos(open), 0);
    const across = new THREE.Vector3(-dir.y, dir.x, 0);
    const z = side * 0.0045;
    // The blade: u from the pivot to the point, v from the back to the honed inner edge.
    surface.addPanel({
      cols: 8, rows: 2,
      thickness: (_, v) => THREE.MathUtils.lerp(0.006, 0.002, v),
      point: (u, v) => {
        const length = 0.26 * u;
        const back = 0.027 * (1 - u ** 1.35) + 0.002;
        return pivot.clone().addScaledVector(dir, length - 0.02)
          .addScaledVector(across, -side * (back - (back + 0.004) * v * (1 - 0.3 * u)))
          .setZ(z);
      },
      token: () => IRON,
      shade: (_, v) => (v > 0.5 ? 1.04 : 0.94),
      tone: (u) => 0.86 + 0.16 * u
    });
    // The shank crosses the pivot to the far side and bends out to its bow; wooden scales on the
    // grip, iron bows.
    const h = -side;
    const shank = [
      pivot.clone().addScaledVector(dir, 0.01).setZ(z),
      new THREE.Vector3(h * 0.012, 0.07, z),
      new THREE.Vector3(h * 0.03, 0.02, z)
    ];
    rope(surface, shank, 0.008, IRON, { sides: 6, shade: 0.9 });
    surface.addLoft([
      { p: [h * 0.007, 0.105, z], w: 0.011, h: 0.011 },
      { p: [h * 0.014, 0.068, z], w: 0.013, h: 0.013 },
      { p: [h * 0.026, 0.032, z], w: 0.012, h: 0.012 }
    ], { sides: 7, ref: [0, 0, 1], capStart: 0.3, capEnd: 0.3, token: WOOD });
    // Bows: a small thumb loop on one side, a long finger bow on the other, bound in teal tape.
    const [rx, ry, cx] = h < 0 ? [0.026, 0.028, -0.034] : [0.03, 0.05, 0.036];
    const cy = 0.02 - ry;
    const bow = Array.from({ length: 13 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 2;
      return new THREE.Vector3(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z);
    });
    rope(surface, bow, 0.0075, IRON, { sides: 5, caps: false, shade: 0.88 });
    rope(surface, bow.slice(3, 8), 0.0105, TEAL, { sides: 6 });
  }
  // Pivot screw, domed both faces.
  for (const face of [-1, 1]) surface.addDisc([pivot.x, pivot.y, face * 0.0105], [0, 0, face], 0.01, { token: IRON, sides: 8, dome: 0.004, shade: 1.02 });

  // A length of teal cloth caught in the jaws mid-cut: it lies across the blades' plane, its cut
  // edge in the crotch of the open blades, drooping down both faces of the shears in soft folds.
  surface.addPanel({
    cols: 10, rows: 4, thickness: 0.004,
    point: (u, v) => {
      const across = (u - 0.5) * 2;
      const top = 0.3 - 0.035 * across * across;
      return new THREE.Vector3(0.012 * Math.sin(u * Math.PI * 4) * (0.3 + v), top - v * 0.13, across * 0.075 * (1 - 0.15 * v));
    },
    token: () => TEAL,
    shade: (u) => 0.9 + 0.1 * Math.abs(Math.sin(u * Math.PI * 4)),
    tone: (_, v) => 1 - 0.1 * v
  });
}

function smithHammer(surface: SurfaceBuilder): void {
  const WOOD = 0;
  const IRON = 1;
  const BRASS = 2;
  // Oval handle, the long axis in the strike plane (X): a flared butt, a slim throat, a swell at the eye.
  const handle: ReadonlyArray<readonly [number, number, number]> = [
    [-0.135, 0.02, 0.016], [-0.128, 0.029, 0.021], [-0.1, 0.027, 0.02], [0.05, 0.023, 0.017], [0.2, 0.019, 0.0145],
    [0.33, 0.018, 0.014], [0.4, 0.021, 0.016], [0.46, 0.022, 0.017]
  ];
  surface.addLoft(handle.map(([y, w, h]): Station => ({ p: [0, y, 0], w: h, h: w })), {
    sides: 10, ref: [1, 0, 0], capStart: 0.3, token: WOOD,
    tone: (p) => 0.86 + 0.14 * Math.sin(p.y * 55 + p.x * 90) ** 2
  });
  // Brass butt cap and a band below the head.
  surface.addLoft([[-0.14, 0.018], [-0.137, 0.029], [-0.124, 0.03], [-0.119, 0.027]].map(([y, r]): Station => ({ p: [0, y, 0], w: r * 0.74, h: r })),
    { sides: 10, ref: [1, 0, 0], capStart: 0.4, token: BRASS });
  for (const y of [0.355, 0.375]) {
    surface.addLoft([[y - 0.006, 0.019], [y, 0.022], [y + 0.006, 0.019]].map(([yy, r]): Station => ({ p: [0, yy, 0], w: r * 0.76, h: r })),
      { sides: 10, ref: [1, 0, 0], token: BRASS, shade: 0.94 });
  }
  // Head along X: a chamfered striking face at -X, the eye cheeks, a cross peen tapering to a wedge at +X.
  const head: ReadonlyArray<readonly [number, number, number, number]> = [
    [-0.13, 0.03, 0.03, 8], [-0.124, 0.036, 0.036, 6], [-0.1, 0.035, 0.035, 5], [-0.075, 0.029, 0.03, 4],
    [-0.03, 0.033, 0.036, 4], [0.03, 0.033, 0.036, 4], [0.07, 0.03, 0.028, 4], [0.12, 0.033, 0.013, 4], [0.155, 0.034, 0.004, 4]
  ];
  surface.addLoft(head.map(([x, w, h, n]): Station => ({ p: [x, 0.47, 0], w, h, n })), {
    sides: 12, ref: [0, 1, 0], capStart: 0.02, capEnd: 0.02, token: IRON, flat: true,
    shade: ({ u }) => (u < 1.2 ? 1.04 : u > 7.4 ? 1.02 : 0.9)
  });
  // Wedge driven into the eye, standing proud of the head's crown.
  surface.addBox([0, 0.5, 0], [0, 0.512, 0], [0.012, 0.004], { ref: [1, 0, 0], token: IRON, shade: 0.8 });
}

function wrappedParcel(surface: SurfaceBuilder, seed: number): void {
  const CANVAS = 0;
  const LEATHER = 1;
  const RED = 2;
  const random = mulberry32(seed);
  const centre = new THREE.Vector3(0.1, 0.155, 0);
  const half = new THREE.Vector3(0.18, 0.135, 0.11);
  const at = (x: number, y: number, z: number): V3 => [centre.x + x, centre.y + y, centre.z + z];
  // The parcel: a soft-cornered block along X, slightly pillowed, its ends gathered.
  const stations: Station[] = [-1, -0.94, -0.7, 0, 0.7, 0.94, 1].map((t) => {
    const k = Math.abs(t) > 0.9 ? 0.86 : Math.abs(t) > 0.6 ? 0.99 : 1.02;
    return { p: at(t * half.x, 0, 0), w: half.z * k, h: half.y * k, n: 4.2 };
  });
  surface.addLoft(stations, {
    sides: 16, ref: [0, 1, 0], capStart: 0.08, capEnd: 0.08, token: CANVAS,
    tone: (p) => 0.9 + 0.12 * THREE.MathUtils.clamp((p.y - centre.y + half.y) / (2 * half.y), 0, 1),
    shade: ({ u }) => (u < 1 || u > 5 ? 0.9 : 1)
  });
  // Folded end flaps: two triangles tucked over each end.
  for (const end of [-1, 1]) {
    const x = centre.x + end * (half.x + 0.004);
    for (const up of [-1, 1]) {
      surface.addPanel({
        cols: 2, rows: 2, thickness: 0.004,
        point: (u, v) => {
          const width = (1 - v) * half.z * 0.7;
          return new THREE.Vector3(x + end * 0.006 * v, centre.y + up * half.y * 0.72 * (1 - v * 0.95), (u - 0.5) * 2 * width);
        },
        token: () => CANVAS, shade: () => (up > 0 ? 0.96 : 0.84)
      });
    }
  }
  // Crossed leather straps with keepers: one round the girth, one along the length.
  const girth = (x: number, grow: number): THREE.Vector3[] => Array.from({ length: 17 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const r = 1 / Math.pow(Math.abs(c) ** 4.2 + Math.abs(s) ** 4.2, 1 / 4.2);
    return new THREE.Vector3(centre.x + x, centre.y + s * r * (half.y + grow), c * r * (half.z + grow));
  });
  const strap = (points: THREE.Vector3[], ref: V3): void => {
    surface.addLoft(points.map((p) => ({ p: v3(p), w: 0.022, h: 0.004 })), { sides: 4, phase: Math.PI / 4, ref, capStart: 0, capEnd: 0, token: LEATHER });
  };
  strap(girth(0.02, 0.006), [1, 0, 0]);
  const length = Array.from({ length: 17 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const r = 1 / Math.pow(Math.abs(c) ** 4.2 + Math.abs(s) ** 4.2, 1 / 4.2);
    return new THREE.Vector3(centre.x + c * r * (half.x * 0.97 + 0.004), centre.y + s * r * (half.y + 0.009), 0);
  });
  strap(length, [0, 0, 1]);
  // Keepers where the tails tuck, and a stitched strap end.
  surface.addBox(at(0.02, half.y + 0.012, 0.05), at(0.02, half.y + 0.012, 0.075), [0.016, 0.006], { ref: [0, 1, 0], token: LEATHER, shade: 0.84 });
  surface.addBox(at(0.02, -half.y * 0.2, half.z + 0.012), at(0.02, -half.y * 0.2 - 0.03, half.z + 0.012), [0.014, 0.005], { ref: [0, 0, 1], token: LEATHER, shade: 0.84 });
  // Red wax seal where the straps cross: a lumpy pool with a stamped boss.
  surface.addLoft([[0, 0.034], [0.005, 0.036], [0.01, 0.028], [0.012, 0.018]].map(([dy, r]): Station => ({ p: at(0.02, half.y + 0.01 + dy, 0), w: r, h: r })), {
    sides: 11, ref: [0, 0, 1], capStart: 0, capEnd: 0.3, token: RED, radial: lumps(seed, 0.12)
  });
  surface.addDisc(at(0.02, half.y + 0.024, 0), [0, 1, 0], 0.011, { token: RED, sides: 8, shade: 0.8 });
  // A canvas label on a thong from the girth strap.
  const hang = new THREE.Vector3(...at(0.02, -0.02, half.z + 0.008));
  const tag = hang.clone().add(new THREE.Vector3(0.05, -0.1, 0.02));
  rope(surface, [hang, hang.clone().lerp(tag, 0.5).add(new THREE.Vector3(0, -0.01, 0.004)), tag], 0.003, LEATHER, { sides: 3 });
  surface.addBox(v3(tag.clone().add(new THREE.Vector3(0.02, 0.004, 0))), v3(tag.clone().add(new THREE.Vector3(0.02, -0.05, 0.006))), [0.03, 0.0025],
    { ref: [0, 0, 1], token: CANVAS, shade: 0.94 + random() * 0.04 });
}
