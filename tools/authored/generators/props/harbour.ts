import * as THREE from "three";

import { SurfaceBuilder, mulberry32, type AuthoredModel, type GeneratorContext, type Station } from "../../kit";
import { catenary, rope, sack, timber } from "./parts";

/**
 * Harbour props: dock lantern post, hanging signboard, cargo sack, large cargo crate, treasure
 * chest. glTF space: +Y up, ground-centred, the front toward +Z, metres.
 */

/** A coil of rope wound round a post: stacked turns. */
function lashing(surface: SurfaceBuilder, centre: THREE.Vector3, radius: number, turns: number, token: number, thick: number): void {
  rope(surface, Array.from({ length: turns * 10 + 1 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return centre.clone().add(new THREE.Vector3(Math.cos(a) * radius, (i / 10) * thick * 2.1, Math.sin(a) * radius));
  }), thick, token, { sides: 4, caps: false, shade: 1.02 });
}

/**
 * Dock lantern post. Redesigned from the Blender post: a thick tarred piling with rope lashings and
 * an iron cap carries a curved iron arm reaching forward (+Z); from its end a caged ship's lantern
 * hangs on a ring: brass base and hood, glowing glass, iron guard wires and a carry ring on top.
 */
export function createDockLanternModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: dark timber, iron, lantern glow, brass.
  const surface = new SurfaceBuilder(context.spec.palette);
  const WOOD = 0;
  const IRON = 1;
  const GLOW = 2;
  const BRASS = 3;
  const top = 2.35;
  surface.addLoft([[0, 0.13], [0.3, 0.12], [top - 0.1, 0.1], [top, 0.1]].map(([y, r]): Station => ({ p: [0, y, 0], w: r, h: r })),
    { sides: 9, ref: [0, 0, 1], capStart: 0, token: WOOD, tone: (q) => 0.86 + 0.1 * Math.sin(q.y * 6) ** 2 });
  surface.addLoft([{ p: [0, top, 0], w: 0.12, h: 0.12 }, { p: [0, top + 0.04, 0], w: 0.12, h: 0.12 }], { sides: 9, ref: [0, 0, 1], capEnd: 0.4, token: IRON });
  lashing(surface, new THREE.Vector3(0, 0.45, 0), 0.115, 3, BRASS, 0.018);
  lashing(surface, new THREE.Vector3(0, top - 0.5, 0), 0.105, 2, BRASS, 0.018);
  // Curved iron arm with a scroll brace.
  const arm = Array.from({ length: 8 }, (_, i) => {
    const t = i / 7;
    return new THREE.Vector3(0, top - 0.12 + Math.sin(t * Math.PI * 0.5) * 0.12, 0.08 + t * 0.62);
  });
  rope(surface, arm, 0.022, IRON, { sides: 6 });
  rope(surface, [new THREE.Vector3(0, top - 0.55, 0.1), new THREE.Vector3(0, top - 0.3, 0.3), arm[4]], 0.014, IRON, { sides: 5 });
  // Hanging lantern.
  const hang = arm[arm.length - 1].clone();
  rope(surface, Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return hang.clone().add(new THREE.Vector3(0, -0.05 + Math.cos(a) * 0.04, Math.sin(a) * 0.03));
  }), 0.007, IRON, { sides: 4, caps: false });
  const lanternTop = hang.y - 0.12;
  const at = (y: number): [number, number, number] => [0, lanternTop - y, hang.z];
  surface.addLoft([[0.42, 0.06], [0.4, 0.1], [0.36, 0.1], [0.35, 0.075]].map(([y, r]): Station => ({ p: at(y), w: r, h: r })),
    { sides: 8, ref: [0, 0, 1], capStart: 0.3, capEnd: 0, token: BRASS });
  surface.addLoft([[0.35, 0.07], [0.09, 0.075]].map(([y, r]): Station => ({ p: at(y), w: r, h: r })),
    { sides: 8, ref: [0, 0, 1], token: GLOW, shade: 0.95 });
  surface.addLoft([[0.1, 0.1], [0.06, 0.1], [0.0, 0.03]].map(([y, r]): Station => ({ p: at(y), w: r, h: r })),
    { sides: 8, ref: [0, 0, 1], capStart: 0, capEnd: 0.3, token: BRASS });
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const o = new THREE.Vector3(Math.cos(a) * 0.085, 0, Math.sin(a) * 0.085);
    rope(surface, [new THREE.Vector3(...at(0.35)).add(o), new THREE.Vector3(...at(0.22)).add(o.clone().multiplyScalar(1.05)), new THREE.Vector3(...at(0.09)).add(o)], 0.006, IRON, { sides: 4 });
  }
  rope(surface, Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * Math.PI;
    return new THREE.Vector3(Math.cos(a) * 0.035, lanternTop + Math.sin(a) * 0.05, hang.z);
  }), 0.006, BRASS, { sides: 4 });
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/**
 * Hanging signboard. Redesigned from the Blender sign: a squared post on a stepped foot carries a
 * braced arm with an iron scroll; the board hangs on two chains, framed, with a cream painted panel
 * bearing a dark fish.
 */
