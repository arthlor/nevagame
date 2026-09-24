import * as THREE from "three";

import { SurfaceBuilder, type FaceContext, type Station, type V3, type Weights } from "../../kit";

/**
 * Shared prop parts: rope, hewn timber, burlap sacks, spoked wheels, nets, fruit and crates. Each
 * adds to a caller's `SurfaceBuilder` in the caller's palette indices, so a part never brings its own
 * material.
 */

export const v3 = (p: THREE.Vector3): V3 => [p.x, p.y, p.z];
const vec = (p: V3 | THREE.Vector3): THREE.Vector3 => (p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(...p));

/** The world axis least aligned with a direction: a loft reference that can never run parallel. */
export function refFor(direction: THREE.Vector3): V3 {
  const d = direction.clone().normalize();
  const axes: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  return axes.reduce((best, axis) => (Math.abs(d.dot(vec(axis))) < Math.abs(d.dot(vec(best))) ? axis : best));
}

/** Points along a rope hung from `a` to `b`, sagging `sag` metres at mid-span. */
export function catenary(a: V3 | THREE.Vector3, b: V3 | THREE.Vector3, sag: number, segments = 8): THREE.Vector3[] {
  const from = vec(a);
  const to = vec(b);
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    return from.clone().lerp(to, t).add(new THREE.Vector3(0, -4 * sag * t * (1 - t), 0));
  });
}

/** A round rope, rod or cord through `points`, optionally tapered. */
export function rope(
  surface: SurfaceBuilder, points: ReadonlyArray<V3 | THREE.Vector3>, radius: number, token: number,
  options: { sides?: number; shade?: number; taper?: readonly [number, number]; caps?: boolean; bones?: Weights; tone?: (p: THREE.Vector3) => number } = {}
): void {
  const path = points.map(vec);
  const [r0, r1] = options.taper ?? [1, 1];
  const stations: Station[] = path.map((p, i) => {
    const r = radius * THREE.MathUtils.lerp(r0, r1, i / Math.max(1, path.length - 1));
    return { p: v3(p), w: r, h: r, bones: options.bones };
  });
  surface.addLoft(stations, {
    sides: options.sides ?? 5, ref: refFor(path[path.length - 1].clone().sub(path[0])),
    capStart: options.caps === false ? undefined : 0.4, capEnd: options.caps === false ? undefined : 0.4,
    token, shade: options.shade, tone: options.tone
  });
}

/** A hewn plank, beam or post between two points: a chamfered box. */
export function timber(
  surface: SurfaceBuilder, from: V3 | THREE.Vector3, to: V3 | THREE.Vector3, half: readonly [number, number], token: number,
  options: { ref?: V3; shade?: number | ((face: FaceContext) => number); bevel?: number; halfEnd?: readonly [number, number]; bones?: Weights } = {}
): void {
  const a = vec(from);
  const b = vec(to);
  surface.addBox(v3(a), v3(b), half, {
    ref: options.ref ?? refFor(b.clone().sub(a)), token, shade: options.shade, bones: options.bones,
    bevel: options.bevel ?? Math.min(half[0], half[1]) * 0.3, halfEnd: options.halfEnd
  });
}

/** Deterministic lumpiness for ring vertices: the same station and angle always give the same bump. */
export function lumps(seed: number, amount: number): (station: number, theta: number) => number {
  return (station, theta) => {
    const x = Math.sin(station * 12.9898 + theta * 4.1414 + seed * 78.233) * 43758.5453;
    return 1 + (x - Math.floor(x) - 0.5) * 2 * amount;
  };
}

/**
 * A burlap sack standing on `base`: a slumped, lumpy body, a gathered neck bound with cord, and a
 * ruffled mouth. `size` is [width, depth, height]; `yaw` turns it, `lean` tips it.
 */
