import * as THREE from "three";

import { SurfaceBuilder, mulberry32, type AuthoredModel, type GeneratorContext, type Station } from "../../kit";
import { lumps, rope, v3 } from "./parts";

/**
 * Shore and woodland timber: driftwood clusters, a beached driftwood log, a mossy fallen log.
 * glTF space: +Y up, ground-centred, metres.
 */

/** A lying, tapering, gently bent log along `dir` from `start`: bleached on top, darker beneath. */
function log(
  surface: SurfaceBuilder, start: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, token: number,
  options: { seed: number; bend?: number; taper?: number; lift?: number; sides?: number; stations?: number; shadeTop?: number }
): THREE.Vector3[] {
  const d = dir.clone().normalize();
  const side = new THREE.Vector3(-d.z, 0, d.x);
  const count = options.stations ?? 6;
  const taper = options.taper ?? 0.55;
  const path: THREE.Vector3[] = [];
  const stations: Station[] = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const r = radius * (1 - (1 - taper) * t) * (1 + 0.08 * Math.sin(t * 9 + options.seed));
    const p = start.clone().addScaledVector(d, length * t)
      .addScaledVector(side, Math.sin(t * Math.PI) * (options.bend ?? 0) * length)
      .add(new THREE.Vector3(0, r + (options.lift ?? 0) * t, 0));
    path.push(p);
    return { p: v3(p), w: r, h: r * 0.92 };
  });
  surface.addLoft(stations, {
    sides: options.sides ?? 7, ref: [0, 1, 0], capStart: -0.15, capEnd: 0.25, radial: lumps(options.seed, 0.07), token,
    // Bleached along the top, damp and dark beneath; the broken ends paler still.
    shade: ({ normal, u }) => (u < 0 || u > count - 1 ? 1.04 : normal.y > 0.35 ? (options.shadeTop ?? 1.02) : normal.y < -0.3 ? 0.78 : 0.9),
    tone: (q) => 0.94 + 0.06 * Math.sin(q.x * 13 + q.z * 7)
  });
  return path;
}

/** A short broken branch stub from a point on a log, pointing `out`. */
function stub(surface: SurfaceBuilder, at: THREE.Vector3, out: THREE.Vector3, length: number, radius: number, token: number): void {
  rope(surface, [at, at.clone().addScaledVector(out.clone().normalize(), length)], radius, token, { sides: 5, taper: [1, 0.55], shade: 0.95 });
}

/**
 * Driftwood cluster. Redesigned from the Blender pile of straight crossed beams: one long, bent,
 * tapering log leads the cluster along `angle`; `logCount - 1` shorter pieces rest against and on
 * it at unequal crossings; broken ends and branch stubs break the outline; the wood is bleached on
 * top and darker beneath, never a campfire star.
 */
export function createDriftwoodClusterModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const p = context.parameters;
  const random = mulberry32(context.seed);
  const count = Math.max(1, Math.round(Number(p.logCount ?? 3)));
  const length = Number(p.length ?? 1.9);
  // Driftwood reads as sticks at the catalog radius; the cluster thickens it for a chunkier read.
  const radius = Number(p.radius ?? 0.09) * 1.55;
  const angle = Number(p.angle ?? 0.2);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(context.spec.palette);
  const MAIN = 0;
  const SECOND = context.spec.palette.length > 1 ? 1 : 0;

  const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  const start = dir.clone().multiplyScalar(-length / 2);
  const main = log(surface, start, dir, length, radius, MAIN, { seed: context.seed, bend: 0.05, taper: 0.45 });
  stub(surface, main[2].clone().add(new THREE.Vector3(0, radius * 0.5, 0)), new THREE.Vector3(-dir.z, 0.6, dir.x), radius * 2.4, radius * 0.4, MAIN);
  stub(surface, main[4].clone(), new THREE.Vector3(dir.z, 0.3, -dir.x), radius * 1.8, radius * 0.32, MAIN);

  for (let k = 1; k < count; k += 1) {
    const cross = angle + (k % 2 ? 1 : -1) * (0.7 + random() * 0.5);
    const d = new THREE.Vector3(Math.cos(cross), 0, Math.sin(cross));
    const piece = length * (0.5 + random() * 0.18);
    const at = main[Math.min(main.length - 2, 1 + Math.floor(random() * (main.length - 2)))];
    const onTop = k === 1;
    const from = at.clone().setY(0).addScaledVector(d, -piece * (onTop ? 0.25 : 0.6));
    log(surface, from, d, piece, radius * (0.65 + random() * 0.15), SECOND, {
      seed: context.seed + k, bend: (random() - 0.5) * 0.08, taper: 0.6, lift: onTop ? radius * 1.2 : 0
    });
  }
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/**
 * Beached driftwood log. Redesigned from the Blender log: a bleached, twisting trunk lies half
 * bedded in a small sand drift, its root end flaring into gnarled root stubs, a snapped branch
 * rising from its back.
 */