export function createHangingSignboardModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: warm wood, dark wood, iron, cream paint.
  const surface = new SurfaceBuilder(context.spec.palette);
  const WOOD = 0;
  const DARK = 1;
  const IRON = 2;
  const PAINT = 3;
  const postX = -0.55;
  const armY = 1.82;
  timber(surface, [postX, 0, 0], [postX, 0.1, 0], [0.12, 0.12], DARK, { ref: [0, 0, 1], bevel: 0.02 });
  timber(surface, [postX, 0.1, 0], [postX, 1.92, 0], [0.06, 0.06], WOOD, { ref: [0, 0, 1], bevel: 0.014 });
  surface.addLoft([{ p: [postX, 1.92, 0], w: 0.09, h: 0.09 }, { p: [postX, 1.95, 0], w: 0.09, h: 0.09 }],
    { sides: 4, phase: Math.PI / 4, ref: [0, 0, 1], capStart: 0, capEnd: 0.6, flat: true, token: DARK });
  timber(surface, [postX - 0.05, armY, 0], [0.62, armY, 0], [0.035, 0.045], WOOD, { ref: [0, 1, 0], bevel: 0.01 });
  timber(surface, [postX, armY - 0.36, 0], [postX + 0.34, armY - 0.03, 0], [0.025, 0.03], WOOD, { bevel: 0.008 });
  const scroll = Array.from({ length: 12 }, (_, i) => {
    const t = i / 11;
    const a = t * Math.PI * 1.6;
    return new THREE.Vector3(postX + 0.06 + Math.sin(a) * 0.14 * (1 - 0.5 * t) + t * 0.3, armY - 0.05 - (1 - Math.cos(a)) * 0.07, 0.04);
  });
  rope(surface, scroll, 0.009, IRON, { sides: 4 });
  // Board on two chains.
  const boardTop = armY - 0.3;
  const boardW = 0.9;
  const boardH = 0.56;
  const boardX = 0.08;
  for (const dx of [-0.36, 0.36]) {
    for (let k = 0; k < 4; k += 1) {
      const y = armY - 0.05 - k * 0.065;
      rope(surface, Array.from({ length: 7 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return k % 2 ? new THREE.Vector3(boardX + dx, y + Math.cos(a) * 0.035, Math.sin(a) * 0.018) : new THREE.Vector3(boardX + dx + Math.sin(a) * 0.018, y + Math.cos(a) * 0.035, 0);
      }), 0.005, IRON, { sides: 3, caps: false });
    }
  }
  timber(surface, [boardX - boardW / 2, boardTop - boardH / 2, 0], [boardX + boardW / 2, boardTop - boardH / 2, 0], [0.025, boardH / 2], WOOD, { ref: [0, 1, 0], bevel: 0.015 });
  for (const face of [-1, 1]) {
    const z = face * 0.027;
    surface.addDisc([boardX, boardTop - boardH / 2, z], [0, 0, face], [boardH / 2 - 0.05, boardW / 2 - 0.05], { token: PAINT, rect: true, up: [0, 1, 0] });
    for (const [x0, y0, x1, y1] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]] as const) {
      timber(surface, [boardX + x0 * (boardW / 2 - 0.04), boardTop - boardH / 2 + y0 * (boardH / 2 - 0.04), z], [boardX + x1 * (boardW / 2 - 0.04), boardTop - boardH / 2 + y1 * (boardH / 2 - 0.04), z],
        [0.022, 0.012], DARK, { ref: [0, 0, 1], bevel: 0.004 });
    }
    // Painted fish: body and forked tail.
    const cy = boardTop - boardH / 2;
    surface.addDisc([boardX - 0.04, cy, z + face * 0.002], [0, 0, face], [0.08, 0.18], { token: DARK, sides: 12, up: [0, 1, 0] });
    surface.addPatch([boardX + 0.14, cy, z + face * 0.002], [[boardX + 0.26, cy + 0.08, z + face * 0.002], [boardX + 0.22, cy, z + face * 0.002], [boardX + 0.26, cy - 0.08, z + face * 0.002]], [0, 0, face], { token: DARK });
    surface.addDisc([boardX - 0.15, cy + 0.02, z + face * 0.004], [0, 0, face], 0.014, { token: PAINT, sides: 6 });
  }
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/**
 * Cargo sack. Redesigned from the Blender sack: a tall, slumped grain sack with a tied, ruffled neck,
 * a stitched seam up its side and a cream stencilled shipping patch.
 */