export function sack(
  surface: SurfaceBuilder, base: V3, size: readonly [number, number, number], cloth: number, cord: number,
  options: { seed?: number; yaw?: number; lean?: number; neck?: boolean } = {}
): void {
  const [w, d, h] = size;
  const yaw = options.yaw ?? 0;
  const lean = options.lean ?? 0;
  const neck = options.neck !== false;
  const axis = new THREE.Vector3(Math.sin(lean) * Math.cos(yaw), Math.cos(lean), Math.sin(lean) * Math.sin(yaw));
  const at = (t: number): V3 => v3(vec(base).addScaledVector(axis, t * h));
  // [height fraction, width fraction]; the neck stations bind with cord.
  const profile: ReadonlyArray<readonly [number, number]> = neck
    ? [[0.02, 0.8], [0.14, 1], [0.45, 1.03], [0.7, 0.9], [0.8, 0.5], [0.85, 0.2], [0.89, 0.2], [0.93, 0.3], [1, 0.38]]
    : [[0.02, 0.82], [0.15, 1], [0.5, 1.02], [0.82, 0.92], [0.95, 0.74], [1, 0.5]];
  const stations: Station[] = profile.map(([t, k]) => ({ p: at(t), w: (w / 2) * k, h: (d / 2) * k, n: 2.5 }));
  surface.addLoft(stations, {
    sides: 10, ref: [Math.sin(yaw), 0, Math.cos(yaw)], capStart: 0.2, capEnd: neck ? 0.1 : 0.35,
    radial: lumps(options.seed ?? 1, 0.06),
    token: ({ u }) => (neck && u > 4 && u < 6 ? cord : cloth),
    shade: ({ u }) => (neck && u >= 6 ? 1.02 : 1),
    tone: (p) => 0.88 + 0.12 * THREE.MathUtils.clamp((p.y - base[1]) / (h * 0.5), 0, 1)
  });
}

/**
 * A spoked cart wheel in the plane normal to X: a felloe rim, an iron tyre, a turned hub and tapered
 * spokes. `centre` is the hub centre.
 */
export function wheel(
  surface: SurfaceBuilder, centre: V3, radius: number, width: number, spokes: number,
  tokens: { rim: number; spoke: number; hub: number; tyre: number }, options: { segments?: number } = {}
): void {
  const c = vec(centre);
  const segments = options.segments ?? 20;
  const ring = (r: number): Station[] => Array.from({ length: segments + 1 }, (_, i) => {
    const angle = (i / segments) * Math.PI * 2;
    return { p: v3(c.clone().add(new THREE.Vector3(0, Math.cos(angle) * r, Math.sin(angle) * r))), w: 0, h: 0 };
  });
  const rimDepth = radius * 0.11;
  surface.addLoft(ring(radius - rimDepth / 2).map((s) => ({ ...s, w: rimDepth / 2, h: width / 2 })), {
    sides: 4, phase: Math.PI / 4, ref: [1, 0, 0], flat: true, token: tokens.rim,
    shade: ({ normal }) => (Math.abs(normal.x) > 0.7 ? 0.94 : 1)
  });
  surface.addLoft(ring(radius + radius * 0.018).map((s) => ({ ...s, w: radius * 0.026 * Math.SQRT2, h: width * 0.56 * Math.SQRT2 })), {
    sides: 4, phase: Math.PI / 4, ref: [1, 0, 0], flat: true, token: tokens.tyre
  });
  const hubR = radius * 0.2;
  surface.addLoft([
    { p: [c.x - width * 1.3, c.y, c.z], w: hubR * 0.55, h: hubR * 0.55 },
    { p: [c.x - width * 0.9, c.y, c.z], w: hubR * 0.8, h: hubR * 0.8 },
    { p: [c.x - width * 0.3, c.y, c.z], w: hubR, h: hubR },
    { p: [c.x + width * 0.3, c.y, c.z], w: hubR, h: hubR },
    { p: [c.x + width * 0.9, c.y, c.z], w: hubR * 0.8, h: hubR * 0.8 },
    { p: [c.x + width * 1.3, c.y, c.z], w: hubR * 0.55, h: hubR * 0.55 }
  ], { sides: 8, ref: [0, 1, 0], capStart: 0.3, capEnd: 0.3, token: tokens.hub });
  for (let k = 0; k < spokes; k += 1) {
    const angle = (k / spokes) * Math.PI * 2 + 0.2;
    const dir = new THREE.Vector3(0, Math.cos(angle), Math.sin(angle));
    timber(surface, c.clone().addScaledVector(dir, hubR * 0.85), c.clone().addScaledVector(dir, radius - rimDepth * 0.8),
      [width * 0.28, radius * 0.045], tokens.spoke, { ref: [1, 0, 0], halfEnd: [width * 0.22, radius * 0.032], bevel: radius * 0.008 });
  }
}

/**
 * A knotted net laid over `point(u, v)`: strands one third of a mesh wide around open square holes,
 * so it reads as netting from any side. `meshes` is [columns, rows] of open holes.
 */