export function createDriftwoodLogModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: weathered wood, dark wood, sand.
  const surface = new SurfaceBuilder(context.spec.palette);
  const WOOD = 0;
  const DARK = 1;
  const SAND = 2;
  const dir = new THREE.Vector3(1, 0, 0.12).normalize();
  const trunk = log(surface, new THREE.Vector3(-0.72, -0.04, -0.05), dir, 1.6, 0.17, WOOD, { seed: 3, bend: 0.06, taper: 0.5, stations: 7, sides: 8 });
  // Root flare with gnarled stubs at the thick end.
  const flare = trunk[0];
  surface.addEllipsoid([flare.x - 0.08, flare.y, flare.z], [0.2, 0.2, 0.26], { token: WOOD, sides: 8, shade: 0.94 });
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    // Roots spread over the sand, never down into it.
    const out = new THREE.Vector3(-0.7, Math.max(-0.15, Math.sin(a)) * 0.9, Math.cos(a) * 0.9);
    rope(surface, [flare.clone().add(new THREE.Vector3(-0.1, Math.sin(a) * 0.1, Math.cos(a) * 0.12)),
      flare.clone().add(out.clone().multiplyScalar(0.22)), flare.clone().add(out.clone().multiplyScalar(0.36)).add(new THREE.Vector3(0, -0.05, 0))],
    0.045, k % 2 ? DARK : WOOD, { sides: 5, taper: [1, 0.3] });
  }
  stub(surface, trunk[3].clone().add(new THREE.Vector3(0, 0.12, 0)), new THREE.Vector3(0.3, 1, -0.3), 0.3, 0.05, WOOD);
  stub(surface, trunk[5].clone().add(new THREE.Vector3(0, 0.05, 0.05)), new THREE.Vector3(0.4, 0.4, 1), 0.2, 0.035, DARK);
  // Sand drift banked against the log: a low lumpy mound that feathers into the ground.
  surface.addLoft([[-0.62, 0.12, 0.02], [-0.4, 0.3, 0.09], [0, 0.36, 0.12], [0.35, 0.28, 0.08], [0.6, 0.12, 0.02]].map(([x, half, rise]): Station =>
    ({ p: [x, -0.02, 0.12], w: half, h: rise + 0.02, hb: 0.02, n: 2.2 })), {
    sides: 12, ref: [0, 1, 0], capStart: 0.3, capEnd: 0.3, radial: lumps(4, 0.1), token: SAND,
    shade: ({ normal }) => (normal.y > 0.6 ? 1.02 : 0.9), tone: (q) => 0.92 + 0.08 * Math.sin(q.x * 9 + q.z * 5)
  });
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/**
 * Mossy fallen log. Redesigned from the Blender log: a dark-barked trunk lies along X with ring-cut
 * ends showing pale heartwood and growth rings, a snapped branch, cushions of moss conformed over
 * its back, a bracket fungus, and fern fronds at its foot.
 */