export function createCargoSackModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: burlap, cream stencil, dark cord.
  const surface = new SurfaceBuilder(context.spec.palette);
  const BURLAP = 0;
  const CREAM = 1;
  const CORD = 2;
  sack(surface, [0, 0, 0], [0.36, 0.34, 0.68], BURLAP, CORD, { seed: context.seed, yaw: 0.2, lean: 0.05 });
  surface.addDisc([0.01, 0.3, 0.17], [0.1, 0.05, 1], [0.08, 0.1], { token: CREAM, sides: 8, lift: 0.004, up: [0, 1, 0] });
  // Stencilled mill stamp: a dark ring with a dot on the cream patch.
  surface.addDisc([0.01, 0.3, 0.17], [0.1, 0.05, 1], 0.05, { token: CORD, sides: 12, lift: 0.007 });
  surface.addDisc([0.01, 0.3, 0.17], [0.1, 0.05, 1], 0.036, { token: CREAM, sides: 12, lift: 0.009 });
  surface.addDisc([0.01, 0.3, 0.17], [0.1, 0.05, 1], 0.014, { token: CORD, sides: 8, lift: 0.011 });
  rope(surface, Array.from({ length: 6 }, (_, i) => new THREE.Vector3(-0.17 + Math.sin(i) * 0.004, 0.05 + i * 0.1, 0.02)), 0.005, CORD, { sides: 3 });
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/**
 * Large cargo crate. Redesigned from the Blender crate: a framed shipping crate, every face planked
 * inside a border frame with a diagonal brace, iron corner caps, rope handles either side, and a
 * cream stencil plate on the front.
 */