export function net(
  surface: SurfaceBuilder, point: (u: number, v: number) => THREE.Vector3, meshes: readonly [number, number],
  token: number, thickness: number, options: { shade?: number; bones?: Weights } = {}
): void {
  const cols = meshes[0] * 3 + 1;
  const rows = meshes[1] * 3 + 1;
  surface.addPanel({
    cols, rows, thickness, point, bones: options.bones,
    inside: (u, v) => Math.floor(u * cols) % 3 === 0 || Math.floor(v * rows) % 3 === 0,
    token: () => token,
    shade: (u, v) => (options.shade ?? 1) * (Math.floor(u * cols) % 3 === 0 && Math.floor(v * rows) % 3 === 0 ? 0.86 : 1)
  });
}

/** A round fruit or vegetable with a short stem, squashed a little. */
export function fruit(
  surface: SurfaceBuilder, centre: V3, radius: number, token: number,
  options: { stem?: number; squash?: number; shade?: number } = {}
): void {
  const squash = options.squash ?? 0.88;
  surface.addLoft([
    { p: [centre[0], centre[1] - radius * squash, centre[2]], w: radius * 0.4, h: radius * 0.4 },
    { p: [centre[0], centre[1] - radius * squash * 0.4, centre[2]], w: radius * 0.96, h: radius * 0.96 },
    { p: [centre[0], centre[1] + radius * squash * 0.45, centre[2]], w: radius * 0.92, h: radius * 0.92 },
    { p: [centre[0], centre[1] + radius * squash, centre[2]], w: radius * 0.34, h: radius * 0.34 }
  ], { sides: 6, ref: [1, 0, 0], capStart: 0.3, capEnd: -0.2, token, shade: options.shade });
  if (options.stem !== undefined) {
    rope(surface, [[centre[0], centre[1] + radius * squash * 0.8, centre[2]], [centre[0] + radius * 0.12, centre[1] + radius * (squash + 0.3), centre[2]]],
      radius * 0.1, options.stem, { sides: 4, taper: [1, 0.6] });
  }
}

/**
 * A slatted crate standing on `base`, optionally heaped with fruit: two slats a side with daylight
 * between, darker corner posts, and a mound of `fill` that crowns above the rim.
 */
export function crate(
  surface: SurfaceBuilder, base: V3, size: readonly [number, number, number], wood: number, dark: number,
  options: { fill?: { tokens: readonly number[]; radius: number; stem?: number }; random?: () => number; yaw?: number } = {}
): void {
  const [w, d, h] = size;
  const random = options.random ?? Math.random;
  const yaw = options.yaw ?? 0;
  const o = vec(base);
  const local = (x: number, y: number, z: number): V3 =>
    v3(o.clone().add(new THREE.Vector3(x * Math.cos(yaw) + z * Math.sin(yaw), y, -x * Math.sin(yaw) + z * Math.cos(yaw))));
  const post = Math.min(w, d) * 0.07;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    timber(surface, local(x * (w / 2 - post), 0, z * (d / 2 - post)), local(x * (w / 2 - post), h, z * (d / 2 - post)), [post, post], dark);
  }
  const slat = h * 0.2;
  for (const y of [h * 0.22, h * 0.72]) {
    for (const z of [-1, 1]) {
      timber(surface, local(-w / 2, y, z * (d / 2 - post * 0.3)), local(w / 2, y, z * (d / 2 - post * 0.3)), [post * 0.35, slat], wood,
        { shade: 0.9 + random() * 0.12, bevel: 0 });
    }
    for (const x of [-1, 1]) {
      timber(surface, local(x * (w / 2 - post * 0.3), y, -d / 2), local(x * (w / 2 - post * 0.3), y, d / 2), [post * 0.35, slat], wood,
        { shade: 0.9 + random() * 0.12, bevel: 0 });
    }
  }
  timber(surface, local(-w / 2 + post, h * 0.05, 0), local(w / 2 - post, h * 0.05, 0), [d / 2 - post, h * 0.04], dark);
  if (options.fill) {
    const { tokens, radius, stem } = options.fill;
    const across = Math.max(1, Math.floor((w - post * 2) / (radius * 2)));
    const deep = Math.max(1, Math.floor((d - post * 2) / (radius * 2)));
    for (let i = 0; i < across; i += 1) {
      for (let j = 0; j < deep; j += 1) {
        const x = (i - (across - 1) / 2) * radius * 2;
        const z = (j - (deep - 1) / 2) * radius * 2;
        const crown = 1 - (Math.abs(x) / (w / 2) + Math.abs(z) / (d / 2)) * 0.35;
        fruit(surface, local(x + (random() - 0.5) * radius * 0.3, h * 0.72 + radius * crown, z + (random() - 0.5) * radius * 0.3),
          radius * (0.9 + random() * 0.2), tokens[Math.floor(random() * tokens.length)], { stem, shade: 0.92 + random() * 0.1 });
      }
    }
  }
}
