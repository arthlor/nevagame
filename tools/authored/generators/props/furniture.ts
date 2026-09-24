import * as THREE from "three";

import { SurfaceBuilder, addCollisionMarkers, mulberry32, type AuthoredModel, type GeneratorContext, type Station, type V3 } from "../../kit";
import { rope, timber, v3 } from "./parts";

/**
 * Furniture: the cozy bed and armchair (interiors), the park bench and the picnic table. glTF space:
 * +Y up, ground-centred, the front (the side you sit or climb in from) toward +Z, metres.
 */

/** A soft upholstered block: a superellipse loft with rounded, slightly domed ends. */
function cushion(surface: SurfaceBuilder, from: V3, to: V3, w: number, h: number, token: number, options: { ref?: V3; n?: number; shade?: number; puff?: number } = {}): void {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const stations: Station[] = [0, 0.08, 0.5, 0.92, 1].map((t, i) => {
    const k = [0.86, 0.98, 1 + (options.puff ?? 0.04), 0.98, 0.86][i];
    return { p: v3(a.clone().lerp(b, t)), w: w * k, h: h * k, n: options.n ?? 3 };
  });
  surface.addLoft(stations, { sides: 12, ref: options.ref ?? [0, 1, 0], capStart: 0.3, capEnd: 0.3, token, shade: options.shade });
}

/**
 * Cozy bed. Redesigned from the Blender bed: a honey-wood frame with a tall paneled headboard and
 * turned finials, a lower footboard and side rails on stout feet; a plump mattress; a patchwork quilt
 * of terracotta and cream squares that drapes over the sides in soft folds; two puffy pillows and a
 * folded blanket at the foot.
 */