export function createCargoCrateLargeModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: warm planks, dark frame, iron, cream stencil.
  const surface = new SurfaceBuilder(context.spec.palette);
  const WOOD = 0;
  const DARK = 1;
  const IRON = 2;
  const CREAM = 3;
  const s = 0.76;
  const h = s / 2;
  // Plank infill on all six faces.
  timber(surface, [0, h, -h + 0.01], [0, h, h - 0.01], [h - 0.01, h - 0.01], WOOD, { ref: [0, 1, 0], bevel: 0, shade: 0.9 });
  for (const [axis, sign] of [[0, 1], [0, -1], [2, 1], [2, -1]] as const) {
    for (let k = 0; k < 4; k += 1) {
      const y = 0.06 + ((s - 0.12) / 4) * (k + 0.5);
      const o = h + 0.004;
      const a: [number, number, number] = axis === 0 ? [sign * o, y, -h + 0.05] : [-h + 0.05, y, sign * o];
      const b: [number, number, number] = axis === 0 ? [sign * o, y, h - 0.05] : [h - 0.05, y, sign * o];
      timber(surface, a, b, [0.012, (s - 0.12) / 8 - 0.006], WOOD, { ref: [0, 1, 0], shade: 0.84 + random() * 0.18, bevel: 0.004 });
    }
    // Border frame and a diagonal brace.
    const o = h + 0.018;
    const q = (u: number, y: number): [number, number, number] => (axis === 0 ? [sign * o, y, u] : [u, y, sign * o]);
    const edge = h - 0.04;
    for (const [u0, y0, u1, y1] of [[-edge, 0.04, edge, 0.04], [-edge, s - 0.04, edge, s - 0.04], [-edge, 0.04, -edge, s - 0.04], [edge, 0.04, edge, s - 0.04], [-edge, 0.06, edge, s - 0.06]] as const) {
      timber(surface, q(u0, y0), q(u1, y1), [0.012, 0.035], DARK, { ref: axis === 0 ? [1, 0, 0] : [0, 0, 1], bevel: 0.006 });
    }
  }
  for (let k = 0; k < 4; k += 1) {
    const z = -h + 0.05 + ((s - 0.1) / 4) * (k + 0.5);
    timber(surface, [-h + 0.02, s + 0.012, z], [h - 0.02, s + 0.012, z], [(s - 0.1) / 8 - 0.006, 0.014], WOOD, { ref: [0, 1, 0], shade: 0.84 + random() * 0.18 });
  }
  // Iron corner caps.
  for (const x of [-1, 1]) for (const z of [-1, 1]) for (const y of [0.02, s - 0.02]) {
    timber(surface, [x * (h + 0.012), y - 0.05, z * (h + 0.012)], [x * (h + 0.012), y + 0.05, z * (h + 0.012)], [0.05, 0.05], IRON, { ref: [0, 0, 1], bevel: 0.008 });
  }
  // Rope handles and the stencil plate.
  for (const x of [-1, 1]) {
    rope(surface, catenary([x * (h + 0.03), s * 0.72, -0.12], [x * (h + 0.03), s * 0.72, 0.12], 0.06, 8), 0.014, CREAM, { sides: 5 });
  }
  surface.addDisc([0, s * 0.62, h + 0.032], [0, 0, 1], [0.08, 0.16], { token: CREAM, rect: true, up: [0, 1, 0] });
  for (const dy of [-0.03, 0.02]) {
    timber(surface, [-0.1, s * 0.62 + dy, h + 0.036], [0.1, s * 0.62 + dy, h + 0.036], [0.004, 0.01], DARK, { ref: [0, 0, 1] });
  }
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/**
 * Treasure chest. Redesigned from the Blender chest: a planked body bound in dark iron bands with
 * brass corner caps, side handles and a lock plate; the barrel lid stands open on its hinges over a
 * heap of brass coins that spills a few onto the ground.
 */