export function createFallenLogModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: dark bark, weathered heartwood, moss, fern.
  const surface = new SurfaceBuilder(context.spec.palette);
  const BARK = 0;
  const HEART = 1;
  const MOSS = 2;
  const FERN = 3;
  const length = 2.9;
  const radius = 0.3;
  const trunk = log(surface, new THREE.Vector3(-length / 2, -0.05, 0), new THREE.Vector3(1, 0, 0), length, radius, BARK,
    { seed: 11, bend: 0.03, taper: 0.8, stations: 7, sides: 10, shadeTop: 0.96 });
  // Cut ends: pale heartwood with growth rings.
  for (const [end, r] of [[trunk[0], radius], [trunk[trunk.length - 1], radius * 0.8]] as const) {
    const outward = end === trunk[0] ? -1 : 1;
    for (let ring = 0; ring < 3; ring += 1) {
      surface.addDisc([end.x + outward * (0.012 + ring * 0.004), end.y, end.z], [outward, 0, 0], r * (0.86 - ring * 0.26),
        { token: HEART, sides: 10, shade: ring % 2 ? 0.86 : 1.02, up: [0, 1, 0] });
    }
  }
  // Moss cushions conformed over the back: each ring point sits on the trunk's surface.
  for (let k = 0; k < 7; k += 1) {
    const axis = trunk[1 + Math.floor(random() * (trunk.length - 2))];
    const along = (random() - 0.5) * 0.3;
    const a = -0.6 + random() * 1.2;
    const size = 0.12 + random() * 0.1;
    const onBark = (dx: number, da: number, lift: number): THREE.Vector3 =>
      new THREE.Vector3(axis.x + along + dx, axis.y + Math.cos(a + da) * (radius + lift), axis.z + Math.sin(a + da) * (radius + lift));
    const ring = Array.from({ length: 8 }, (_, i) => {
      const t = (i / 8) * Math.PI * 2;
      return v3(onBark(Math.cos(t) * size * 1.5, (Math.sin(t) * size) / radius, 0.012));
    });
    surface.addPatch(v3(onBark(0, 0, 0.05)), ring, [0, Math.cos(a), Math.sin(a)], { token: MOSS, shade: 0.9 + random() * 0.14 });
  }
  // Snapped branch and a bracket fungus.
  stub(surface, trunk[4].clone().add(new THREE.Vector3(0, radius * 0.7, 0.1)), new THREE.Vector3(0.3, 1, 0.5), 0.45, 0.07, BARK);
  surface.addPanel({
    cols: 5, rows: 2, thickness: 0.03,
    point: (u, v) => {
      const a = (u - 0.5) * 2.2;
      return new THREE.Vector3(trunk[2].x + Math.sin(a) * 0.14 * v, trunk[2].y + 0.05 - v * v * 0.03, radius + 0.01 + Math.cos(a) * 0.12 * v);
    },
    token: () => HEART, shade: (_, v) => (v > 0.5 ? 1.04 : 0.92)
  });
  // Fern fronds at the foot.
  for (let k = 0; k < 6; k += 1) {
    const base = new THREE.Vector3(-0.9 + random() * 1.8, 0.01, (random() < 0.5 ? -1 : 1) * (radius + 0.04));
    const out = new THREE.Vector3((random() - 0.5) * 0.8, 1, Math.sign(base.z) * (0.3 + random() * 0.25)).normalize();
    const reach = 0.26 + random() * 0.1;
    surface.addPanel({
      cols: 6, rows: 1, thickness: 0.004,
      point: (u, v) => {
        const q = base.clone().addScaledVector(out, reach * u).add(new THREE.Vector3(0, -0.25 * reach * u * u, 0));
        const across = new THREE.Vector3(1, 0, 0).multiplyScalar((v - 0.5) * 0.12 * Math.sin(Math.PI * Math.min(1, u * 1.2)));
        return q.add(across);
      },
      token: () => FERN, shade: (u) => (Math.floor(u * 6) % 2 ? 0.9 : 1.02)
    });
  }
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}