export function createCozyBedModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const s = Number(context.parameters.scale ?? 1);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: honey frame, cream linen, terracotta quilt, dark trim.
  const surface = new SurfaceBuilder(spec.palette);
  const WOOD = 0;
  const LINEN = 1;
  const QUILT = 2;
  const DARK = 3;
  const w = 1.5 * s;
  const len = 2.05 * s;
  const hx = w / 2;
  const hz = len / 2;
  const deck = 0.42 * s;

  // Posts with finials: tall at the head (-Z), shorter at the foot.
  for (const [x, z, top] of [[-hx, -hz, 1.18], [hx, -hz, 1.18], [-hx, hz, 0.78], [hx, hz, 0.78]] as const) {
    timber(surface, [x, 0, z], [x, top * s, z], [0.055 * s, 0.055 * s], WOOD, { ref: [0, 0, 1], bevel: 0.012 });
    surface.addLoft([[top, 0.05], [top + 0.03, 0.06], [top + 0.07, 0.035], [top + 0.11, 0.045], [top + 0.14, 0.012]].map(([y, r]): Station =>
      ({ p: [x, y * s, z], w: r * s, h: r * s })), { sides: 8, ref: [0, 0, 1], capEnd: 0.4, token: WOOD, shade: 1.02 });
  }
  // Headboard: frame and three raised panels; footboard: a board with a rail.
  timber(surface, [-hx, 1.06 * s, -hz], [hx, 1.06 * s, -hz], [0.035 * s, 0.05 * s], WOOD, { ref: [0, 1, 0], bevel: 0.01 });
  timber(surface, [-hx, 0.52 * s, -hz], [hx, 0.52 * s, -hz], [0.035 * s, 0.04 * s], WOOD, { ref: [0, 1, 0], bevel: 0.01 });
  for (let k = 0; k < 3; k += 1) {
    const x = -hx + (w / 3) * (k + 0.5);
    timber(surface, [x, 0.56 * s, -hz], [x, 1.01 * s, -hz], [w / 6 - 0.035 * s, 0.02 * s], DARK, { ref: [0, 0, 1], bevel: 0.012 });
    timber(surface, [x, 0.62 * s, -hz + 0.02 * s], [x, 0.95 * s, -hz + 0.02 * s], [w / 6 - 0.08 * s, 0.012 * s], WOOD, { ref: [0, 0, 1], bevel: 0.01, shade: 1.02 });
  }
  timber(surface, [-hx, 0.54 * s, hz], [hx, 0.54 * s, hz], [0.03 * s, 0.16 * s], WOOD, { ref: [0, 1, 0], bevel: 0.012 });
  timber(surface, [-hx, 0.73 * s, hz], [hx, 0.73 * s, hz], [0.04 * s, 0.03 * s], DARK, { ref: [0, 1, 0], bevel: 0.01 });
  for (const x of [-hx, hx]) {
    timber(surface, [x, deck - 0.08 * s, -hz], [x, deck - 0.08 * s, hz], [0.035 * s, 0.07 * s], WOOD, { ref: [0, 1, 0], bevel: 0.01 });
  }

  // Mattress, quilt, pillows, blanket.
  cushion(surface, [0, deck + 0.08 * s, -hz + 0.04 * s], [0, deck + 0.08 * s, hz - 0.04 * s], hx - 0.02 * s, 0.1 * s, LINEN, { n: 3.5, puff: 0.02 });
  const quiltSquares = 5;
  surface.addPanel({
    cols: quiltSquares * 2, rows: 12, thickness: 0.03 * s,
    point: (u, v) => {
      const z = THREE.MathUtils.lerp(-hz + 0.55 * s, hz + 0.02 * s, v);
      const across = (u - 0.5) * 2;
      const over = Math.abs(across);
      const top = deck + 0.2 * s;
      if (over < 0.78) return new THREE.Vector3(across * hx, top + 0.015 * s * Math.sin(v * 9 + u * 5), z);
      const t = (over - 0.78) / 0.22;
      return new THREE.Vector3(Math.sign(across) * (hx + 0.025 * s - (1 - t) * 0.03 * s), top - t * 0.26 * s, z + Math.sin(v * 12) * 0.012 * s * t);
    },
    token: (u, v) => ((Math.floor(u * quiltSquares) + Math.floor(v * 6)) % 2 ? QUILT : LINEN),
    shade: (u, v) => 0.94 + 0.08 * Math.abs(Math.sin(u * 13 + v * 7))
  });
  for (const x of [-hx * 0.45, hx * 0.45]) {
    cushion(surface, [x - hx * 0.38, deck + 0.24 * s, -hz + 0.28 * s], [x + hx * 0.38, deck + 0.24 * s, -hz + 0.28 * s], 0.2 * s, 0.07 * s, LINEN,
      { ref: [0, 1, 0], n: 2.4, puff: 0.12, shade: 1.02 });
  }
  cushion(surface, [-hx * 0.7, deck + 0.26 * s, hz - 0.28 * s], [hx * 0.7, deck + 0.26 * s, hz - 0.28 * s], 0.16 * s, 0.035 * s, QUILT, { n: 3, shade: 0.9 });

  root.add(surface.buildMesh(`${ID}_mesh`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}

/**
 * Cozy armchair. Redesigned from the Blender chair: a deep upholstered body in burlap on turned dark
 * feet, rolled arms that scroll at the front, a tall rounded back tufted with buttons, a plump red
 * seat cushion and back cushion, and a piped front rail.
 */
export function createCozyArmchairModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const s = Number(context.parameters.scale ?? 1);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: burlap upholstery, dark wood, red cushions.
  const surface = new SurfaceBuilder(spec.palette);
  const CLOTH = 0;
  const WOOD = 1;
  const RED = 2;
  const w = 0.9 * s;
  const d = 0.84 * s;
  const hx = w / 2;
  const hz = d / 2;
  for (const [x, z] of [[-hx + 0.08 * s, -hz + 0.08 * s], [hx - 0.08 * s, -hz + 0.08 * s], [-hx + 0.08 * s, hz - 0.08 * s], [hx - 0.08 * s, hz - 0.08 * s]] as const) {
    surface.addLoft([[0, 0.028], [0.04, 0.036], [0.08, 0.03], [0.11, 0.04]].map(([y, r]): Station => ({ p: [x, y * s, z], w: r * s, h: r * s })),
      { sides: 8, ref: [0, 0, 1], capStart: 0, capEnd: 0, token: WOOD });
  }
  // Seat base and piped front rail.
  cushion(surface, [-hx + 0.12 * s, 0.26 * s, 0], [hx - 0.12 * s, 0.26 * s, 0], 0.16 * s, hz - 0.02 * s, CLOTH, { ref: [0, 0, 1], n: 4 });
  rope(surface, [[-hx + 0.14 * s, 0.13 * s, hz - 0.01 * s], [hx - 0.14 * s, 0.13 * s, hz - 0.01 * s]], 0.018 * s, WOOD, { sides: 6 });
  // Back: tall and rounded, reclined a little, with tufting buttons.
  const back = (y: number): V3 => [0, y, -hz + 0.1 * s + (y - 0.3 * s) * 0.12];
  surface.addLoft([[0.3, 0.9], [0.55, 0.95], [0.78, 0.92], [0.9, 0.78], [0.95, 0.5]].map(([y, k]): Station => ({ p: back(y * s), w: (hx - 0.04 * s) * k, h: 0.1 * s, n: 3 })),
    { sides: 12, ref: [0, 0, 1], capStart: 0, capEnd: 0.4, token: CLOTH });
  for (const [x, y] of [[-0.18, 0.62], [0, 0.66], [0.18, 0.62], [-0.1, 0.78], [0.1, 0.78]] as const) {
    const p = back(y * s);
    surface.addDisc([x * s, p[1], p[2] + 0.1 * s], [0, 0.12, 1], 0.014 * s, { token: WOOD, sides: 6, dome: 0.006 * s, lift: 0.004 * s });
  }
  // Rolled arms that scroll forward.
  for (const side of [-1, 1]) {
    const x = side * (hx - 0.07 * s);
    cushion(surface, [x, 0.34 * s, -hz + 0.08 * s], [x, 0.34 * s, hz - 0.02 * s], 0.075 * s, 0.2 * s, CLOTH, { ref: [0, 1, 0], n: 3.5 });
    surface.addLoft([
      { p: [x, 0.55 * s, -hz + 0.06 * s], w: 0.09 * s, h: 0.07 * s },
      { p: [x, 0.56 * s, 0], w: 0.095 * s, h: 0.075 * s },
      { p: [x, 0.55 * s, hz], w: 0.095 * s, h: 0.075 * s }
    ], { sides: 10, ref: [0, 1, 0], capStart: 0.2, capEnd: 0.05, token: CLOTH, shade: 1.02 });
    surface.addDisc([x, 0.52 * s, hz + 0.001 * s], [0, 0, 1], [0.08 * s, 0.07 * s], { token: WOOD, sides: 10, shade: 0.9, lift: 0.003 * s });
  }
  // Cushions.
  cushion(surface, [-hx + 0.15 * s, 0.46 * s, -0.04 * s], [hx - 0.15 * s, 0.46 * s, -0.04 * s], 0.06 * s, hz - 0.1 * s, RED, { ref: [0, 0, 1], n: 3, puff: 0.1 });
  cushion(surface, [-hx + 0.17 * s, 0.72 * s, -hz + 0.25 * s], [hx - 0.17 * s, 0.72 * s, -hz + 0.25 * s], 0.18 * s, 0.06 * s, RED, { ref: [0, 0.2, 1], n: 3, puff: 0.12, shade: 0.95 });

  root.add(surface.buildMesh(`${ID}_mesh`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}

/**
 * Park bench. Redesigned from the Blender bench: two cast-iron side frames with scrolled armrests and
 * splayed feet carry four seat slats and a reclined three-slat back, each slat its own tone, bolted
 * through the frames.
 */
export function createWoodBenchModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: warm slats, dark trim, cast iron.
  const surface = new SurfaceBuilder(context.spec.palette);
  const WOOD = 0;
  const IRON = 2;
  const length = 1.7;
  const seatY = 0.44;
  for (const x of [-length / 2 + 0.12, length / 2 - 0.12]) {
    // Cast-iron side: front leg, back leg rising into the back support, seat rail, scrolled arm.
    rope(surface, [[x, 0, 0.2], [x, 0.18, 0.18], [x, seatY, 0.16]], 0.025, IRON, { sides: 6 });
    rope(surface, [[x, 0, -0.24], [x, 0.2, -0.18], [x, seatY, -0.16], [x, 0.66, -0.22], [x, 0.84, -0.27]], 0.025, IRON, { sides: 6 });
    rope(surface, [[x, seatY - 0.02, 0.2], [x, seatY - 0.02, -0.18]], 0.02, IRON, { sides: 6 });
    const scroll = Array.from({ length: 11 }, (_, i) => {
      const t = i / 10;
      const a = t * Math.PI * 1.5;
      return new THREE.Vector3(x, seatY + 0.2 + Math.sin(a) * 0.05 * (1 - t * 0.5), 0.2 - t * 0.34 - Math.cos(a) * 0.03);
    });
    rope(surface, [new THREE.Vector3(x, seatY, 0.17), ...scroll], 0.02, IRON, { sides: 6 });
  }
  for (let k = 0; k < 4; k += 1) {
    const z = 0.17 - k * 0.1;
    timber(surface, [-length / 2, seatY + 0.02, z], [length / 2, seatY + 0.02, z], [0.042, 0.018], WOOD, { ref: [0, 1, 0], shade: 0.86 + random() * 0.16, bevel: 0.008 });
  }
  const tilt = new THREE.Vector3(0, 0.26, 1).normalize();
  for (let k = 0; k < 3; k += 1) {
    const y = seatY + 0.18 + k * 0.12;
    const z = -0.19 - k * 0.03;
    timber(surface, [-length / 2 + 0.02, y, z], [length / 2 - 0.02, y, z], [0.045, 0.016], WOOD, { ref: v3(tilt), shade: 0.86 + random() * 0.16, bevel: 0.008 });
  }
  for (const x of [-length / 2 + 0.12, length / 2 - 0.12]) {
    for (const z of [0.07, -0.13]) surface.addDisc([x, seatY + 0.04, z], [0, 1, 0], 0.012, { token: IRON, sides: 6, dome: 0.004 });
  }
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/**
 * Picnic table. Redesigned from the Blender table: a five-plank top and two plank benches bolted to
 * crossed A-frame legs, braced from the top's centre to the bench bearers, planks each their own tone
 * and slightly out of true.
 */
export function createPicnicTableModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: warm planks, dark frame, iron bolts.
  const surface = new SurfaceBuilder(context.spec.palette);
  const WOOD = 0;
  const DARK = 1;
  const IRON = 2;
  const length = 1.9;
  const topY = 0.74;
  const benchY = 0.44;
  for (let k = 0; k < 5; k += 1) {
    const z = -0.3 + k * 0.15;
    timber(surface, [-length / 2, topY - 0.02 + (random() - 0.5) * 0.006, z], [length / 2, topY - 0.02, z], [0.068, 0.022], WOOD,
      { ref: [0, 1, 0], shade: 0.86 + random() * 0.16, bevel: 0.01 });
  }
  for (const side of [-1, 1]) {
    for (const k of [0, 1]) {
      const z = side * (0.58 + k * 0.13);
      timber(surface, [-length / 2 + 0.05, benchY, z], [length / 2 - 0.05, benchY, z], [0.06, 0.022], WOOD, { ref: [0, 1, 0], shade: 0.86 + random() * 0.16, bevel: 0.01 });
    }
  }
  for (const x of [-length / 2 + 0.28, length / 2 - 0.28]) {
    timber(surface, [x, topY - 0.06, -0.36], [x, topY - 0.06, 0.36], [0.03, 0.04], DARK, { ref: [0, 1, 0] });
    timber(surface, [x, benchY - 0.05, -0.8], [x, benchY - 0.05, 0.8], [0.03, 0.045], DARK, { ref: [0, 1, 0] });
    for (const side of [-1, 1]) {
      timber(surface, [x, 0, side * 0.62], [x, topY - 0.04, side * 0.05], [0.03, 0.05], DARK, { bevel: 0.01 });
      surface.addDisc([x + 0.032, benchY - 0.05, side * 0.36], [1, 0, 0], 0.014, { token: IRON, sides: 6, dome: 0.005 });
    }
    timber(surface, [x, benchY - 0.05, 0], [0, topY - 0.08, 0], [0.025, 0.025], DARK, { bevel: 0.006 });
  }
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}