export function createTreasureChestModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: dark iron-bound wood, warm planks, brass, dark iron.
  const surface = new SurfaceBuilder(context.spec.palette);
  const DARK = 0;
  const WOOD = 1;
  const BRASS = 2;
  const IRON = 3;
  const w = 0.84;
  const d = 0.5;
  const body = 0.36;
  // Body: planked walls (two faces each) and floor.
  surface.addPanel({
    cols: 16, rows: 3, thickness: 0.03,
    point: (u, v) => {
      const t = u * 4;
      const side = Math.floor(Math.min(3.999, t));
      const f = t - side;
      const corners = [[-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2], [-w / 2, d / 2]];
      const [x0, z0] = corners[side];
      const [x1, z1] = corners[side + 1];
      return new THREE.Vector3(THREE.MathUtils.lerp(x0, x1, f), 0.02 + v * body, THREE.MathUtils.lerp(z0, z1, f));
    },
    token: () => WOOD, shade: (_, v) => (Math.floor(v * 3) % 2 ? 0.88 : 1)
  });
  timber(surface, [0, 0.03, -d / 2], [0, 0.03, d / 2], [w / 2, 0.03], DARK, { ref: [0, 1, 0] });
  // Iron bands and brass corners.
  for (const x of [-w * 0.3, w * 0.3]) {
    timber(surface, [x, 0.02, d / 2 + 0.018], [x, body + 0.02, d / 2 + 0.018], [0.03, 0.006], IRON, { ref: [0, 0, 1] });
    timber(surface, [x, 0.02, -d / 2 - 0.018], [x, body + 0.02, -d / 2 - 0.018], [0.03, 0.006], IRON, { ref: [0, 0, 1] });
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    timber(surface, [x * (w / 2 + 0.01), 0.01, z * (d / 2 + 0.01)], [x * (w / 2 + 0.01), 0.12, z * (d / 2 + 0.01)], [0.04, 0.04], BRASS, { ref: [0, 0, 1], bevel: 0.008 });
    timber(surface, [x * (w / 2 + 0.01), body - 0.08, z * (d / 2 + 0.01)], [x * (w / 2 + 0.01), body + 0.03, z * (d / 2 + 0.01)], [0.04, 0.04], BRASS, { ref: [0, 0, 1], bevel: 0.008 });
  }
  for (const x of [-1, 1]) {
    rope(surface, Array.from({ length: 7 }, (_, i) => {
      const a = (i / 6) * Math.PI;
      return new THREE.Vector3(x * (w / 2 + 0.04), body * 0.62 - Math.sin(a) * 0.05, Math.cos(a) * 0.08);
    }), 0.01, IRON, { sides: 5 });
  }
  timber(surface, [0, body - 0.12, d / 2 + 0.022], [0, body + 0.01, d / 2 + 0.022], [0.07, 0.008], BRASS, { ref: [0, 0, 1], bevel: 0.006 });
  surface.addDisc([0, body - 0.06, d / 2 + 0.032], [0, 0, 1], [0.022, 0.012], { token: IRON, sides: 6, shade: 0.72, up: [0, 1, 0] });
  // Coins heaped inside and a few spilled.
  const coin = (x: number, y: number, z: number, tilt: number): void => {
    const n = new THREE.Vector3(Math.sin(tilt) * 0.5, 1, Math.cos(tilt) * 0.3).normalize();
    surface.addLoft([{ p: [x, y, z], w: 0.028, h: 0.028 }, { p: [x + n.x * 0.008, y + n.y * 0.008, z + n.z * 0.008], w: 0.028, h: 0.028 }],
      { sides: 7, ref: [1, 0, 0], capStart: 0, capEnd: 0, token: BRASS, shade: 0.94 + random() * 0.1 });
  };
  for (let k = 0; k < 34; k += 1) {
    const x = (random() - 0.5) * (w - 0.12);
    const z = (random() - 0.5) * (d - 0.1);
    const heap = 0.1 * (1 - (Math.abs(x) / (w / 2)) ** 2) * (1 - (Math.abs(z) / (d / 2)) ** 2);
    coin(x, body - 0.02 + heap + random() * 0.02, z, random() * 6);
  }
  for (let k = 0; k < 5; k += 1) coin(0.2 + random() * 0.3, 0.004, d / 2 + 0.08 + random() * 0.15, random() * 6);
  // Barrel lid, open on its back hinges.
  const hinge = new THREE.Vector3(0, body + 0.02, -d / 2);
  const openAngle = THREE.MathUtils.degToRad(105);
  const lid = (u: number, v: number): THREE.Vector3 => {
    const a = v * Math.PI;
    const local = new THREE.Vector3(0, Math.sin(a) * d * 0.4, d / 2 - Math.cos(a) * d / 2);
    const rotated = new THREE.Vector3(0, local.y * Math.cos(openAngle) + local.z * Math.sin(openAngle), -local.y * Math.sin(openAngle) + local.z * Math.cos(openAngle));
    return hinge.clone().add(new THREE.Vector3((u - 0.5) * w, rotated.y, rotated.z));
  };
  surface.addPanel({ cols: 6, rows: 6, thickness: 0.03, point: lid, token: (u) => (u < 0.08 || u > 0.92 ? DARK : WOOD), shade: (_, v) => (Math.floor(v * 6) % 2 ? 0.88 : 1) });
  // Iron bands over the lid's barrel, lifted off it along the barrel's own radius.
  const barrelCentre = lid(0.5, 0).lerp(lid(0.5, 1), 0.5);
  for (const u of [0.2, 0.8]) {
    rope(surface, Array.from({ length: 9 }, (_, i) => {
      const q = lid(u, i / 8);
      return q.clone().addScaledVector(q.clone().sub(barrelCentre).setX(0).normalize(), 0.018);
    }), 0.012, IRON, { sides: 4 });
  }
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

